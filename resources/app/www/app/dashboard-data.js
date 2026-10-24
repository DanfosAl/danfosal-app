// The numbers behind Insights' dashboard pages (Money, Stock, Customers, Instagram, Purchasing,
// Your apps) and the extra cards on Overview. Built on 23 Oct 2026 from the "Danfosal overview"
// dashboard made with Claude, which reproduced every figure it showed from this same logic.
//
// It only READS Firestore. Revenue, cost, margin, customers and refunds all come from data.js
// (salesLedger, analyze, netRevenue, customerKey, ...): nothing here defines them again.
//
// Live data: the pages are worked out from the database each time Insights opens. loadAll() is read
// once per visit and shared by every tab. The two big collections only some pages need - the
// chatbot's log (analytics_events, ~7,000 documents) and the purchasing papers (purchaseDocs) - are
// read when such a page first opens, and kept for 15 minutes in this window's session so switching
// pages or coming back doesn't read them again. "Refresh" on any page reads everything anew.
//
// Money is euro and net of VAT (VAT = 1.2) unless a field says _gross or price (shop prices include
// VAT, as in the catalogue). Months are 'YYYY-MM' in local time, days 'YYYY-MM-DD'.
import * as D from './data.js';
import { db, ready, collection, getDocs } from './firebase.js';

const DAY = 86400000;
const VAT = D.VAT;
const CACHE_MS = 15 * 60000;
const r2 = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x * 100) / 100);
const r4 = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10000) / 10000);
export const monthKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const wd = (t) => (new Date(t).getDay() + 6) % 7;          // 0 = Monday
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const top1 = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0];

// ============================================================================ the two big collections

const EVENT_NAMES = new Set(['message_received', 'product_inquiry', 'order_created']);
// Only what the pages use, so the session copy stays small: an event's name, time, who wrote, what
// they asked about and which order it became.
function slimEvent(e) {
    const p = e.params || {};
    return { event_name: e.event_name, t: D.toMs(e.timestamp) || D.toMs(e.created_at),
        params: { sender_id: p.sender_id || '', products: p.products == null ? '' : String(p.products), order_id: p.order_id || '' },
        linkedOrderId: e.linkedOrderId || '' };
}
const plain = (v) => {
    if (v && typeof v.toMillis === 'function') return v.toMillis();
    if (Array.isArray(v)) return v.map(plain);
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = plain(v[k]); return o; }
    return v;
};
const SOURCES = {
    events: async () => (await getDocs(collection(db, 'analytics_events'))).docs.map((d) => d.data()).filter((e) => EVENT_NAMES.has(e.event_name)).map(slimEvent),
    purchaseDocs: async () => (await getDocs(collection(db, 'purchaseDocs'))).docs.map((d) => ({ _id: d.id, ...plain(d.data()) }))
};
const memory = {};
const KEY = (name) => `danfosal.dashboard.${name}`;

function fromSession(name) {
    try {
        const raw = sessionStorage.getItem(KEY(name)); if (!raw) return null;
        const v = JSON.parse(raw);
        return v && Date.now() - v.at < CACHE_MS && Array.isArray(v.rows) ? v : null;
    } catch { return null; }
}
function toSession(name, v) {
    try { sessionStorage.setItem(KEY(name), JSON.stringify(v)); } catch { /* too big or unavailable: memory only */ }
}

// Read the collections a page needs (from this window's copy when it is under 15 minutes old).
export async function loadExtras(names = []) {
    await ready;
    const out = {};
    await Promise.all(names.map(async (name) => {
        let v = memory[name] && Date.now() - memory[name].at < CACHE_MS ? memory[name] : fromSession(name);
        if (!v) { v = { at: Date.now(), rows: await SOURCES[name]() }; toSession(name, v); }
        memory[name] = v;
        out[name] = v.rows;
        out[name + 'At'] = v.at;
    }));
    return out;
}
// Forget the session copies, so the next page reads the database again.
export function forgetExtras() {
    Object.keys(SOURCES).forEach((name) => { delete memory[name]; try { sessionStorage.removeItem(KEY(name)); } catch { } });
}

// The figures for one data load, worked out once and reused by every page of the visit. They are
// worked out again when a page needs a collection the earlier ones didn't load.
export function dashboardFor(m, extras = {}, now = Date.now()) {
    const sig = `${extras.events ? extras.eventsAt : 0}|${extras.purchaseDocs ? extras.purchaseDocsAt : 0}|${now}`;
    if (m._dash && m._dash.sig === sig) return m._dash.out;
    const out = buildDashboard(m, extras, now);
    m._dash = { sig, out };
    return out;
}

// Everything at once, for a check against the database (not used by the screens).
export async function loadDashboardData(now = Date.now()) {
    const m = await D.loadAll();
    const extras = await loadExtras(['events', 'purchaseDocs']);
    return buildDashboard(m, extras, now);
}

// ============================================================================ chatbot questions -> models

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim();
const MODEL = /\b(puzzi|sc|se|wd|ds|vc|fc|sg|wv|k|nt|bd|t)\s?(\d{1,2}(?:\/\d{1,2})?)\b/g;
// Kärcher model names in a free-text question or a product name: "sc3 me avull" -> SC 3.
export function modelsIn(text) {
    const n = norm(text).replace(/karcher|kracher|kartcher/g, ' ');
    const found = [];
    for (const [, a, b] of n.matchAll(MODEL)) {
        if (a === 't' && !b.includes('/') && !['10', '11', '12', '15'].includes(b)) continue;
        found.push(`${a === 'puzzi' ? 'Puzzi' : a.toUpperCase()} ${b}`);
    }
    return found;
}
// Each chatbot question, split where the bot listed several products.
export function inquiries(events) {
    const out = [];
    events.filter((e) => e.event_name === 'product_inquiry' && e.params && e.params.products)
        .forEach((e) => String(e.params.products).split(/[,;]/).forEach((part) => { if (norm(part)) out.push({ d: dayKey(e.t), t: e.t, text: part }); }));
    return out;
}
// The catalogue's machines per model: a product whose name starts with the model (accessories,
// detergents and parts left out), so "SC 3" means the SC 3 steam cleaners you stock.
export function machinesByModel(products) {
    const map = new Map();
    products.forEach((p) => {
        const mm = modelsIn(p.name)[0]; if (!mm) return;
        const lead = norm(p.name).replace('karcher', '').trim().replace(/ /g, '');
        const family = D.productFamily(p.name, {});
        if (!lead.startsWith(mm.toLowerCase().replace(/ /g, '')) || ['Parts & accessories', 'Detergents', 'Janitorial supplies'].includes(family)
            || /nozzle|filter|bag|qese|brush|tool|set\b|kit\b|replacement/i.test(p.name)) return;
        if (!map.has(mm)) map.set(mm, []);
        map.get(mm).push(p);
    });
    return map;
}
// How often people asked the chatbot about each model, all time and in the last 6 months.
export function askedByModel(events, now = Date.now()) {
    const since6 = dayKey(now - 183 * DAY);
    const perModel = {};
    inquiries(events).forEach((q) => new Set(modelsIn(q.text)).forEach((mm) => {
        const x = perModel[mm] || (perModel[mm] = { all: 0, six: 0 }); x.all++; if (q.d >= since6) x.six++;
    }));
    return perModel;
}
// The same for each catalogue machine (by its model). Used by Stock › Reorder for products that
// are out of stock but asked for, and by the price suggestions (Stock › Prices).
export function askedByProduct(products, events, now = Date.now()) {
    const perModel = askedByModel(events, now);
    const out = new Map();
    machinesByModel(products).forEach((ps, mm) => { if (perModel[mm]) ps.forEach((p) => out.set(p._id, { model: mm, questions: perModel[mm].all, questions_6m: perModel[mm].six })); });
    return out;
}

// ============================================================================ building

export function buildDashboard(m, { events = [], purchaseDocs = [] } = {}, now = Date.now()) {
    const A = D.analyze(m, now);
    const out = {};
    const knownIds = new Set(m.products.map((p) => p._id));
    const since12 = now - 365 * DAY;
    const { sales, lines, orders } = D.salesLedger(m);

    // ---------------------------------------------------------------- monthly: revenue, cost, gross profit, how the month was recorded
    const first = Math.min(...sales.map((s) => s.t), ...orders.map((o) => o.t));
    const months = new Map();
    for (let d = new Date(new Date(first).getFullYear(), new Date(first).getMonth(), 1); d.getTime() <= now; d.setMonth(d.getMonth() + 1)) {
        months.set(monthKey(d), { month: monthKey(d), shop_net: 0, online_net: 0, refunds_net: 0, costed_net: 0, cost: 0, uncosted_net: 0, receipts: 0, online_orders: 0, easypos: 0, till: 0, pdf: 0, imported: 0 });
    }
    const SRC = { EasyPOS: 'easypos', Till: 'till', PDF: 'pdf', Import: 'imported' };
    sales.forEach((s) => {
        const x = months.get(monthKey(s.t)); if (!x) return;
        if (s.refund) x.refunds_net += -s.net; else { x.receipts++; x[SRC[s.src]]++; }
        x.shop_net += s.net;
        if (s.cost === null) x.uncosted_net += s.net; else { x.costed_net += s.net; x.cost += s.cost; }
    });
    orders.forEach((o) => { const x = months.get(monthKey(o.t)); if (x) { x.online_net += o.net; x.online_orders++; } });
    out.monthly = [...months.values()].map((x) => ({
        month: x.month,
        coverage: (x.easypos || x.pdf) ? 'EasyPOS + invoices' : (x.receipts && x.imported * 2 >= x.receipts) ? 'Imported history' : 'Till only',
        revenue: r2(x.shop_net + x.online_net), shop_net: r2(x.shop_net), online_net: r2(x.online_net), refunds_net: r2(x.refunds_net),
        costed_net: r2(x.costed_net), cost: r2(x.cost), gross_profit: r2(x.costed_net - x.cost), uncosted_net: r2(x.uncosted_net),
        receipts: x.receipts, online_orders: x.online_orders, easypos: x.easypos, till: x.till, pdf: x.pdf, imported: x.imported
    }));

    // ---------------------------------------------------------------- last 12 months: families and best sellers
    const fam = new Map(), prod = new Map();
    lines.filter((l) => l.t >= since12).forEach((l) => {
        const f = fam.get(l.family) || { family: l.family, net: 0, costed_net: 0, cost: 0, units: 0 };
        f.net += l.net; f.units += l.qty; if (l.cost !== null) { f.costed_net += l.net; f.cost += l.cost; }
        fam.set(l.family, f);
        const key = l.pid || 'name:' + l.name.toLowerCase();
        const p = prod.get(key) || { product: l.name, family: l.family, net: 0, units: 0, cost: 0, costed: true };
        p.net += l.net; p.units += l.qty; if (l.cost === null) p.costed = false; else p.cost += l.cost;
        prod.set(key, p);
    });
    out.families = [...fam.values()].filter((f) => f.net > 0).sort((a, b) => b.net - a.net)
        .map((f) => ({ family: f.family, net: r2(f.net), gross_profit: r2(f.costed_net - f.cost), margin: f.costed_net > 0 ? r4((f.costed_net - f.cost) / f.costed_net) : null, units: Math.round(f.units) }));
    out.best_sellers = [...prod.values()].filter((p) => p.net > 0).sort((a, b) => b.net - a.net).slice(0, 20)
        .map((p, i) => ({ rank: i + 1, product: p.product, family: p.family, units: Math.round(p.units), net: r2(p.net), margin: p.costed && p.net > 0 ? r4((p.net - p.cost) / p.net) : null }));

    // ---------------------------------------------------------------- stock: aging, slow stock, reorder, clearance
    const BUCKETS = ['Sold in last 30 days', '31–90 days ago', '3–6 months ago', '6–12 months ago', 'Over a year ago', 'Never sold'];
    const aging = Object.fromEntries(BUCKETS.map((b, i) => [b, { bucket: b, order: i + 1, value_at_cost: 0, products: 0, units: 0 }]));
    const slow = [], clearance = [];
    m.products.forEach((p) => {
        const stock = Number(p.stock) || 0; if (stock <= 0) return;
        const c = D.productNetCost(p), value = c ? stock * c : 0;
        const last = A.lastSoldAt[p._id], age = last ? (now - last) / DAY : Infinity;
        const b = !last ? BUCKETS[5] : age <= 30 ? BUCKETS[0] : age <= 90 ? BUCKETS[1] : age <= 182 ? BUCKETS[2] : age <= 365 ? BUCKETS[3] : BUCKETS[4];
        aging[b].value_at_cost += value; aging[b].products++; aging[b].units += stock;
        if (age > 90) {
            const row = { product: String(p.name).trim(), code: p.code || '', family: D.productFamily(p.name, {}), in_stock: stock, value_at_cost: r2(value), last_sold: last ? dayKey(last) : null, price: Number(p.price) || null };
            slow.push(row);
            clearance.push({ ...row, unit_cost: r2(c), group: last ? 'Not sold in 3+ months' : 'Never sold', value_at_cost: r2(c ? c * stock : null) });
        }
    });
    out.stock_aging = Object.values(aging).map((x) => ({ ...x, value_at_cost: r2(x.value_at_cost) }));
    out.slow_stock = slow.sort((a, b) => b.value_at_cost - a.value_at_cost).slice(0, 25);
    out.clearance = clearance.sort((a, b) => (b.value_at_cost || 0) - (a.value_at_cost || 0));
    out.reorder = A.reorder.map((r) => ({ product: String(r.product.name).trim(), code: r.product.code || '', in_stock: r.stock, sold_90d: r.units, days_left: Math.round(r.daysLeft * 10) / 10 }));
    out.out_of_stock_wanted = A.outOfStockWanted.map((r) => ({ product: String(r.product.name).trim(), code: r.product.code || '', units_12m: r.units12, last_sold: r.lastSold ? dayKey(r.lastSold) : null }));

    // ---------------------------------------------------------------- customers: new vs returning, loyalty, win-back, buyer types
    const custById = new Map(m.customers.map((c) => [c._id, c]));
    const custByKey = new Map(); m.customers.forEach((c) => { const k = D.customerKey(c.name); if (k) custByKey.set(k, c); });
    const BIZ = /\b(sh\.?\s?p\.?\s?k\.?|shpk|sh\.?a\.?|ltd|llc|hotel|resort|restorant|bar|kompani|company|group|grup|ndermarrje|bashkia|spital|klinika|qendra|shkoll|universitet|ministri|agjenci|plaza|crowne)\b/i;
    // A business is a buyer with a tax number (on the receipt or in their profile), or a company name.
    const buyerType = (s) => {
        const name = s.clientName || s.customerName || '';
        const c = (s.customerId && custById.get(s.customerId)) || custByKey.get(D.customerKey(name));
        if ((s.easypos && s.easypos.customerNIPT) || s.customerNipt || s.customerNIPT || (c && c.nipt) || BIZ.test(name)) return 'Business';
        if (!name || D.WALKIN.test(name)) return 'Walk-in';
        return 'Private (named)';
    };
    const linesBySale = new Map();
    lines.forEach((l) => { if (l.saleId) { if (!linesBySale.has(l.saleId)) linesBySale.set(l.saleId, []); linesBySale.get(l.saleId).push(l); } });

    const cust = new Map();
    const addBuy = (name, t, net, ls) => {
        if (!name || D.WALKIN.test(name) || Number.isNaN(t)) return;
        const k = D.customerKey(name); if (!k) return;
        const c = cust.get(k) || { names: {}, n: 0, net: 0, first: t, last: t, fam: {}, prod: {}, months: new Set() };
        c.names[name.trim()] = (c.names[name.trim()] || 0) + 1; c.n++; c.net += net;
        c.first = Math.min(c.first, t); c.last = Math.max(c.last, t); c.months.add(monthKey(t));
        ls.forEach((l) => { if (l.isService || l.pre) return; c.fam[l.family] = (c.fam[l.family] || 0) + l.net; c.prod[l.name] = (c.prod[l.name] || 0) + l.qty; });
        cust.set(k, c);
    };
    m.sales.filter((s) => !s.isReturn).forEach((s) => { const t = D.saleTime(s); if (!Number.isNaN(t)) addBuy(s.clientName || s.customerName, t, D.netRevenue(s), linesBySale.get(s._id) || []); });
    m.orders.filter(D.soldOrder).forEach((o) => {
        const ls = (o.items || []).map((it) => ({ name: String(it.name || '').trim(), family: D.productFamily(it.name, it), net: (Number(it.price) || 0) * (Number(it.quantity) || 1) / VAT, qty: Number(it.quantity) || 1 }));
        addBuy(o.clientName || o.customerName, D.orderTime(o), D.orderTotal(o) / VAT, ls);
    });
    out.customers_monthly = out.monthly.map((x) => {
        let nw = 0, ret = 0;
        cust.forEach((c) => { if (!c.months.has(x.month)) return; if (monthKey(c.first) === x.month) nw++; else ret++; });
        return { month: x.month, new_customers: nw, returning_customers: ret, named_buyers: nw + ret };
    });
    const freq = { 'Bought once': 0, '2–3 times': 0, '4–9 times': 0, '10+ times': 0 };
    cust.forEach((c) => { freq[c.n === 1 ? 'Bought once' : c.n <= 3 ? '2–3 times' : c.n <= 9 ? '4–9 times' : '10+ times']++; });
    out.customer_loyalty = Object.entries(freq).map(([group, customers], i) => ({ group, order: i + 1, customers }));
    // Win-back: bought twice or more, but not in the last 6 months. Names only (no phone or address).
    const lapsed = [...cust.values()].filter((c) => c.n >= 2 && now - c.last > 180 * DAY);
    out.win_back = lapsed.sort((a, b) => b.net - a.net).slice(0, 30).map((c) => ({
        customer: top1(c.names)[0], purchases: c.n, net_spent: r2(c.net), last_purchase: dayKey(c.last), days_since: Math.floor((now - c.last) / DAY),
        usually_buys: top1(c.fam) ? top1(c.fam)[0] : '', top_product: top1(c.prod) ? top1(c.prod)[0] : ''
    }));

    const seg = {}, segM = {};
    m.sales.filter((s) => !s.isReturn).forEach((s) => {
        const t = D.saleTime(s); if (Number.isNaN(t)) return;
        const type = buyerType(s), net = D.netRevenue(s), cost = D.saleNetCost(s);
        if (t >= since12) {
            const x = seg[type] || (seg[type] = { type, sales: 0, net: 0, costed_net: 0, cost: 0 });
            x.sales++; x.net += net; if (cost !== null) { x.costed_net += net; x.cost += cost; }
        }
        const y = segM[monthKey(t)] || (segM[monthKey(t)] = { month: monthKey(t), business: 0, private: 0, walkin: 0 });
        y[type === 'Business' ? 'business' : type === 'Walk-in' ? 'walkin' : 'private'] += net;
    });
    out.buyer_types = Object.values(seg).map((x) => ({ type: x.type, sales: x.sales, net: r2(x.net), gross_profit: r2(x.costed_net - x.cost), margin: x.costed_net > 0 ? r4((x.costed_net - x.cost) / x.costed_net) : null, avg_sale: r2(x.net / x.sales) }));
    out.buyer_types_monthly = Object.values(segM).sort((a, b) => a.month.localeCompare(b.month)).map((x) => ({ month: x.month, business: r2(x.business), private: r2(x.private), walkin: r2(x.walkin) }));

    // bought together: pairs of different products on one receipt or online order
    const pairs = new Map(); let baskets = 0, multi = 0;
    const basket = (names, t) => {
        const u = [...new Set(names)].sort(); baskets++;
        if (u.length >= 2) multi++;
        if (u.length < 2 || u.length > 12) return;
        for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) {
            const k = u[i] + '\u0001' + u[j];
            const p = pairs.get(k) || { a: u[i], b: u[j], n: 0, last: 0 }; p.n++; p.last = Math.max(p.last, t); pairs.set(k, p);
        }
    };
    m.sales.filter((s) => !s.isReturn).forEach((s) => basket((linesBySale.get(s._id) || []).filter((l) => !l.isService && !l.pre && l.name && l.name !== '?').map((l) => l.name), D.saleTime(s)));
    m.orders.filter(D.soldOrder).forEach((o) => basket((o.items || []).map((it) => String(it.name || '').trim()).filter(Boolean), D.orderTime(o)));
    out.bought_together = [...pairs.values()].filter((p) => p.n >= 2).sort((a, b) => b.n - a.n || b.last - a.last).slice(0, 20)
        .map((p, i) => ({ rank: i + 1, product_a: p.a, product_b: p.b, times: p.n, last_time: dayKey(p.last) }));

    // ---------------------------------------------------------------- online orders by month and channel
    const onl = new Map();
    m.orders.forEach((o) => {
        const t = D.orderTime(o); if (Number.isNaN(t)) return;
        const x = onl.get(monthKey(t)) || { month: monthKey(t), orders: 0, returned: 0, revenue_net: 0, chatbot: 0, app: 0, imported: 0 };
        if (!D.soldOrder(o)) { x.returned++; onl.set(x.month, x); return; }
        x.orders++; x.revenue_net += D.orderTotal(o) / VAT;
        x[o.source === 'Instagram Chatbot' ? 'chatbot' : o.source === 'App' ? 'app' : 'imported']++;
        onl.set(x.month, x);
    });
    out.online_monthly = [...onl.values()].sort((a, b) => a.month.localeCompare(b.month)).map((x) => ({ ...x, revenue_net: r2(x.revenue_net), avg_order_net: x.orders ? r2(x.revenue_net / x.orders) : null }));

    // ---------------------------------------------------------------- Instagram chatbot (analytics_events)
    const ev = events.filter((e) => !Number.isNaN(e.t) && e.t);
    const bm = new Map();
    ev.forEach((e) => {
        const x = bm.get(monthKey(e.t)) || { month: monthKey(e.t), messages: 0, people: new Set(), inquiries: 0, orders_created: 0 };
        if (e.event_name === 'message_received') { x.messages++; if (e.params.sender_id) x.people.add(e.params.sender_id); }
        else if (e.event_name === 'product_inquiry') x.inquiries++;
        else if (e.event_name === 'order_created') x.orders_created++;
        bm.set(x.month, x);
    });
    out.bot_monthly = [...bm.values()].sort((a, b) => a.month.localeCompare(b.month)).map((x) => ({ month: x.month, messages: x.messages, people: x.people.size, inquiries: x.inquiries, orders_created: x.orders_created }));
    const senders = new Set(ev.filter((e) => e.event_name === 'message_received' && e.params.sender_id).map((e) => e.params.sender_id));
    const askers = new Set(ev.filter((e) => e.event_name === 'product_inquiry' && e.params.sender_id).map((e) => e.params.sender_id));
    out.bot_funnel = [
        { step: 'People who messaged', order: 1, count: senders.size },
        { step: 'Asked about a product', order: 2, count: askers.size },
        { step: 'Orders the bot created', order: 3, count: ev.filter((e) => e.event_name === 'order_created').length }
    ];
    const hm = new Map();
    ev.filter((e) => e.event_name === 'message_received').forEach((e) => { const k = wd(e.t) + '-' + new Date(e.t).getHours(); hm.set(k, (hm.get(k) || 0) + 1); });
    out.bot_hours = [];
    for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) out.bot_hours.push({ weekday: WEEKDAYS[d], day: d, hour: h, messages: hm.get(d + '-' + h) || 0 });

    // what people ask about: free text in product_inquiry params.products
    const qs = inquiries(ev);
    const askedGroups = new Map();
    qs.forEach((q) => {
        const label = norm(q.text).replace(/k[aä]rcher\s*/g, '').trim(); if (label.length < 2) return;
        const k = label.replace(/\s+/g, '').replace(/fshes[ae]/g, 'fshese');
        const g = askedGroups.get(k) || { n: 0, labels: {} }; g.n++; g.labels[label] = (g.labels[label] || 0) + 1; askedGroups.set(k, g);
    });
    out.bot_asked = [...askedGroups.values()].sort((a, b) => b.n - a.n).slice(0, 12).map((g, i) => ({ rank: i + 1, asked: top1(g.labels)[0], inquiries: g.n }));

    // demand vs stock: Kärcher model names in the questions, matched to catalogue machines
    const TOPICS = [
        ['Repox epoxy resin', /rez[iy]n|resin|epox/], ['Carpet & upholstery', /tapic|divan|kolltuk|tapet|tepet|puzzi|lares[ e]|larese|larje se|karrige/],
        ['Window cleaning', /xham|dritar|\bwv/], ['Steam cleaners', /avull|steam|\bsc\s?\d/], ['Pressure washers', /lavazh|presion|jet wash|\bk\s?\d/],
        ['Vacuums', /korr?ent|vakum|thithes|\bwd\s?\d|\bvc\s?\d|bateri|\bds\s?\d|\bt\s?11/], ['Detergents', /solucion|detergj|kimik/], ['Bags & filters', /\bqes|\bthas|filter/]
    ];
    const topicOf = (text) => { const n = norm(text); const hit = TOPICS.find(([, rx]) => rx.test(n)); return hit ? hit[0] : /\bfshes/.test(n) ? 'Unclear ("fshesë")' : null; };
    const since6 = dayKey(now - 183 * DAY);
    const mq = {}, mq6 = {}, tq = {}, tq6 = {};
    qs.forEach((q) => {
        new Set(modelsIn(q.text)).forEach((mm) => { mq[mm] = (mq[mm] || 0) + 1; if (q.d >= since6) mq6[mm] = (mq6[mm] || 0) + 1; });
        const t = topicOf(q.text); if (t) { tq[t] = (tq[t] || 0) + 1; if (q.d >= since6) tq6[t] = (tq6[t] || 0) + 1; }
    });
    const units12 = {};
    lines.forEach((l) => { if (l.pid && l.t >= since12 && !l.refund) units12[l.pid] = (units12[l.pid] || 0) + l.qty; });
    m.orders.filter(D.soldOrder).forEach((o) => { const t = D.orderTime(o); if (t < since12) return;
        (o.items || []).forEach((it) => { const pid = D.productIdOfLine(it, knownIds) || (it.id && knownIds.has(it.id) ? it.id : null); if (pid) units12[pid] = (units12[pid] || 0) + (Number(it.quantity) || 1); }); });
    const byModel = machinesByModel(m.products);
    out.demand_stock = Object.entries(mq).filter(([mm, n]) => n >= 2 && mm !== 'Puzzi 8').sort((a, b) => b[1] - a[1]).map(([model, questions]) => {
        const ps = byModel.get(model) || [];
        const in_stock = ps.reduce((a, p) => a + Math.max(0, Number(p.stock) || 0), 0);
        const units_12m = ps.reduce((a, p) => a + (units12[p._id] || 0), 0);
        const sold_90d = ps.reduce((a, p) => a + (A.soldUnits[p._id] || 0), 0);
        const signal = !ps.length ? 'Not in your catalogue' : in_stock === 0 ? 'Out of stock' : in_stock <= 2 && units_12m >= 5 ? 'Running low' : 'In stock';
        return { model, questions, questions_6m: mq6[model] || 0, in_stock, units_12m, sold_90d, signal };
    });
    out.demand_family = Object.entries(tq).sort((a, b) => b[1] - a[1]).map(([topic, questions]) => ({ topic, questions, questions_6m: tq6[topic] || 0 }));

    // chatbot orders that did / didn't become an Online order
    const orderIds = new Set(m.orders.map((o) => o._id));
    const bo = new Map(); let missing90 = 0;
    ev.filter((e) => e.event_name === 'order_created').forEach((e) => {
        const id = e.params.order_id || '';
        const arrived = orderIds.has(id) || (e.linkedOrderId && orderIds.has(e.linkedOrderId));
        const x = bo.get(monthKey(e.t)) || { month: monthKey(e.t), created: 0, arrived: 0, missing: 0 };
        x.created++; x[arrived ? 'arrived' : 'missing']++; bo.set(x.month, x);
        if (!arrived && e.t >= now - 90 * DAY) missing90++;
    });
    out.bot_orders_monthly = [...bo.values()].sort((a, b) => a.month.localeCompare(b.month));

    // ---------------------------------------------------------------- shop rhythm (EasyPOS + till have a real time of day)
    const sh = new Map();
    sales.filter((s) => !s.refund && (s.src === 'EasyPOS' || s.src === 'Till')).forEach((s) => { const k = wd(s.t) + '-' + new Date(s.t).getHours(); const x = sh.get(k) || { n: 0, net: 0 }; x.n++; x.net += s.net; sh.set(k, x); });
    out.shop_hours = [];
    for (let d = 0; d < 7; d++) for (let h = 7; h < 21; h++) { const x = sh.get(d + '-' + h) || { n: 0, net: 0 }; out.shop_hours.push({ weekday: WEEKDAYS[d], day: d, hour: h, receipts: x.n, net: r2(x.net) }); }

    // seasonality: family x calendar month, all recorded history
    const seas = {};
    lines.forEach((l) => {
        if (l.refund || l.isService || l.pre || ['Other', 'Services', 'Prepayments'].includes(l.family)) return;
        const k = l.family + '|' + (new Date(l.t).getMonth() + 1);
        const x = seas[k] || (seas[k] = { family: l.family, month_num: new Date(l.t).getMonth() + 1, net: 0, units: 0 });
        x.net += l.net; x.units += l.qty;
    });
    out.seasonality = Object.values(seas).map((x) => ({ ...x, net: r2(x.net), units: Math.round(x.units) }));

    // ---------------------------------------------------------------- EasyPOS pipeline, warranties, website
    const dm = new Map();
    for (let t = now - 59 * DAY; t <= now; t += DAY) dm.set(dayKey(t), { day: dayKey(t), receipts: 0, refunds: 0, net: 0 });
    m.sales.filter((s) => s.type === 'easypos' && !s.isReturn).forEach((s) => { const x = dm.get(dayKey(D.saleTime(s))); if (x) { x.receipts++; x.net += D.netRevenue(s); } });
    (m.returns || []).forEach((r) => { const x = dm.get(dayKey(D.returnTime(r))); if (x) x.refunds++; });
    out.easypos_daily = [...dm.values()].map((x) => ({ ...x, net: r2(x.net) }));

    const wm = new Map();
    m.warranties.forEach((c) => { const t = D.toMs(c.createdAt); if (Number.isNaN(t)) return; const x = wm.get(monthKey(t)) || { month: monthKey(t), issued: 0, cancelled: 0, machines: 0 }; x.issued++; if (c.cancelledAt) x.cancelled++; x.machines += (c.items || []).length; wm.set(x.month, x); });
    out.warranty_monthly = [...wm.values()].sort((a, b) => a.month.localeCompare(b.month));
    const liveCards = m.warranties.filter(D.liveCard);

    const productById = new Map(m.products.map((p) => [p._id, p]));
    out.web_prices = (m.websiteProposals || []).filter((p) => p.status === 'pending').map((p) => {
        const pr = productById.get(p.productId);
        const shop = Number(p.shopPrice) || (pr && Number(pr.price)) || null, web = Number(p.websitePrice) || null, cost = pr ? D.productNetCost(pr) : null;
        return { product: String(p.name || p.websiteName || '').trim(), code: p.code && !String(p.code).startsWith('id:') ? p.code : (pr && pr.code) || '', shop_price: shop, website_price: web, on_sale: !!p.onSale,
            gap_pct: shop && web ? r4((web - shop) / shop) : null, below_cost: !!(cost && web && web / VAT < cost) };
    }).sort((a, b) => Math.abs(b.gap_pct || 0) - Math.abs(a.gap_pct || 0));

    // ---------------------------------------------------------------- running costs and profit after them
    out.profit_after_costs = out.monthly.map((x) => {
        const [y, mo] = x.month.split('-').map(Number);
        const start = new Date(y, mo - 1, 1).getTime(), end = new Date(y, mo, 1).getTime();
        const ex = (m.expenses || []).filter((e) => { const t = D.toMs(e.date) || D.toMs(e.createdAt); return t >= start && t < end; });
        const rc = D.runningCostOf(m, start, ex).total;
        const margin = x.costed_net > 0 ? x.gross_profit / x.costed_net : null;
        return { month: x.month, revenue: x.revenue, gross_profit: x.gross_profit, margin: r4(margin), running_costs: r2(rc), costs_recorded: rc > 0,
            profit_after_costs: rc > 0 ? r2(x.gross_profit - rc) : null, break_even_revenue: rc > 0 && margin > 0.05 ? r2(rc / margin) : null };
    });

    // ---------------------------------------------------------------- purchasing (purchaseDocs, written by Paper Autopilot)
    // Some papers exist as two copies: count an invoice once per invoice number and a payment once per date+amount+currency+beneficiary.
    const invoices = new Map();
    purchaseDocs.filter((p) => p.kind === 'invoice').forEach((p) => { if (!invoices.has(p.invoiceNo)) invoices.set(p.invoiceNo, p); });
    const seen = new Set(), payments = [];
    purchaseDocs.filter((p) => p.kind === 'payment').forEach((p) => {
        const k = [p.date, Math.round(p.amount * 100), p.currency, String(p.beneficiary || '').toUpperCase()].join('|');
        if (!seen.has(k)) { seen.add(k); payments.push(p); }
    });
    const customs = purchaseDocs.filter((p) => p.kind === 'customs');
    const supplierOf = (b) => { b = String(b || '').toUpperCase();
        return b.includes('KARCHER') ? 'Kärcher' : b.includes('THESARIT') ? 'Customs (state treasury)' : b.includes('STAR') ? 'Star (Sonuk Star Makina)'
            : b.includes('RULOPAK') ? 'Rulopak' : b.includes('BAYERSAN') ? 'Bayersan' : b.includes('FERSAN') ? 'Fersan Filtre' : b; };
    const pm = new Map();
    const pget = (mo) => { if (!pm.has(mo)) pm.set(mo, { month: mo, karcher_invoiced: 0, invoices: 0, karcher_paid: 0, other_paid: 0, customs_taxes: 0 }); return pm.get(mo); };
    invoices.forEach((i) => { if (!i.date) return; const x = pget(String(i.date).slice(0, 7)); x.karcher_invoiced += Number(i.net) || 0; x.invoices++; });
    payments.forEach((p) => { if (p.currency !== 'EUR' || p.direction === 'in' || !p.date) return; const x = pget(String(p.date).slice(0, 7)); x[supplierOf(p.beneficiary) === 'Kärcher' ? 'karcher_paid' : 'other_paid'] += Number(p.amount) || 0; });
    customs.forEach((c) => { if (Number(c.rate) > 0 && c.date) pget(String(c.date).slice(0, 7)).customs_taxes += ((Number(c.vatAll) || 0) + (Number(c.dutyAll) || 0)) / c.rate; });
    out.purchases_monthly = [...pm.values()].sort((a, b) => a.month.localeCompare(b.month))
        .map((x) => ({ ...x, karcher_invoiced: r2(x.karcher_invoiced), karcher_paid: r2(x.karcher_paid), other_paid: r2(x.other_paid), customs_taxes: r2(x.customs_taxes) }));

    const sp = new Map();
    payments.forEach((p) => { if (p.direction === 'in') return; const s = supplierOf(p.beneficiary);
        const x = sp.get(s) || { supplier: s, eur: 0, lek: 0, payments: 0, last: '' }; x.payments++; x.last = x.last > p.date ? x.last : p.date;
        x[p.currency === 'EUR' ? 'eur' : 'lek'] += Number(p.amount) || 0; sp.set(s, x); });
    out.supplier_payments = [...sp.values()].map((x) => ({ supplier: x.supplier, paid_eur: x.eur ? r2(x.eur) : null, paid_lek: x.lek ? r2(x.lek) : null, payments: x.payments, last_payment: x.last }))
        .sort((a, b) => ((b.paid_eur || 0) + (b.paid_lek || 0) / 97) - ((a.paid_eur || 0) + (a.paid_lek || 0) / 97));

    // Kärcher account: open total on the last statement, then every invoice and euro payment after it
    const statement = purchaseDocs.filter((p) => p.kind === 'statement').sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    let karcherBalance = null, due30 = 0;
    out.karcher_ledger = [];
    if (statement) {
        const openLines = (statement.lines || []).filter((l) => !l.clearingDate);
        const evs = [{ date: statement.date, event: 'Kärcher statement: open items', document: `${openLines.length} open lines`, amount: r2(statement.openTotal) }];
        invoices.forEach((i) => { if (i.date > statement.date) evs.push({ date: i.date, event: 'Invoice' + (Number(i.net) ? '' : ' (warranty, no charge)'), document: i.invoiceNo, amount: r2(Number(i.net) || 0) }); });
        payments.forEach((p) => { if (supplierOf(p.beneficiary) === 'Kärcher' && p.currency === 'EUR' && p.date > statement.date) {
            const advance = (p.refs || [])[0] && String(p.refs[0]).startsWith('7571');           // 7571… are order numbers, 7573… invoices
            evs.push({ date: p.date, event: 'Payment' + (advance ? ' in advance for order ' + p.refs[0] : ''), document: String(p.details || '').slice(0, 60), amount: r2(-p.amount) });
        } });
        evs.sort((a, b) => a.date.localeCompare(b.date) || (a.amount < 0) - (b.amount < 0));
        let bal = 0;
        evs.forEach((e, n) => { bal += e.amount; e.balance = r2(bal); e.step = n + 1; });
        out.karcher_ledger = evs;
        karcherBalance = r2(bal);
        if (bal > 0.5) openLines.filter((l) => l.type === 'RV').forEach((l) => {          // still owed: due = invoice date + payment terms
            const inv = invoices.get(l.docNo); const days = Number(((inv && inv.paymentTerms) || '').match(/(\d+)\s*days/)?.[1]) || 60;
            if (new Date(l.date).getTime() + days * DAY <= now + 30 * DAY) due30 += Number(l.amount) || 0;
        });
    }

    // true margin after import duty: duty rate per tariff as charged on the Kärcher customs declarations
    const kDecl = customs.filter((c) => /KARCHER/i.test(c.exporter || '') && Number(c.rate) > 0);
    const byTariff = {}; let declValue = 0, declFees = 0;
    kDecl.forEach((c) => { declValue += Number(c.invoiceTotal) || 0; declFees += ((Number(c.extraAll) || 0) - (Number(c.dutyAll) || 0)) / c.rate;
        (c.items || []).forEach((i) => { const t = byTariff[i.tariff] || (byTariff[i.tariff] = { v: 0, d: 0 }); t.v += Number(i.value) || 0; t.d += (Number(i.dutyAll) || 0) / c.rate; }); });
    const DUTY = Object.fromEntries(Object.entries(byTariff).filter(([, t]) => t.v > 0).map(([k, t]) => [k, Math.round((t.d / t.v) * 100) / 100]));
    const FEE = declValue ? declFees / declValue : 0;
    const latestBuy = {}, costHistory = {};
    invoices.forEach((inv) => (inv.items || []).forEach((i) => {
        if (!(i.unitCost > 0) || i.free || !(i.qty > 0)) return;
        const cur = latestBuy[i.code]; if (!cur || inv.date > cur.date) latestBuy[i.code] = { date: inv.date, unit: i.unitCost, tariff: i.tariff };
        (costHistory[i.code] || (costHistory[i.code] = [])).push({ date: inv.date, unit: i.unitCost });
    }));
    const landed = [];
    m.products.forEach((p) => {
        const l = latestBuy[p.code]; if (!l || !(Number(p.price) > 0) || !(l.tariff in DUTY)) return;
        const duty = DUTY[l.tariff], cost = l.unit * (1 + duty + FEE), pn = Number(p.price) / VAT;
        landed.push({ product: String(p.name).trim(), code: p.code, family: D.productFamily(p.name, {}), duty_rate: duty, invoice_cost: r2(l.unit), landed_cost: r2(cost), price_net: r2(pn),
            margin_invoice: r4((pn - l.unit) / pn), margin_landed: r4((pn - cost) / pn), units_12m: units12[p._id] || 0, in_stock: Number(p.stock) || 0 });
    });
    const dutyOnSales12m = landed.reduce((a, r) => a + r.units_12m * (r.landed_cost - r.invoice_cost), 0);
    out.landed_margin = landed.filter((r) => r.duty_rate > 0 && (r.units_12m > 0 || r.in_stock > 0))
        .sort((a, b) => b.units_12m - a.units_12m || (b.margin_invoice - b.margin_landed) - (a.margin_invoice - a.margin_landed));

    // Kärcher cost changes: first vs latest unit cost per product code
    const productByCode = new Map(m.products.filter((p) => p.code).map((p) => [p.code, p]));
    out.cost_changes = Object.entries(costHistory).map(([code, h]) => {
        h.sort((a, b) => a.date.localeCompare(b.date));
        if (new Set(h.map((x) => x.date)).size < 2) return null;
        const f = h[0], l = h[h.length - 1], change = (l.unit - f.unit) / f.unit, p = productByCode.get(code);
        if (Math.abs(change) < 0.01 || !p || !(Number(p.price) > 0)) return null;
        const pn = Number(p.price) / VAT;
        return { product: String(p.name).trim(), code, first_date: f.date, first_cost: r2(f.unit), last_date: l.date, last_cost: r2(l.unit), change_pct: r4(change),
            price: Number(p.price), margin_then: r4((pn - f.unit) / pn), margin_now: r4((pn - l.unit) / pn), in_stock: Number(p.stock) || 0, units_12m: units12[p._id] || 0 };
    }).filter(Boolean).sort((a, b) => b.change_pct - a.change_pct);

    // ---------------------------------------------------------------- headline figures (one row each)
    const s12 = sales.filter((s) => s.t >= since12), o12 = orders.filter((o) => o.t >= since12);
    const costed12 = s12.filter((s) => s.cost !== null), costedNet = costed12.reduce((a, s) => a + s.net, 0), cost12 = costed12.reduce((a, s) => a + s.cost, 0);
    const receipts12 = s12.filter((s) => !s.refund);
    const site = (m.websiteSync && m.websiteSync.website) || {};
    const messages = ev.filter((e) => e.event_name === 'message_received');
    out.snapshot = [{
        snapshot_at: new Date(now).toISOString(),
        revenue_12m: r2(s12.reduce((a, s) => a + s.net, 0) + o12.reduce((a, o) => a + o.net, 0)),
        shop_sales_12m: receipts12.length, online_orders_12m: o12.length,
        gross_profit_12m: r2(costedNet - cost12), margin_12m: costedNet > 0 ? r4((costedNet - cost12) / costedNet) : null,
        costed_share_12m: r4(costedNet / s12.reduce((a, s) => a + s.net, 0)),
        avg_sale_12m: receipts12.length ? r2(receipts12.reduce((a, s) => a + s.net, 0) / receipts12.length) : null,   // refunds are not sales
        month_to_date: r2(A.monthRevenue / VAT), prev_month_to_date: r2(A.prevMonthToDate / VAT),
        stock_value_cost: r2(A.stockValue), products_in_stock: m.products.filter((p) => Number(p.stock) > 0).length,
        units_in_stock: m.products.reduce((a, p) => a + Math.max(0, Number(p.stock) || 0), 0),
        slow_stock_value: r2(out.stock_aging.filter((b) => b.order >= 3).reduce((a, b) => a + b.value_at_cost, 0)),
        never_sold_value: r2(out.stock_aging[5].value_at_cost),
        products_no_cost: m.products.filter((p) => !D.productNetCost(p)).length,
        owed_to_you: r2(A.owedTotal), owed_invoices: A.owed.length,
        customers_total: A.customers, new_customers_30d: A.newCustomers30,
        live_warranties: liveCards.length,
        warranties_expiring_90d: liveCards.filter((c) => { const u = D.toMs(c.warrantyUntil); return u >= now && u < now + 90 * DAY; }).length,
        repairs_open: A.openTickets.length, repairs_total: m.tickets.length,
        easypos_receipts_total: m.sales.filter((s) => s.type === 'easypos').length,
        last_easypos_at: A.lastEasypos ? new Date(A.lastEasypos).toISOString() : null,
        refunds_12m: (m.returns || []).filter((r) => D.returnTime(r) >= since12).length, refunded_12m_gross: r2(A.refunded12m),
        bot_messages_30d: messages.filter((e) => e.t >= now - 30 * DAY).length,
        bot_last_message_at: messages.length ? new Date(Math.max(...messages.map((e) => e.t))).toISOString() : null,
        web_products: site.products ?? null, web_linked: site.linked ?? null, web_price_off: site.price_off ?? null, web_stock_off: site.stock_off ?? null, web_below_cost: site.below_cost ?? null,
        web_proposals_pending: out.web_prices.length, web_proposals_below_cost: out.web_prices.filter((r) => r.below_cost).length,
        web_last_sync_at: m.websiteSync && m.websiteSync.lastRunAt ? new Date(D.toMs(m.websiteSync.lastRunAt)).toISOString() : null,
        purchase_docs: purchaseDocs.length
    }];
    out.summary2 = [{
        karcher_balance: karcherBalance, karcher_due_30d: r2(due30), karcher_last_statement: statement ? statement.date : null, karcher_statement_open: statement ? statement.openTotal : null,
        star_partial_paid: r2(payments.filter((p) => supplierOf(p.beneficiary).startsWith('Star') && p.date >= `${new Date(now).getFullYear()}-01-01`).reduce((a, p) => a + p.amount, 0)),
        duty_12m: r2(dutyOnSales12m), duty_products: landed.filter((r) => r.duty_rate > 0).length, fee_rate: r4(FEE),
        clearance_never_value: r2(out.clearance.filter((c) => c.group === 'Never sold').reduce((a, c) => a + (c.value_at_cost || 0), 0)),
        clearance_never_products: out.clearance.filter((c) => c.group === 'Never sold').length,
        customers_2plus: [...cust.values()].filter((c) => c.n >= 2).length, lapsed_customers: lapsed.length, lapsed_spent: r2(lapsed.reduce((a, c) => a + c.net, 0)),
        baskets, multi_baskets: multi,
        bot_orders_created: out.bot_funnel[2].count, bot_orders_arrived: out.bot_orders_monthly.reduce((a, r) => a + r.arrived, 0),
        bot_orders_missing: out.bot_orders_monthly.reduce((a, r) => a + r.missing, 0), bot_orders_missing_90d: missing90,
        out_of_stock_asked: out.demand_stock.filter((r) => r.signal === 'Out of stock').length,
        target: Number(m.monthlyTarget) > 0 ? Number(m.monthlyTarget) : D.MONTHLY_TARGET_DEFAULT
    }];
    return out;
}

// ============================================================================ small derived figures
// (the reference page's "calcs", as plain functions over the rows above)

export const mtdChange = (s) => (s.prev_month_to_date ? (s.month_to_date - s.prev_month_to_date) / s.prev_month_to_date : null);
export const slowShare = (s) => (s.stock_value_cost ? s.slow_stock_value / s.stock_value_cost : null);

// This month against the target: what a steady pace would have reached by today, and where the
// month ends at the current daily rate.
export function pace(s, target, now = Date.now()) {
    const d = new Date(now), day = d.getDate(), days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const expected = target * day / days, projected = s.month_to_date / day * days;
    return { target, month_to_date: s.month_to_date, day, days, expected_by_today: expected, pace: expected ? s.month_to_date / expected : null, projected, projected_share: target ? projected / target : null };
}
export const thisMonthCosts = (rows) => rows.slice().sort((a, b) => a.month.localeCompare(b.month))[rows.length - 1] || {};
export const topAsk = (rows) => rows.reduce((a, r) => (!a || r.questions > a.questions ? r : a), null) || {};

// The month the most people wrote to the chatbot, and the last complete month (this one left out).
export function botTrend(botMonthly, onlineMonthly) {
    const rows = botMonthly.slice().sort((a, b) => a.month.localeCompare(b.month));
    const full = rows.length > 1 ? rows.slice(0, -1) : rows;
    const peak = full.reduce((a, r) => (r.people > a.people ? r : a), full[0] || {});
    const last = full[full.length - 1] || {};
    const ordered = onlineMonthly.filter((r) => r.orders > 0).map((r) => r.month).sort();
    return { peak_month: peak.month, peak_people: peak.people, last_month: last.month, last_people: last.people, last_online_month: ordered[ordered.length - 1] || null };
}
// Chatbot orders from December 2025 on: Oct-Nov 2025 were its first weeks, entered by hand, so they never link.
export function botOrdersSince(rows, from = '2025-12') {
    const r = rows.filter((x) => x.month >= from);
    const created = r.reduce((a, x) => a + x.created, 0), arrived = r.reduce((a, x) => a + x.arrived, 0);
    return { created, arrived, missing: created - arrived, arrived_share: created ? arrived / created : null };
}
export const funnelRates = (rows) => rows.slice().sort((a, b) => a.order - b.order)
    .map((r, i, all) => ({ ...r, of_previous: i && all[i - 1].count ? r.count / all[i - 1].count : null }));
// For each weekday, the hour the most messages arrive; a post an hour earlier is in front of people just before they write.
export const postTimes = (botHours) => WEEKDAYS.map((weekday, i) => {
    const rows = botHours.filter((r) => r.day === i);
    const top = rows.reduce((a, r) => (r.messages > a.messages ? r : a), rows[0] || { hour: 0, messages: 0 });
    return { weekday, day: i, peak_hour: top.hour, peak_messages: top.messages, day_messages: rows.reduce((a, r) => a + r.messages, 0), post_at: (top.hour + 23) % 24 };
});
export function purchaseTotals(rows) {
    const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const months = rows.map((r) => r.month).sort();
    return { invoiced: sum('karcher_invoiced'), invoices: sum('invoices'), paid: sum('karcher_paid'), other: sum('other_paid'), customs: sum('customs_taxes'), first_month: months[0] || null };
}
