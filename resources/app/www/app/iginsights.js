// What the Instagram chats are worth beyond answering them (owner, 19 Nov 2026: ideas 1, 2, 8, 10, 11).
//
// Two sources of product questions:
//   - the bot's memory, `instagramBotChats` (since 19 Nov 2026): each chat's `askedProducts` with
//     the catalogue id and the stock at the moment it was asked, its `firstSource`, its messages'
//     times, and `lastOrderAt` once the bot made an order from it;
//   - the chatbot's older log, `analytics_events` product_inquiry (Oct 2025 on): free text,
//     matched to the catalogue here by model number ("sc3", "rm 519").
// From those:
//   backInStock  - people who asked for something while it was out of stock; it is in stock again
//   idleOffers   - stock that hasn't sold in 90 days, and the people who asked for that product or model
//   askedReport  - what people ask for, per product: in stock, out of stock, not in the catalogue
//   askedCounts  - questions per catalogue product in 6 months (Stock › Next order)
//   sourcesReport- which ads, stories, posts and links start chats, and how many became orders
//   answerSpeed  - how fast the shop answered a new question, against how often it became an order
//   demandTrend  - products asked about more in the last 30 days than before (order earlier)
//   postIdeas    - what to post about this week, from all of the above
//   botHealth    - the bot gone quiet, or unable to read (settings/instagramBot)
// Learned words (`productAliases`, Finding #84): "fshese e vogel" means WD 1 - taught in Asked for
// (This means...) or learned when the owner corrects a bot order; used here and by the bot.
// Pure functions: no Firestore, no DOM. Private chats are left out everywhere.

const DAY = 86400000;
export const squash = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// The Instagram business account's own id (17 digits from 1784...). The old chatbot logged the
// shop's own replies under it (fixed 19 Nov 2026), so it is never a customer.
export const isShopAccount = id => /^1784\d{13}$/.test(String(id || ''));

// ---------------------------------------------------------------- matching text to the catalogue

// A product is "named" in a question when its model number reads inside the squashed text:
// "sc3easyfix" contains "sc3". Only keys that mix letters and digits count.
// A variant letter glued to the size reads as its own word: "BD 35/15C" is also "BD 35/15", which
// is how people write it (20 Nov 2026). Only after "35/15"-style numbers, so "5L" and "230V" stay.
export function productKeys(p) {
    const words = String(p.name || '').replace(/(\d\/\d+)([a-z])(?![a-z0-9])/gi, '$1 $2').split(/\s+/).filter(Boolean);
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

export function buildIndex(products) {
    const index = [];
    products.forEach(p => productKeys(p).forEach(k => index.push({ k, p })));
    return index.sort((a, b) => b.k.length - a.k.length);   // "sc3easyfix" should win over "sc3"
}

export function matchAsked(text, index) {
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

// Learned words: productAliases docs [{text, productId}] -> Map(squash(text) -> productId).
export const aliasKey = text => squash(text).slice(0, 120);
export const aliasMap = (docs = []) => new Map(docs.filter(a => a && a.text && a.productId).map(a => [aliasKey(a.text), a.productId]));

// The catalogue products a logged question names, up to 3: a word the owner taught first ("BD 35"
// = BD 35/15C, taught in Asked for), then model numbers. The same rule allAsks uses for the log.
export function matchQuestion(text, index, aliases = new Map(), byId = new Map()) {
    const out = [];
    for (const part of String(text || '').split(/[,;]/)) {
        const t = part.trim();
        if (!squash(t)) continue;
        const p = byId.get(aliases.get(aliasKey(t)) || aliases.get(aliasKey(modelOf(t))));
        if (p && !out.includes(p)) out.push(p);
    }
    return [...out, ...matchAsked(text, index).filter(p => !out.includes(p))].slice(0, 3);
}

// Correcting a bot order teaches a word: when exactly one item the bot couldn't match (no id) was
// replaced by exactly one catalogue product. -> {text, productId} or null.
export function aliasFromCorrection(before = [], after = []) {
    const unknown = before.filter(i => i && !i.id && i.name && i.name !== '00');
    const added = after.filter(i => i && i.id && !before.some(b => b && b.id === i.id));
    const gone = unknown.filter(u => !after.some(a => a && !a.id && a.name === u.name));
    if (gone.length !== 1 || added.length !== 1 || !aliasKey(gone[0].name)) return null;
    return { text: gone[0].name, productId: added[0].id };
}

// "SC 3 EasyFix" -> "SC 3", "rm519" -> "RM 519": the first model number in a name.
export function modelOf(text) {
    const m = String(text || '').match(/\b([a-z]{1,4})\s*-?\s*(\d{1,4})\b/i);
    return m ? `${m[1].toUpperCase()} ${m[2].replace(/^0+(?=\d)/, '')}` : '';
}

// ---------------------------------------------------------------- every product question

// [{sender, t, id, name, stockThen, from}] - one per person, product and day. The bot's own record
// wins over the log line it also wrote for the same question.
export function allAsks({ chats = [], events = [], products = [], aliases = new Map() } = {}) {
    const privateIds = new Set(chats.filter(c => c.ignored).map(c => c._id));
    const byId = new Map(products.map(p => [p._id, p]));
    const out = [], seen = new Set();
    const key = (sender, idOrName, t) => `${sender}|${idOrName}|${Math.floor(t / DAY)}`;
    for (const c of chats) {
        if (c.ignored) continue;
        for (const a of c.askedProducts || []) {
            if (!a || !a.name || !a.at) continue;
            const learned = !a.id ? aliases.get(aliasKey(a.name)) : null;
            const id = a.id && byId.has(a.id) ? a.id : learned && byId.has(learned) ? learned : null;
            const k = key(c._id, id || squash(a.name), a.at);
            if (seen.has(k)) continue;
            seen.add(k);
            out.push({ sender: c._id, t: a.at, id, name: id ? byId.get(id).name : a.name, stockThen: Number.isFinite(a.stock) ? a.stock : null, from: 'bot' });
        }
    }
    const index = buildIndex(products);
    for (const e of events) {
        if (e.event_name !== 'product_inquiry' || !e.t) continue;
        const sender = String((e.params || {}).sender_id || '');
        if (!sender || isShopAccount(sender) || privateIds.has(sender)) continue;
        for (const part of String((e.params || {}).products || '').split(/[,;]/)) {
            const text = part.trim();
            if (!squash(text)) continue;
            const learned = aliases.get(aliasKey(text)) || aliases.get(aliasKey(modelOf(text)));
            const hit = learned && byId.has(learned) ? byId.get(learned) : matchAsked(text, index)[0];
            const id = hit ? hit._id : null;
            const k = key(sender, id || squash(text), e.t);
            if (seen.has(k)) continue;
            seen.add(k);
            out.push({ sender, t: e.t, id, name: hit ? hit.name : text, stockThen: null, from: 'log' });
        }
    }
    return out.sort((a, b) => b.t - a.t);
}

// Did this person order from the bot after asking? Only chats the bot made an order from know it.
const orderedSince = (chatsById, sender, t) => { const c = chatsById.get(sender); return !!(c && c.lastOrderAt && c.lastOrderAt >= t); };

// ---------------------------------------------------------------- 1. back in stock

export function backInStock(asks, products, chats = [], now = Date.now(), { days = 120 } = {}) {
    const byId = new Map(products.map(p => [p._id, p]));
    const chatsById = new Map(chats.map(c => [c._id, c]));
    const groups = new Map();
    for (const a of asks) {
        const p = a.id && byId.get(a.id);
        if (!p || (Number(p.stock) || 0) <= 0 || now - a.t > days * DAY) continue;
        const restocked = Number(p.lastRestockDate) || 0;
        const wasOut = a.stockThen === 0 || (restocked > a.t);
        if (!wasOut || orderedSince(chatsById, a.sender, a.t)) continue;
        const g = groups.get(p._id) || { product: p, people: new Map() };
        const prev = g.people.get(a.sender);
        if (!prev || prev.t < a.t) g.people.set(a.sender, { sender: a.sender, t: a.t });
        groups.set(p._id, g);
    }
    return [...groups.values()].map(g => ({ product: g.product, people: [...g.people.values()].sort((a, b) => b.t - a.t) }))
        .sort((a, b) => b.people.length - a.people.length || (Number(b.product.lastRestockDate) || 0) - (Number(a.product.lastRestockDate) || 0));
}

// ---------------------------------------------------------------- 2. idle stock -> people to offer it to

// unsold: [{product, stock, value}] (Danfosal's rule: in stock, nothing sold in 90 days).
export function idleOffers(unsold, asks, chats = [], now = Date.now(), { days = 90 } = {}) {
    const chatsById = new Map(chats.map(c => [c._id, c]));
    const recent = asks.filter(a => now - a.t <= days * DAY);
    return unsold.map(u => {
        const model = modelOf(u.product.name);
        const people = new Map();
        for (const a of recent) {
            const same = a.id === u.product._id;
            const sameModel = !same && model && modelOf(a.name) === model;
            if (!(same || sameModel) || orderedSince(chatsById, a.sender, a.t)) continue;
            const prev = people.get(a.sender);
            if (!prev || prev.t < a.t) people.set(a.sender, { sender: a.sender, t: a.t, asked: a.name, exact: same });
        }
        return { ...u, people: [...people.values()].sort((a, b) => b.t - a.t) };
    }).filter(x => x.people.length).sort((a, b) => (b.value || 0) - (a.value || 0));
}

// ---------------------------------------------------------------- 8. what people ask for

export function askedReport(asks, products, now = Date.now(), { days = 90 } = {}) {
    const byId = new Map(products.map(p => [p._id, p]));
    const rows = new Map();
    for (const a of asks) {
        if (now - a.t > days * DAY) continue;
        const p = a.id && byId.get(a.id);
        const k = p ? 'id:' + p._id : 'model:' + (modelOf(a.name) || squash(a.name));
        const r = rows.get(k) || { key: k, name: p ? p.name : (modelOf(a.name) || a.name), product: p || null, people: new Set(), asks: 0, last: 0 };
        r.people.add(a.sender); r.asks++; r.last = Math.max(r.last, a.t);
        rows.set(k, r);
    }
    return [...rows.values()].map(r => ({
        key: r.key, name: r.name, product: r.product, people: r.people.size, asks: r.asks, last: r.last,
        status: !r.product ? 'none' : (Number(r.product.stock) || 0) > 0 ? 'in' : 'out'
    })).sort((a, b) => b.people - a.people || b.last - a.last);
}

// Questions per catalogue product in the last 6 months, for Stock › Next order.
export function askedCounts(asks, now = Date.now()) {
    const out = new Map();
    for (const a of asks) {
        if (!a.id || now - a.t > 183 * DAY) continue;
        const x = out.get(a.id) || { questions_6m: 0, people: new Set() };
        x.questions_6m++; x.people.add(a.sender);
        out.set(a.id, x);
    }
    return out;
}

// ---------------------------------------------------------------- 10. where chats come from

export const SOURCE_LABEL = { ad: 'Ad', story: 'Story reply', post: 'Shared post or reel', mention: 'Story mention', link: 'Link', direct: 'Wrote directly' };

export function sourcesReport(chats, now = Date.now(), { days = 90 } = {}) {
    const rows = new Map();
    for (const c of chats) {
        if (c.ignored) continue;
        const first = Math.min(...[c.firstSource && c.firstSource.at, c.lastCustomerAt].filter(Boolean));
        if (!Number.isFinite(first) || now - first > days * DAY) continue;
        const s = c.firstSource && c.firstSource.key ? c.firstSource : { kind: 'direct', key: 'direct', title: '', url: '' };
        const r = rows.get(s.key) || { key: s.key, kind: s.kind, title: s.title || '', url: s.url || '', chats: 0, orders: 0, last: 0 };
        r.chats++; if (c.lastOrderId) r.orders++; r.last = Math.max(r.last, first);
        rows.set(s.key, r);
    }
    return [...rows.values()].sort((a, b) => b.chats - a.chats || b.orders - a.orders);
}

// ---------------------------------------------------------------- 11. answer speed against orders

export const SPEED_BUCKETS = [
    { label: 'within 15 minutes', max: 15 }, { label: '15 minutes to 1 hour', max: 60 }, { label: '1 to 4 hours', max: 240 },
    { label: '4 to 24 hours', max: 1440 }, { label: 'more than a day', max: Infinity }, { label: 'not answered', max: null }
];

// talks: [{lastOrderAt, messages: [{at, role}]}] (times only). A new question = a customer
// message after 6 quiet hours (or the first one); its answer = the shop's next message.
export function answerSpeed(talks, now = Date.now(), { gapHours = 6, orderWithinDays = 14 } = {}) {
    const rows = SPEED_BUCKETS.map(b => ({ ...b, questions: 0, orders: 0 }));
    const minutes = [];
    for (const talk of talks) {
        const msgs = (talk.messages || []).filter(m => m && m.at).slice().sort((a, b) => a.at - b.at);
        let prevAt = 0;
        for (let i = 0; i < msgs.length; i++) {
            const m = msgs[i];
            const opens = m.role !== 'shop' && (!prevAt || m.at - prevAt >= gapHours * 3600000);
            prevAt = m.at;
            if (!opens) continue;
            const reply = msgs.slice(i + 1).find(x => x.role === 'shop');
            if (!reply && now - m.at < DAY) continue;                     // still open: too early to say
            const row = reply ? rows.find(r => r.max !== null && (reply.at - m.at) / 60000 < r.max) : rows[rows.length - 1];
            row.questions++;
            if (talk.lastOrderAt && talk.lastOrderAt >= m.at && talk.lastOrderAt - m.at <= orderWithinDays * DAY) row.orders++;
            if (reply) minutes.push((reply.at - m.at) / 60000);
        }
    }
    minutes.sort((a, b) => a - b);
    return { rows, median: minutes.length ? minutes[Math.floor(minutes.length / 2)] : null, questions: rows.reduce((s, r) => s + r.questions, 0) };
}

// ---------------------------------------------------------------- 8. demand rising

// Products (or models not in the catalogue) asked about by more people in the last 30 days than
// usual: at least 3 people, and at least twice the monthly average of the 90 days before.
export function demandTrend(asks, products, now = Date.now(), { recentDays = 30, baseDays = 90, minPeople = 3 } = {}) {
    const byId = new Map(products.map(p => [p._id, p]));
    const rows = new Map();
    for (const a of asks) {
        const age = now - a.t;
        if (age > (recentDays + baseDays) * DAY) continue;
        const p = a.id && byId.get(a.id);
        const k = p ? 'id:' + p._id : 'model:' + (modelOf(a.name) || squash(a.name));
        const r = rows.get(k) || { key: k, name: p ? p.name : (modelOf(a.name) || a.name), product: p || null, recent: new Set(), before: new Set() };
        (age <= recentDays * DAY ? r.recent : r.before).add(a.sender);
        rows.set(k, r);
    }
    return [...rows.values()].map(r => {
        const usual = r.before.size * recentDays / baseDays;
        return { key: r.key, name: r.name, product: r.product, recent: r.recent.size, usual: Math.round(usual * 10) / 10,
            ratio: r.recent.size / Math.max(usual, 0.5) };
    }).filter(r => r.recent >= minPeople && r.ratio >= 2).sort((a, b) => b.ratio - a.ratio || b.recent - a.recent);
}

// ---------------------------------------------------------------- 9. what to post this week

// Ideas, strongest first: back in stock, what people keep asking for (in stock), what's asked more
// than usual, and unsold stock worth an offer. Each with the reason and a caption to start from
// (Albanian, plain; the owner edits it).
export function postIdeas({ backIn = [], asked = [], trend = [], unsold = [] } = {}, { max = 6 } = {}) {
    const ideas = [], seen = new Set();
    const add = (p, kind, why, caption) => { if (!p || seen.has(p._id)) return; seen.add(p._id); ideas.push({ product: p, kind, why, caption }); };
    const price = p => Number(p.price) ? ` ${Math.round(Number(p.price))} €.` : '';
    backIn.forEach(g => add(g.product, 'back', `Back in stock - ${g.people.length} ${g.people.length === 1 ? 'person' : 'people'} asked while it was out`,
        `${g.product.name} është sërish në gjendje!${price(g.product)} Na shkruani në DM për porosi dhe dërgesë.`));
    trend.filter(t => t.product && (Number(t.product.stock) || 0) > 0).forEach(t => add(t.product, 'rising', `Asked about more than usual: ${t.recent} people in 30 days`,
        `Shumë pyetje këto ditë për ${t.product.name} - e kemi në gjendje.${price(t.product)} Na shkruani në DM!`));
    asked.filter(r => r.status === 'in' && r.people >= 2).forEach(r => add(r.product, 'asked', `${r.people} people asked about it lately - show it working`,
        `Si punon ${r.product.name}? Shikoni videon!${price(r.product)} Në gjendje - na shkruani në DM.`));
    unsold.filter(u => u.product && (u.value || 0) > 0).slice(0, 3).forEach(u => add(u.product, 'offer', `${u.stock} on the shelf, not sold in 90 days - an offer of the week`,
        `Oferta e javës: ${u.product.name}. Sasi e kufizuar - na shkruani në DM për çmimin.`));
    return ideas.slice(0, max);
}

// ---------------------------------------------------------------- 7. the bot's health

// status = settings/instagramBot {lastWebhookAt, lastCustomerMessageAt, lastAiOkAt, lastAiError {at, provider, message}}.
// -> {sev, title, why} or null. Quiet = no customer message for 3 days (it usually gets about one a day).
// The bot reads with OpenAI since 20 Nov 2026 (Gemini before; older errors carry no provider).
export function botHealth(status, now = Date.now(), { quietDays = 3 } = {}) {
    if (!status) return null;
    const err = status.lastAiError || null;
    if (err && err.at && err.at > (status.lastAiOkAt || 0)) {
        const msg = String(err.message || '');
        const provider = err.provider || (/openai/i.test(msg) ? 'OpenAI' : 'Gemini');
        const openai = provider === 'OpenAI';
        const credit = /credit|prepay|billing|spending cap|quota|429|402/i.test(msg);
        const badKey = /401|unauthenticated|invalid_api_key|incorrect api key|api key not valid/i.test(msg);
        const tail = 'until then messages arrive but no orders are written.';
        return { sev: 'crit', title: 'The Instagram bot can’t read orders',
            why: credit ? `Its ${provider} key has run out of credit or hit its spending cap. Top it up in ${openai ? 'OpenAI (platform.openai.com › Billing)' : 'Google AI Studio'}; ${tail}`
                : badKey ? `Its ${provider} key doesn’t work any more. Put a working key in Render (instagram-chatbot › Environment › ${openai ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'}); ${tail}`
                : `Its last attempt failed (${msg.slice(0, 120) || 'unknown error'}). Messages still arrive; orders aren't written until it reads again.` };
    }
    const last = Math.max(status.lastCustomerMessageAt || 0, 0);
    if (last && now - last > quietDays * DAY) {
        return { sev: 'warn', title: 'The Instagram bot hasn’t received a customer message for ' + Math.floor((now - last) / DAY) + ' days',
            why: 'If customers wrote in that time, the bot isn’t getting their messages - check its webhook in Meta (Danfosal Orders › Webhooks › Instagram) and that the bot is running on Render.' };
    }
    return null;
}

// ---------------------------------------------------------------- 6. the bot's report card

// Of the orders the new bot wrote (ids "ig-...", from 19 Nov 2026), per week: kept as written,
// corrected by the owner (which fields - ownerEdits, written by Online orders when he saves a
// change), or deleted (the bot logged order_created, the order is gone).
// events: [{event_name, t, params: {order_id}}]; weeks: newest first.
export function botReportCard(orders = [], events = [], now = Date.now(), { weeks = 8 } = {}) {
    const byId = new Map(orders.map(o => [o._id, o]));
    const weekStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
    const rows = new Map();
    const seen = new Set();
    for (const e of events) {
        const id = String((e.params || {}).order_id || '');
        if (e.event_name !== 'order_created' || !id.startsWith('ig-') || seen.has(id) || !e.t || now - e.t > weeks * 7 * DAY) continue;
        seen.add(id);
        const w = weekStart(e.t);
        const r = rows.get(w) || { week: w, written: 0, kept: 0, corrected: 0, deleted: 0, fields: {} };
        const o = byId.get(id);
        r.written++;
        if (!o) r.deleted++;
        else if (o.ownerEdits && (o.ownerEdits.fields || []).length) { r.corrected++; o.ownerEdits.fields.forEach(f => { r.fields[f] = (r.fields[f] || 0) + 1; }); }
        else r.kept++;
        rows.set(w, r);
    }
    const list = [...rows.values()].sort((a, b) => b.week - a.week);
    const all = list.reduce((s, r) => ({ written: s.written + r.written, kept: s.kept + r.kept }), { written: 0, kept: 0 });
    return { weeks: list, written: all.written, kept: all.kept, rate: all.written ? Math.round(100 * all.kept / all.written) : null };
}

// Which fields the owner changed on a bot order (Online orders > Edit), for the report card.
export function changedFields(before = {}, after = {}) {
    const norm = s => String(s || '').trim().toLowerCase();
    const items = o => JSON.stringify((o.items || []).map(i => [i.id || norm(i.name), Number(i.quantity) || 1]).sort());
    const prices = o => JSON.stringify((o.items || []).map(i => Math.round((Number(i.price) || 0) * 100)).sort());
    const out = [];
    if (norm(before.clientName) !== norm(after.clientName)) out.push('name');
    if (String(before.telephone || '').replace(/\D/g, '') !== String(after.telephone || '').replace(/\D/g, '')) out.push('phone');
    if (norm(before.address) !== norm(after.address)) out.push('address');
    if (items(before) !== items(after)) out.push('products');
    else if (prices(before) !== prices(after)) out.push('price');
    return out;
}

// ---------------------------------------------------------------- 7. same time last year

// What people asked about in the coming 30 days LAST year, more than in an average month of that
// year: 3+ people and at least 1.5x usual. The chatbot's log goes back to 30 Oct 2025.
export function sameTimeLastYear(asks, products, now = Date.now(), { windowDays = 30, minPeople = 3 } = {}) {
    const from = now - 365 * DAY, to = from + windowDays * DAY;
    const byId = new Map(products.map(p => [p._id, p]));
    const rows = new Map();
    for (const a of asks) {
        if (a.t < from || a.t >= now) continue;
        const p = a.id && byId.get(a.id);
        const k = p ? 'id:' + p._id : 'model:' + (modelOf(a.name) || squash(a.name));
        const r = rows.get(k) || { key: k, name: p ? p.name : (modelOf(a.name) || a.name), product: p || null, window: new Set(), year: 0 };
        if (a.t < to) r.window.add(a.sender);
        r.year++;
        rows.set(k, r);
    }
    const months = 365 / windowDays;
    return [...rows.values()].map(r => ({ key: r.key, name: r.name, product: r.product, lastYear: r.window.size, usual: Math.round(r.year / months * 10) / 10 }))
        .filter(r => r.lastYear >= minPeople && r.lastYear >= 1.5 * Math.max(r.usual, 0.5))
        .sort((a, b) => b.lastYear - a.lastYear);
}
