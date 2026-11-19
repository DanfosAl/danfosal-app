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
// Pure functions: no Firestore, no DOM. Private chats are left out everywhere.

const DAY = 86400000;
export const squash = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// The Instagram business account's own id (17 digits from 1784...). The old chatbot logged the
// shop's own replies under it (fixed 19 Nov 2026), so it is never a customer.
export const isShopAccount = id => /^1784\d{13}$/.test(String(id || ''));

// ---------------------------------------------------------------- matching text to the catalogue

// A product is "named" in a question when its model number reads inside the squashed text:
// "sc3easyfix" contains "sc3". Only keys that mix letters and digits count.
export function productKeys(p) {
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

// "SC 3 EasyFix" -> "SC 3", "rm519" -> "RM 519": the first model number in a name.
export function modelOf(text) {
    const m = String(text || '').match(/\b([a-z]{1,4})\s*-?\s*(\d{1,4})\b/i);
    return m ? `${m[1].toUpperCase()} ${m[2].replace(/^0+(?=\d)/, '')}` : '';
}

// ---------------------------------------------------------------- every product question

// [{sender, t, id, name, stockThen, from}] - one per person, product and day. The bot's own record
// wins over the log line it also wrote for the same question.
export function allAsks({ chats = [], events = [], products = [] } = {}) {
    const privateIds = new Set(chats.filter(c => c.ignored).map(c => c._id));
    const byId = new Map(products.map(p => [p._id, p]));
    const out = [], seen = new Set();
    const key = (sender, idOrName, t) => `${sender}|${idOrName}|${Math.floor(t / DAY)}`;
    for (const c of chats) {
        if (c.ignored) continue;
        for (const a of c.askedProducts || []) {
            if (!a || !a.name || !a.at) continue;
            const id = a.id && byId.has(a.id) ? a.id : null;
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
            const hit = matchAsked(text, index)[0];
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
