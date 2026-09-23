// Sell > Instagram: what the chatbot did, which nobody in the shop could see.
//
// The chatbot answers on Instagram and writes what happened to `analytics_events`
// (message_received, product_inquiry, order_created). Nothing read that collection, so 25 product
// questions a month arrived and left again unseen.
//
// The four figures at the top are the four views: people, questions, the orders the bot says it
// took, and the online orders actually recorded. Press one and its list is underneath.
//
// About `order_created`: it is the bot's own log line, not proof of an order. 146 were logged and
// 55 exist in `onlineOrders`. The 66 from Oct-Nov 2025 (the bot's first weeks) have no order at
// all; since December, most of the unmatched ones carry no amount, which is the bot logging an
// order it started and never finished. But two carried real money (EUR 199.86 on 9 Sep and
// EUR 1,657.86 on 12 Jun) and vanished - which is why every one of them is listed here, and why
// "Add to the app" writes the order the shop can then work from.
//
// What the data does NOT have: names, phone numbers, and the text of ordinary messages (only its
// length). Instagram gives the bot a scoped sender id, so a lead is "someone asked for X on this
// day", and the reply still happens in the Instagram inbox.
import { db, collection, getDocs, doc, updateDoc, query, where, orderBy, Timestamp } from './firebase.js';
import { esc, eur, int, icon, plural, day, ago, dateTime, money2, toast } from './ui.js';
import { DAY, toMs, squash, orderTime, orderTotal } from './data.js';
import { openNewOrder, orderDetail } from './online.js';

const PERIODS = [['30', '30 days'], ['90', '90 days'], ['365', '12 months']];
const state = { period: '30', only: 'all', view: 'questions', sender: null };

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
    return index.sort((a, b) => b.k.length - a.k.length);   // "sc3easyfix" should win over "sc3"
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

const topicsOf = text => { const hay = squash(text); return WORDS.filter(([, s]) => s.some(x => hay.includes(x))).map(([l]) => l); };
const visitor = id => 'visitor ' + (String(id || '').slice(-5) || '?');

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
    const events = docs.map(d => {
        const v = d.data();
        return { id: d.id, name: v.event_name, p: v.params || {}, handled: !!v.handled, linkedOrderId: v.linkedOrderId || null, t: toMs(v.timestamp) || toMs(v.created_at) };
    }).filter(e => !isNaN(e.t)).sort((a, b) => b.t - a.t);
    return (model._leads = events);
}

// "Nothing to do" and "Add to the app" are written onto the bot's own event, so the decision
// survives a reload. The bot only ever appends new events; it never reads these fields back.
async function markEvent(ev, fields) {
    await updateDoc(doc(db, 'analytics_events', ev.id), fields);
    ev.handled = !!fields.handled;
    if (fields.linkedOrderId) ev.linkedOrderId = fields.linkedOrderId;
}

// ---------------------------------------------------------------- screen

export async function renderLeads(ctx) {
    ctx.body.innerHTML = '<p class="empty">Reading the chatbot’s log…</p>';
    let events;
    try { events = await loadEvents(ctx.model); }
    catch (e) { ctx.body.innerHTML = `<p class="err">Couldn't read the chatbot log: ${esc(e.message)}</p>`; return; }

    const index = buildIndex(ctx.model.products);
    const orderById = new Map(ctx.model.orders.map(o => [o._id, o]));

    const draw = () => {
        const now = ctx.a.now, from = now - Number(state.period) * DAY;
        const period = events.filter(e => e.t >= from);

        const asked = period.filter(e => e.name === 'product_inquiry' && String(e.p.products || '').trim()).map(e => {
            const text = String(e.p.products).trim();
            return { ev: e, t: e.t, sender: String(e.p.sender_id || ''), text, hits: matchAsked(text, index), topics: topicsOf(text) };
        });
        const senders = new Map();
        period.forEach(e => {
            const id = e.p && e.p.sender_id; if (!id) return;
            const s = senders.get(id) || { id, messages: 0, questions: 0, first: e.t, last: e.t, asked: [] };
            if (e.name === 'message_received') s.messages++;
            if (e.name === 'product_inquiry') { s.questions++; if (e.p.products) s.asked.push(String(e.p.products)); }
            s.first = Math.min(s.first, e.t); s.last = Math.max(s.last, e.t);
            senders.set(id, s);
        });
        const botOrders = period.filter(e => e.name === 'order_created').map(e => ({
            ev: e, t: e.t, revenue: Number(e.p.revenue) || 0, items: Number(e.p.item_count) || 0,
            order: orderById.get(e.p.order_id) || (e.linkedOrderId ? orderById.get(e.linkedOrderId) : null) || null
        }));
        const lost = botOrders.filter(x => !x.order && !x.ev.handled);
        const lostMoney = lost.filter(x => x.revenue > 0);
        const orders = ctx.model.orders.filter(o => orderTime(o) >= from).sort((a, b) => orderTime(b) - orderTime(a));

        const inStock = asked.filter(x => x.hits.some(p => (Number(p.stock) || 0) > 0)).length;
        const outOfStock = asked.filter(x => x.hits.length && !x.hits.some(p => (Number(p.stock) || 0) > 0)).length;
        const noMatch = asked.filter(x => !x.hits.length).length;
        const lastMsg = events.find(e => e.name === 'message_received');

        ctx.setSub(`${plural(asked.length, 'question', 'questions')} from ${plural(senders.size, 'person', 'people')} · last message ${lastMsg ? ago(lastMsg.t, now) : 'never'}`);

        const tile = (id, label, value, detail, warn) => `
            <button class="kpi pick" type="button" data-view="${id}" aria-pressed="${state.view === id}">
                <small>${esc(label)}</small><span class="v"${warn ? ' style="color:var(--warn)"' : ''}>${value}</span><span class="d">${detail}</span></button>`;

        ctx.body.innerHTML = `
            <div class="toolbar">
                <div class="seg" role="group" aria-label="Period" id="lq-period">${PERIODS.map(([id, label]) => `<button type="button" data-p="${id}" aria-pressed="${id === state.period}">${label}</button>`).join('')}</div>
                <span class="muted" style="font-size:12.5px">Press a figure to see what is behind it.</span>
            </div>
            <div class="kpis" id="lq-tiles" role="group" aria-label="What to look at">
                ${tile('people', 'People who wrote', int(senders.size), `${plural(period.filter(e => e.name === 'message_received').length, 'message', 'messages')} in this period`)}
                ${tile('questions', 'Asked about a product', int(asked.length), `${int(inStock)} you have in stock · ${int(outOfStock)} out of stock · ${int(noMatch)} not recognised`)}
                ${tile('botorders', 'Orders the bot logged', int(botOrders.length), lost.length ? `${int(lost.length)} not in the app${lostMoney.length ? ` · ${int(lostMoney.length)} with money on ${lostMoney.length === 1 ? 'it' : 'them'}` : ''}` : botOrders.length ? 'all of them are in the app' : 'none in this period', lost.length > 0)}
                ${tile('orders', 'Online orders recorded', int(orders.length), 'in the same period')}
            </div>
            ${lostMoney.length ? `<div class="panel" style="padding:12px 16px;display:flex;gap:12px;align-items:center;border-color:#5a4320">${icon('warning')}<span class="muted" style="flex:1">${plural(lostMoney.length, 'order the bot logged carries', 'orders the bot logged carry')} money (${esc(lostMoney.map(x => eur(x.revenue)).join(', '))}) and ${lostMoney.length === 1 ? 'is' : 'are'} not in Online orders. Open <b>Orders the bot logged</b> and add ${lostMoney.length === 1 ? 'it' : 'them'}, or mark ${lostMoney.length === 1 ? 'it' : 'them'} as nothing to do.</span></div>` : ''}
            <div id="lq-view"></div>`;

        const view = ctx.body.querySelector('#lq-view');

        // ---- people
        if (state.view === 'people') {
            const list = [...senders.values()].sort((a, b) => b.last - a.last);
            view.innerHTML = `<div class="table-wrap" style="max-height:calc(100vh - 430px);min-height:240px"><table class="dt"><thead><tr>
                <th>Who</th><th>Last asked about</th><th class="n">Messages</th><th class="n">Questions</th><th class="n">First wrote</th><th class="n">Last wrote</th></tr></thead>
                <tbody id="lq-body">${list.map(s => `<tr data-sender="${esc(s.id)}" tabindex="0">
                    <td class="name"><b>${esc(visitor(s.id))}</b><span>Instagram</span></td>
                    <td class="muted" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.asked.length ? esc(s.asked[0]) : 'only messages, no product named'}</td>
                    <td class="n">${int(s.messages)}</td><td class="n${s.questions ? '' : ' muted'}">${int(s.questions)}</td>
                    <td class="n muted">${esc(day(s.first))}</td><td class="n muted">${esc(day(s.last))}</td></tr>`).join('')
                || '<tr><td colspan="6" class="muted" style="padding:18px">Nobody wrote in this period.</td></tr>'}</tbody></table>
                <div class="table-foot">Instagram gives the chatbot a sender id, not a name or a phone number. Press a row to see everything that person asked for.</div></div>`;
            view.querySelector('#lq-body').addEventListener('click', e => {
                const tr = e.target.closest('tr[data-sender]'); if (!tr) return;
                state.sender = tr.dataset.sender; state.view = 'questions'; state.only = 'all'; draw();
            });
        }

        // ---- questions
        if (state.view === 'questions') {
            const mine = state.sender ? asked.filter(x => x.sender === state.sender) : asked;
            const shown = mine.filter(x => state.only === 'all'
                || (state.only === 'stocked' && x.hits.some(p => (Number(p.stock) || 0) > 0))
                || (state.only === 'out' && x.hits.length && !x.hits.some(p => (Number(p.stock) || 0) > 0))
                || (state.only === 'none' && !x.hits.length));

            // What people ask for, grouped - the part that tells you what to stock.
            const demand = new Map();
            mine.forEach(x => (x.topics.length ? x.topics : ['Something else']).forEach(topic => {
                const d = demand.get(topic) || { topic, n: 0, products: new Map() };
                d.n++; x.hits.forEach(p => d.products.set(p._id, p)); demand.set(topic, d);
            }));
            const topics = [...demand.values()].sort((a, b) => b.n - a.n);

            view.innerHTML = `
                ${state.sender ? `<div class="filters"><button class="filter" type="button" id="lq-allpeople" aria-pressed="true">${icon('close')}Only ${esc(visitor(state.sender))} · show everyone</button></div>` : ''}
                <div class="panel">
                    <div class="viz-head"><h2 class="panel-title">What people ask for</h2></div>
                    ${topics.length ? `<div class="lines">${topics.map(t => `<div class="line"><div><b>${esc(t.topic)}</b><span>${t.products.size ? esc([...t.products.values()].slice(0, 3).map(p => p.name).join(', ')) : 'no catalogue product recognised'}</span></div><span class="n">${plural(t.n, 'question', 'questions')}</span></div>`).join('')}</div>`
                        : '<p class="empty">No product questions in this period.</p>'}
                    <p class="chart-note">Grouped by the words people use, not by what they bought. A topic you keep being asked about and don’t stock is a gap.</p>
                </div>
                <div class="filters" id="lq-only" role="group" aria-label="Show">
                    ${[['all', 'All', mine.length], ['stocked', 'You have it', mine.filter(x => x.hits.some(p => (Number(p.stock) || 0) > 0)).length],
                       ['out', 'Out of stock', mine.filter(x => x.hits.length && !x.hits.some(p => (Number(p.stock) || 0) > 0)).length],
                       ['none', 'Not recognised', mine.filter(x => !x.hits.length).length]]
                        .map(([id, label, n]) => `<button class="filter" type="button" data-o="${id}" aria-pressed="${state.only === id}">${label}<span class="n">${int(n)}</span></button>`).join('')}
                </div>
                <div class="table-wrap" style="max-height:calc(100vh - 660px);min-height:240px"><table class="dt"><thead><tr>
                    <th>When</th><th>Asked for</th><th>In your catalogue</th><th class="n">In stock</th><th class="n">Price</th><th></th></tr></thead>
                    <tbody id="lq-body">${shown.map((x, i) => {
                        const p = x.hits[0], stock = p ? Number(p.stock) || 0 : null;
                        return `<tr>
                            <td class="muted" style="white-space:nowrap">${esc(day(x.t))}<span class="muted" style="display:block;font-size:11px">${esc(visitor(x.sender))}</span></td>
                            <td style="max-width:280px">${esc(x.text)}${x.topics.length ? `<span class="muted" style="display:block;font-size:11px">${esc(x.topics.join(' · '))}</span>` : ''}</td>
                            <td>${p ? `<a href="stock.html?q=${encodeURIComponent(p.name)}#catalogue" style="text-decoration:none"><b>${esc(p.name)}</b></a>${x.hits.length > 1 ? `<span class="muted" style="display:block;font-size:11px">or ${esc(x.hits.slice(1).map(h => h.name).join(', '))}</span>` : ''}` : '<span class="muted">not recognised</span>'}</td>
                            <td class="n"${stock === 0 ? ' style="color:var(--bad)"' : ''}>${stock === null ? '–' : int(stock)}</td>
                            <td class="n">${p && Number(p.price) ? eur(Number(p.price)) : '<span class="muted">–</span>'}</td>
                            <td class="n">${p ? `<button class="btn small" type="button" data-order="${i}">${icon('add')}Add as order</button>` : ''}</td></tr>`;
                    }).join('') || '<tr><td colspan="6" class="muted" style="padding:18px">Nothing to show here.</td></tr>'}</tbody></table>
                    <div class="table-foot">Reply in the Instagram inbox. “Add as order” opens a new online order with the product filled in.</div></div>`;

            const all = view.querySelector('#lq-allpeople');
            if (all) all.addEventListener('click', () => { state.sender = null; draw(); });
            view.querySelector('#lq-only').addEventListener('click', e => { const b = e.target.closest('[data-o]'); if (b) { state.only = b.dataset.o; draw(); } });
            view.querySelector('#lq-body').addEventListener('click', e => {
                const b = e.target.closest('[data-order]'); if (!b) return;
                const x = shown[Number(b.dataset.order)], p = x.hits[0];
                openNewOrder(ctx, { source: 'Instagram', items: [{ name: p.name, quantity: 1, price: Number(p.price) || 0, id: p._id }] });
                toast(`Asked on ${day(x.t)}: “${x.text}”`);
            });
        }

        // ---- the orders the bot says it took
        if (state.view === 'botorders') {
            const list = botOrders.slice().sort((a, b) => b.t - a.t);
            view.innerHTML = `<div class="table-wrap" style="max-height:calc(100vh - 430px);min-height:240px"><table class="dt"><thead><tr>
                <th>When</th><th>In the app</th><th class="n">Items</th><th class="n">Amount</th><th></th></tr></thead>
                <tbody id="lq-body">${list.map((x, i) => `<tr>
                    <td class="muted" style="white-space:nowrap">${esc(dateTime(x.t))}</td>
                    <td>${x.order
                        ? `<b>${esc(x.order.clientName || x.order.customerName || 'Order')}</b><span class="muted" style="display:block;font-size:11px">${esc(x.order.status || 'Ordered')}</span>`
                        : x.ev.handled
                            ? '<span class="chip">nothing to do</span>'
                            : `<span class="chip bad">not in the app</span><span class="muted" style="display:block;font-size:11px">${x.revenue > 0 ? 'money was recorded on it' : 'no amount – usually an order the bot started'}</span>`}</td>
                    <td class="n">${int(x.items)}</td>
                    <td class="n"${x.revenue > 0 && !x.order ? ' style="color:var(--warn)"' : ''}>${x.revenue > 0 ? eur(x.revenue, 2) : '<span class="muted">–</span>'}</td>
                    <td class="n" style="white-space:nowrap">${x.order
                        ? `<button class="btn small ghost" type="button" data-open="${i}">${icon('open_in_new')}Open</button>`
                        : x.ev.handled
                            ? `<button class="btn small ghost" type="button" data-undo="${i}">${icon('undo')}Undo</button>`
                            : `<button class="btn small" type="button" data-add="${i}">${icon('add')}Add to the app</button>
                               <button class="btn small ghost" type="button" data-ignore="${i}">${icon('check')}Nothing to do</button>`}</td></tr>`).join('')
                || '<tr><td colspan="5" class="muted" style="padding:18px">The bot logged no orders in this period.</td></tr>'}</tbody></table>
                <div class="table-foot">“Add to the app” opens a new online order: the date and amount the bot recorded are shown, the customer and items are not in its log, so fill those in from the Instagram chat. Once saved, the row links to it.</div></div>`;

            view.querySelector('#lq-body').addEventListener('click', async e => {
                const open = e.target.closest('[data-open]'), add = e.target.closest('[data-add]'),
                    ignore = e.target.closest('[data-ignore]'), undo = e.target.closest('[data-undo]');
                if (open) { orderDetail(ctx, list[Number(open.dataset.open)].order); return; }
                if (ignore || undo) {
                    const x = list[Number(ignore ? ignore.dataset.ignore : undo.dataset.undo)];
                    try {
                        await markEvent(x.ev, ignore ? { handled: true, handledAt: Timestamp.now() } : { handled: false });
                        toast(ignore ? 'Marked as nothing to do' : 'Back on the list');
                        draw();
                    } catch (err) { toast(`Couldn't save that: ${err.message}`, { bad: true }); }
                    return;
                }
                if (add) {
                    const x = list[Number(add.dataset.add)];
                    openNewOrder(ctx, {
                        source: 'Instagram',
                        onSaved: async id => {
                            try { await markEvent(x.ev, { handled: true, handledAt: Timestamp.now(), linkedOrderId: id }); }
                            catch (err) { toast(`Order saved, but the chatbot log didn't update: ${err.message}`, { bad: true }); }
                        }
                    });
                    toast(`The bot logged this on ${day(x.t)}${x.revenue > 0 ? ` · €${money2(x.revenue)}` : ''} · ${plural(x.items, 'item', 'items')}`);
                }
            });
        }

        // ---- the online orders that really exist
        if (state.view === 'orders') {
            view.innerHTML = `<div class="table-wrap" style="max-height:calc(100vh - 430px);min-height:240px"><table class="dt"><thead><tr>
                <th>When</th><th>Customer</th><th>Items</th><th>Came from</th><th>Status</th><th class="n">Total</th></tr></thead>
                <tbody id="lq-body">${orders.map(o => {
                    const first = (o.items || [])[0];
                    return `<tr data-id="${esc(o._id)}" tabindex="0">
                        <td class="muted" style="white-space:nowrap">${esc(dateTime(orderTime(o)))}</td>
                        <td class="name"><b>${esc(o.clientName || o.customerName || 'No name')}</b><span>${esc(o.telephone || o.phoneNumber || 'no phone')}</span></td>
                        <td class="muted" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${first ? esc(`${Number(first.quantity) || 1} × ${first.name || '?'}`) + ((o.items || []).length > 1 ? ` +${(o.items || []).length - 1}` : '') : '–'}</td>
                        <td><span class="chip">${esc(o.source || 'Online')}</span></td>
                        <td>${esc(o.status || 'Ordered')}</td>
                        <td class="n">${eur(orderTotal(o), 2)}</td></tr>`;
                }).join('') || '<tr><td colspan="6" class="muted" style="padding:18px">No online order was recorded in this period.</td></tr>'}</tbody></table>
                <div class="table-foot">Press a row to change its status, edit it, take its items from stock, issue a warranty card or delete it.</div></div>`;
            const open = e => { const tr = e.target.closest('tr[data-id]'); if (tr) orderDetail(ctx, orderById.get(tr.dataset.id)); };
            view.querySelector('#lq-body').addEventListener('click', open);
            view.querySelector('#lq-body').addEventListener('keydown', e => { if (e.key === 'Enter') open(e); });
        }

        ctx.body.querySelector('#lq-period').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) { state.period = b.dataset.p; draw(); } });
        ctx.body.querySelector('#lq-tiles').addEventListener('click', e => {
            const b = e.target.closest('[data-view]'); if (!b) return;
            state.view = b.dataset.view;
            if (state.view !== 'questions') state.sender = null;
            draw();
        });
    };
    draw();
}
