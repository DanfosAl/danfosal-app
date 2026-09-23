// Sell > Instagram: the questions people ask the chatbot, which nobody in the shop could see.
//
// The chatbot answers on Instagram and writes what happened to `analytics_events`
// (message_received, product_inquiry, order_created). Nothing read that collection, so 25 product
// questions a month arrived and left again without anyone in the shop knowing. This screen shows
// them: what was asked, whether it is something you stock, and how many of the orders the bot
// says it created actually reached Online orders - 91 of 146 never did.
//
// What the data does NOT have: names, phone numbers and the text of ordinary messages. Instagram
// gives the bot a scoped sender id and nothing else, so a lead is "someone asked for X on this
// day", and the reply still happens in the Instagram inbox.
import { db, collection, getDocs, query, where, orderBy } from './firebase.js';
import { esc, eur, int, icon, plural, day, ago, toast } from './ui.js';
import { DAY, toMs, squash } from './data.js';
import { openNewOrder } from './online.js';

const PERIODS = [['30', '30 days'], ['90', '90 days'], ['365', '12 months']];
const state = { period: '30', only: 'all' };

// Albanian shop words, as they are actually typed. A question rarely names a model: it says
// "fshese me avull" (steam cleaner) or "solucion" (detergent), so this is what makes the demand
// summary readable. Spelling is loose on purpose - the squashed text is searched for each stem.
const WORDS = [
    ['Steam cleaners', ['avull', 'steam', 'sc1', 'sc2', 'sc3', 'sc4', 'sc5', 'sg42', 'sg44']],
    ['Upholstery / carpet washers', ['puzzi', 'tapet', 'divan', 'tapiceri', 'dyshek', 'karrike', 'qilim', 'moket']],
    ['Vacuums', ['fshes', 'vakum', 'vacuum', 'thith', 'aspirator', 'qese', 'thas', 'wd', 'nt2', 'nt3', 't11']],
    ['Pressure washers', ['presion', 'larje', 'lares', 'hds', 'k2', 'k3', 'k4', 'k5', 'k7']],
    ['Window cleaners', ['xham', 'dritare', 'wv1', 'wv2', 'wv5', 'wv6']],
    ['Detergents', ['solucion', 'detergjent', 'shampo', 'rm1', 'rm5', 'rm7', 'rm6']],
    ['Floor machines', ['dysheme', 'bd5', 'bd50', 'br3', 'fshirje', 'betoni', 'ambient']],
    ['Spare parts', ['filter', 'filtr', 'koka', 'kapak', 'valvul', 'bateri', 'rezine', 'bisht', 'pjes', 'zevendes']]
];

// A product is "named" in a question when its model number reads inside the squashed text:
// "sc3easyfix" contains "sc3", "Steam cleaner sg 4/4" contains "sg44". Only keys that mix letters
// and digits count - a key of plain words would match half the catalogue, because "Karcher" and
// "fshese" (vacuum) are in most names. That is what "not recognised" means in the table: the
// person described what they wanted instead of naming a model.
function productKeys(p) {
    const words = String(p.name || '').split(/\s+/).filter(Boolean);
    const keys = new Set();
    const ok = k => k.length >= 3 && /\d/.test(k) && /[a-z]/.test(k);
    for (let i = 0; i < words.length; i++) {
        for (let n = 1; n <= 3 && i + n <= words.length; n++) {
            const k = squash(words.slice(i, i + n).join(' '));
            if (ok(k)) keys.add(k);
        }
    }
    const code = squash(p.code || '');
    if (code.length >= 6) keys.add(code);
    return [...keys];
}

function buildIndex(products) {
    const index = [];
    products.forEach(p => productKeys(p).forEach(k => index.push({ k, p })));
    // Longest key first: "sc3easyfix" should win over "sc3".
    return index.sort((a, b) => b.k.length - a.k.length);
}

function matchAsked(text, index) {
    const hay = squash(text);
    if (!hay) return [];
    const out = [], seen = new Set();
    for (const { k, p } of index) {
        if (out.length >= 3) break;
        if (seen.has(p._id) || !hay.includes(k)) continue;
        seen.add(p._id); out.push(p);
    }
    return out;
}

function topicsOf(text) {
    const hay = squash(text);
    return WORDS.filter(([, stems]) => stems.some(s => hay.includes(s))).map(([label]) => label);
}

// ---------------------------------------------------------------- loading

// 6,769 events is more than any screen needs, so only the last year is read, and only once.
async function loadEvents(model) {
    if (model._leads) return model._leads;
    const since = new Date(Date.now() - 366 * DAY);
    let docs;
    try {
        docs = (await getDocs(query(collection(db, 'analytics_events'), where('timestamp', '>=', since), orderBy('timestamp', 'desc')))).docs;
    } catch {
        docs = (await getDocs(collection(db, 'analytics_events'))).docs;    // no index yet: read it all
    }
    const events = docs.map(d => { const v = d.data(); return { id: d.id, name: v.event_name, p: v.params || {}, t: toMs(v.timestamp) || toMs(v.created_at) }; })
        .filter(e => !isNaN(e.t)).sort((a, b) => b.t - a.t);
    return (model._leads = events);
}

// ---------------------------------------------------------------- screen

export async function renderLeads(ctx) {
    ctx.body.innerHTML = '<p class="empty">Reading the chatbot\'s log…</p>';
    let events;
    try { events = await loadEvents(ctx.model); }
    catch (e) { ctx.body.innerHTML = `<p class="err">Couldn't read the chatbot log: ${esc(e.message)}</p>`; return; }

    const index = buildIndex(ctx.model.products);
    const orderIds = new Set(ctx.model.orders.map(o => o._id));

    const draw = () => {
        const now = ctx.a.now, from = now - Number(state.period) * DAY;
        const inP = e => e.t >= from;
        const period = events.filter(inP);
        const asked = period.filter(e => e.name === 'product_inquiry' && String(e.p.products || '').trim())
            .map(e => {
                const text = String(e.p.products).trim();
                const hits = matchAsked(text, index);
                return { t: e.t, sender: String(e.p.sender_id || ''), text, hits, topics: topicsOf(text) };
            });
        const senders = new Set(period.map(e => e.p && e.p.sender_id).filter(Boolean));
        const botOrders = period.filter(e => e.name === 'order_created');
        const landed = botOrders.filter(e => orderIds.has(e.p.order_id));
        const lost = botOrders.length - landed.length;
        const inStock = asked.filter(x => x.hits.some(p => (Number(p.stock) || 0) > 0)).length;
        const outOfStock = asked.filter(x => x.hits.length && !x.hits.some(p => (Number(p.stock) || 0) > 0)).length;
        const noMatch = asked.filter(x => !x.hits.length).length;
        const lastMsg = events.find(e => e.name === 'message_received');

        // What people ask for, grouped - the part that tells you what to stock.
        const demand = new Map();
        asked.forEach(x => (x.topics.length ? x.topics : ['Something else']).forEach(topic => {
            const d = demand.get(topic) || { topic, n: 0, products: new Map() };
            d.n++;
            x.hits.forEach(p => d.products.set(p._id, p));
            demand.set(topic, d);
        }));
        const topics = [...demand.values()].sort((a, b) => b.n - a.n);

        const shown = asked.filter(x => state.only === 'all'
            || (state.only === 'stocked' && x.hits.some(p => (Number(p.stock) || 0) > 0))
            || (state.only === 'out' && x.hits.length && !x.hits.some(p => (Number(p.stock) || 0) > 0))
            || (state.only === 'none' && !x.hits.length));

        ctx.setSub(`${plural(asked.length, 'question', 'questions')} from ${plural(senders.size, 'person', 'people')} · last message ${lastMsg ? ago(lastMsg.t, now) : 'never'}`);

        ctx.body.innerHTML = `
            <div class="toolbar">
                <div class="seg" role="group" aria-label="Period" id="lq-period">${PERIODS.map(([id, label]) => `<button type="button" data-p="${id}" aria-pressed="${id === state.period}">${label}</button>`).join('')}</div>
            </div>
            <div class="kpis">
                <div class="kpi"><small>People who wrote</small><span class="v">${int(senders.size)}</span><span class="d">${plural(period.filter(e => e.name === 'message_received').length, 'message', 'messages')} in this period</span></div>
                <div class="kpi"><small>Asked about a product</small><span class="v">${int(asked.length)}</span><span class="d">${int(inStock)} you have in stock · ${int(outOfStock)} out of stock · ${int(noMatch)} not recognised</span></div>
                <div class="kpi"><small>Orders the bot logged</small><span class="v"${lost ? ' style="color:var(--warn)"' : ''}>${int(botOrders.length)}</span><span class="d">${lost ? `${int(lost)} never arrived in Online orders` : botOrders.length ? 'all of them arrived' : 'none in this period'}</span></div>
                <div class="kpi"><small>Online orders recorded</small><span class="v">${int(ctx.model.orders.filter(o => (toMs(o.timestamp) || toMs(o.orderDate)) >= from).length)}</span><span class="d">in the same period</span></div>
            </div>
            ${lost ? `<div class="panel" style="padding:12px 16px;display:flex;gap:12px;align-items:center;border-color:#5a4320">${icon('warning')}<span class="muted" style="flex:1">The chatbot says it created ${plural(botOrders.length, 'order', 'orders')} in this period, but ${int(lost)} of them ${lost === 1 ? 'is' : 'are'} not in Online orders — so ${lost === 1 ? 'that customer was' : 'those customers were'} never served from here. Ask whoever runs the chatbot to send its orders to the app; until then, enter them with “Add as order” below.</span></div>` : ''}

            <div class="panel">
                <div class="viz-head"><h2 class="panel-title">What people ask for</h2></div>
                ${topics.length ? `<div class="lines">${topics.map(t => `<div class="line"><div><b>${esc(t.topic)}</b><span>${t.products.size ? esc([...t.products.values()].slice(0, 3).map(p => p.name).join(', ')) : 'no catalogue product recognised'}</span></div><span class="n">${plural(t.n, 'question', 'questions')}</span></div>`).join('')}</div>`
                    : '<p class="empty">No product questions in this period.</p>'}
                <p class="chart-note">Grouped by the words people use, not by what they bought. A topic you keep being asked about and don’t stock is a gap.</p>
            </div>

            <div class="filters" id="lq-only" role="group" aria-label="Show">
                ${[['all', 'All', asked.length], ['stocked', 'You have it', inStock], ['out', 'Out of stock', outOfStock], ['none', 'Not recognised', noMatch]]
                    .map(([id, label, n]) => `<button class="filter" type="button" data-o="${id}" aria-pressed="${state.only === id}">${label}<span class="n">${int(n)}</span></button>`).join('')}
            </div>
            <div class="table-wrap" style="max-height:calc(100vh - 620px);min-height:240px"><table class="dt"><thead><tr>
                <th>When</th><th>Asked for</th><th>In your catalogue</th><th class="n">In stock</th><th class="n">Price</th><th></th></tr></thead>
                <tbody id="lq-body">${shown.map((x, i) => {
                    const p = x.hits[0];
                    const stock = p ? Number(p.stock) || 0 : null;
                    return `<tr>
                        <td class="muted" style="white-space:nowrap">${esc(day(x.t))}<span class="muted" style="display:block;font-size:11px">visitor ${esc(x.sender.slice(-5) || '?')}</span></td>
                        <td style="max-width:280px">${esc(x.text)}${x.topics.length ? `<span class="muted" style="display:block;font-size:11px">${esc(x.topics.join(' · '))}</span>` : ''}</td>
                        <td>${p ? `<a href="stock.html?q=${encodeURIComponent(p.name)}#catalogue" style="text-decoration:none"><b>${esc(p.name)}</b></a>${x.hits.length > 1 ? `<span class="muted" style="display:block;font-size:11px">or ${esc(x.hits.slice(1).map(h => h.name).join(', '))}</span>` : ''}` : '<span class="muted">not recognised</span>'}</td>
                        <td class="n"${stock === 0 ? ' style="color:var(--bad)"' : ''}>${stock === null ? '–' : int(stock)}</td>
                        <td class="n">${p && Number(p.price) ? eur(Number(p.price)) : '<span class="muted">–</span>'}</td>
                        <td class="n">${p ? `<button class="btn small" type="button" data-order="${i}">${icon('add')}Add as order</button>` : ''}</td></tr>`;
                }).join('') || '<tr><td colspan="6" class="muted" style="padding:18px">Nothing to show here.</td></tr>'}</tbody></table>
                <div class="table-foot">Instagram gives the chatbot a sender id, not a name or phone number, so reply in the Instagram inbox. “Add as order” opens a new online order with the product filled in.</div></div>`;

        ctx.body.querySelector('#lq-period').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) { state.period = b.dataset.p; draw(); } });
        ctx.body.querySelector('#lq-only').addEventListener('click', e => { const b = e.target.closest('[data-o]'); if (b) { state.only = b.dataset.o; draw(); } });
        ctx.body.querySelector('#lq-body').addEventListener('click', e => {
            const b = e.target.closest('[data-order]'); if (!b) return;
            const x = shown[Number(b.dataset.order)], p = x.hits[0];
            openNewOrder(ctx, { source: 'Instagram', items: [{ name: p.name, quantity: 1, price: Number(p.price) || 0, id: p._id }] });
            toast(`Asked on ${day(x.t)}: “${x.text}”`);
        });
    };
    draw();
}
