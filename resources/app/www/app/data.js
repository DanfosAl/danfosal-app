// The one place that defines what the numbers mean.
//
// Before the redesign every page computed revenue, cost, customers and stock alerts its own way,
// which is how one app showed three different customer counts and "profit equal to revenue".
// New screens read these definitions instead of inventing their own. The rules match the
// Phase 0 data fix (GOLDEN_MANIFEST Finding #25).
import { db, ready, collection, getDocs, doc, getDoc, query, where } from './firebase.js';

export const VAT = 1.2;                  // Albanian standard VAT, 20%
export const RESTOCK_DAYS = 42;          // a Kärcher restock takes ~6 weeks (owner, 21 Sep 2026)
export const SALES_WINDOW_DAYS = 90;     // "how fast does it sell" looks back this far
export const MIN_UNITS_FOR_TREND = 2;    // one sale in 90 days is not a trend
export const DAY = 86400000;
const CLOSED_TICKET = new Set(['completed', 'cancelled', 'rejected', 'delivered', 'closed']);
const CLOSED_ORDER = new Set(['Paid', 'Returned', 'Cancelled']);

// ------------------------------------------------------------------ time and names

export function toMs(t) {
    if (t == null || t === '') return NaN;
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t.seconds === 'number') return t.seconds * 1000;
    if (typeof t === 'number') return t < 1e12 ? t * 1000 : t;
    return new Date(t).getTime();
}
export const saleTime = s => toMs(s.timestamp) || toMs(s.date);
export const orderTime = o => toMs(o.timestamp) || toMs(o.orderDate);
export const orderTotal = o => Number(o.total) || Number(o.price) || 0;

// Placeholders the receipts use when nobody gave a name.
export const WALKIN = /walk.?in|klient.*(pa|i )|klien(t)?\s+privat|^pa\s+klient|anonim|^-+$|^\?+$|^n\/?a$/i;

// Spelling-normalised customer identity: accents, case, punctuation and "Sh.p.k" don't make a new customer.
export function customerKey(name) {
    return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/\b(sh\.?\s?p\.?\s?k\.?|shpk|sh\.?a\.?)\b/g, ' ')
        .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function saleSource(s) {
    if (s.type === 'easypos') return 'EasyPOS';
    if ((s.source || '').startsWith('Manual PDF')) return 'PDF';
    if (s.source === 'imported') return 'Import';
    return 'Till';
}
export const saleInvoiceNumber = s => s.invoiceNumber || (s.easypos && s.easypos.invoiceNumber) || '';
// EasyPOS numbers carry the device suffix ("351/2026/mv200vz195"); people say "351/2026".
export const shortInvoice = n => String(n || '').split('/').slice(0, 2).join('/');

// ------------------------------------------------------------------ money

// Net revenue: the printed subtotal when the invoice has one, otherwise the total without VAT.
export const netRevenue = s => Number(s.subtotal) > 0 ? Number(s.subtotal) : (Number(s.total) || 0) / VAT;

// A line's net unit cost. `cost` is stored VAT-inclusive (till sales, the 2025 import and the
// Phase 0 backfill all follow that convention); `netCost` is exact where it exists.
export function lineNetCost(item) {
    if (item.isService) return 0;          // labour/services carry no stock cost
    if (Number(item.netCost) > 0) return Number(item.netCost);
    if (Number(item.cost) > 0) return Number(item.cost) / VAT;
    return null;
}

// Net cost of a whole sale, or null when any line's cost is unknown - a partly costed sale
// would otherwise show a flattering margin.
export function saleNetCost(sale) {
    const items = sale.items || [];
    if (!items.length) return null;
    let total = 0;
    for (const item of items) {
        const c = lineNetCost(item);
        if (c === null) return null;
        total += c * (Number(item.quantity) || 1);
    }
    return total;
}

export function productNetCost(p) {
    if (Number(p.baseCost) > 0) return Number(p.baseCost);
    if (Number(p.cost) > 0) return Number(p.cost) / VAT;
    return null;
}

// Margin on a product's list price. Prices are VAT-inclusive, costs are compared net.
export function productMargin(p) {
    const net = productNetCost(p), price = Number(p.price) || 0;
    if (!net || !price) return null;
    return (price / VAT - net) / (price / VAT);
}

// ------------------------------------------------------------------ refunds

// A refunded sale is not in `storeSales` at all: the till bridge spots the credit note, writes it
// to `returns` and leaves the original sale standing. So every number that counts sales has to
// take the refund back off, or the month keeps money that was handed back. Quantities on a refund
// are negative; `total` is the positive amount refunded, VAT included, like a sale's total.
const dmy = d => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(d || '')); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
export const returnTime = r => toMs(r.timestamp) || toMs(dmy(r.invoiceDate));
export const returnTotal = r => Math.abs(Number(r.total) || 0);
export const returnNet = r => returnTotal(r) / VAT;

// Receipt lines on a refund carry no product link, so match the name the way the Link screen
// does: the product's own name, or any till name already linked to it.
export function productNameIndex(products) {
    const byName = new Map();
    (products || []).forEach(p => [p.name, ...(Array.isArray(p.receiptNames) ? p.receiptNames : [])]
        .forEach(n => { const k = squash(n); if (k && !byName.has(k)) byName.set(k, p); }));
    return byName;
}

// One row per refunded line: units and money as positive numbers, plus the product when the name
// matches one. Some refunds have no lines at all - there only the amount is known.
export function returnLines(r, byName) {
    return (r.items || []).map(i => ({
        product: (byName && byName.get(squash(i.itemName || i.name || ''))) || null,
        name: String(i.itemName || i.name || '').trim(),
        units: Math.abs(Number(i.quantity) || 1),
        net: Math.abs(Number(i.lineTotal) || (Number(i.pricePerUnit) || 0) * (Number(i.quantity) || 1)) / VAT
    }));
}

// What the returned goods cost you. The stock came back, so this cost comes off the month's cost
// as well. Null when a line has no product or no cost - a half-known refund would flatter margin.
export function returnNetCost(r, byName) {
    const lines = returnLines(r, byName);
    if (!lines.length) return null;
    let cost = 0;
    for (const line of lines) {
        const c = line.product ? productNetCost(line.product) : null;
        if (!c) return null;
        cost += c * line.units;
    }
    return cost;
}

// Compare receipt names the way the bridge does: case, spacing and punctuation don't matter.
export const squash = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const foldText = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Rank products for a typed query (till, linking, search): exact names first, then names that
// start with the query, then the products you actually sell, then shorter names.
export function rankProducts(products, query, soldUnits = {}, limit = 10) {
    const q = foldText(query).trim();
    if (!q) return [];
    const terms = q.split(/\s+/);
    return products
        .map(p => ({ p, hay: foldText(`${p.name} ${p.code || ''} ${p.producer || ''}`), name: foldText(p.name) }))
        .filter(x => terms.every(t => x.hay.includes(t)))
        .map(x => ({ p: x.p, score: (squash(x.p.name) === squash(q) ? 5 : 0) + (x.name.startsWith(q) ? 3 : 0) + Math.min(soldUnits[x.p._id] || 0, 40) / 40 - x.name.length / 300 }))
        .sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.p);
}

function editDistance(a, b) {
    if (a === b) return 0;
    if (!a) return b.length; if (!b) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = cur;
    }
    return prev[b.length];
}

// Approximate suggestions for a receipt name that matched nothing exactly (linking). Receipt names
// are exactly the ones that don't match: OCR drops a slash ("NT 2211 Ap L" for "NT 22/1 Ap L"),
// adds words ("CA 50 C Eco 5l cleaner") or a producer prefix. So score by close spelling and shared
// words instead of requiring every word to match. The owner still picks - nothing links by itself.
export function suggestProducts(products, text, limit = 6) {
    const strip = s => foldText(s).replace(/^(k[aä]rcher|karcher|kaercher)\s+/, '');
    const target = squash(strip(text));
    const tokens = strip(text).split(/[^a-z0-9]+/).filter(t => t.length >= 2);
    if (!target) return [];
    return products.map(p => {
        const name = squash(strip(p.name));
        if (!name) return null;
        const similarity = 1 - editDistance(target, name) / Math.max(target.length, name.length);
        const shared = tokens.length ? tokens.filter(t => name.includes(t)).length / tokens.length : 0;
        const contains = name.includes(target) || target.includes(name) ? 0.25 : 0;
        return { p, score: 0.6 * similarity + 0.4 * shared + contains };
    }).filter(x => x && x.score >= 0.35).sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.p);
}

// Each line's share of the sale's net revenue. Line prices include VAT except on PDF invoices,
// and discounts only show in the total, so the lines are scaled to add up to netRevenue(sale) -
// the same figure Today and Sell use.
export function lineNetRevenues(sale) {
    const items = sale.items || [];
    const pdf = (sale.source || '').startsWith('Manual PDF');
    const raw = items.map(i => (Number(i.price) || 0) * (Number(i.quantity) || 1) / (pdf ? 1 : VAT));
    const sum = raw.reduce((a, b) => a + b, 0);
    const net = netRevenue(sale);
    return sum > 0 ? raw.map(r => r * net / sum) : items.map(() => items.length ? net / items.length : 0);
}

// Product family from the name, for "where does the profit come from". Kärcher model prefixes
// first, then the local names the receipts use (mop, karroce, gome, doreze...).
const FAMILIES = [
    ['Detergents', /^(k[aä]rcher\s+)?(rm|ca)\s?\d|\bca\s?\d+\s?c\b|rulopak|repox|detergj|shampo|liquid|bleach|blancus|descal|stain\s?fix|solucion|remov|\brust\b|kopug|pro\s?glass|wood cleaner|\b\d+([.,]\d+)?\s?l\b/i],
    ['Pressure washers', /^(k[aä]rcher\s+)?(k\s?\d|k\s?(mini|compact)|hds?\s?\d|hds\b|g\s?\d{4})|presion/i],
    ['Vacuums', /^(k[aä]rcher\s+)?(wd|nt|vc|vch|cv|ds|ad|vp|t)\s?\d|^(k[aä]rcher\s+)?(cvh|ad)\b/i],
    ['Steam cleaners', /^(k[aä]rcher\s+)?(sc|sg|sgv|sv)\s?\d/i],
    ['Floor cleaners & scrubbers', /^(k[aä]rcher\s+)?(fc|fcv|rcv|bd|bds|br|b|km|fp|pcl|s)\s?\d|^(k[aä]rcher\s+)?(efc|bds|pcl)\b|fcfloor/i],
    ['Carpet & upholstery', /^(k[aä]rcher\s+)?(se\s?\d|puzzi)|carpet\s*&|upholst/i],
    ['Window cleaning', /^(k[aä]rcher\s+)?(wv|wvp|kv)\s?\d|window|xham/i],
    ['Janitorial supplies', /^(star|mop|mbajt|karroc|karoc|gom[aeë]|doreze|pad\b|qese|bisht|fsh[eë]s|cloth|sfung|kov[aë]|teha|shoe)|microfiber|lecka|\bsign\b/i],
    ['Parts & accessories', /filter|nozzle|hose|brush|cartridge|o-ring|extension|jet|\bset\b|adapter|lance|kit\b|attachment|plastik|rubber|pjes|motor|wheel|spray|suction|tub[eë]?\b|pump|tool|replacement|lock|aksesor|papuce|kfi|glider|accessor|disk|qeleshe|gyp|trigger|dirt\s?blaster|^db\s?\d|^fr\s|^ps\s?\d|^tla\b/i]
];
export function productFamily(name, item) {
    if (item && item.isService) return 'Services';
    const n = String(name || '').trim();
    const hit = FAMILIES.find(([, re]) => re.test(n));
    return hit ? hit[0] : 'Other';
}

// Which catalogue product a sale line is. Older EasyPOS lines have made-up ids
// ("easypos-mop-per-pastrim-80cm"); the Phase 0 fix linked them via costProductId.
export function productIdOfLine(item, knownIds) {
    if (item.costProductId && knownIds.has(item.costProductId)) return item.costProductId;
    if (item.productId && knownIds.has(item.productId)) return item.productId;
    return null;
}

// ------------------------------------------------------------------ loading

export async function loadAll() {
    await ready;
    const all = name => getDocs(collection(db, name)).then(snap => snap.docs.map(d => ({ _id: d.id, ...d.data() })));
    const [products, sales, orders, customers, tickets, warranties, debtorDocs, corrections, expenses, creditorDocs] = await Promise.all([
        all('products'), all('storeSales'), all('onlineOrders'), all('customers'),
        all('serviceTickets'), all('warrantyCards'), getDocs(collection(db, 'debtors')), all('stockCorrections'),
        all('expenses'), getDocs(collection(db, 'creditors'))
    ]);
    // Yearly purchase plans, the order list and refunds: small collections, all needed for totals.
    const [predictions, orderLines, returns] = await Promise.all([all('predictions'), all('toOrder'), all('returns')]);
    // The chatbot's order lines only (about 150 of its 6,700 events), so Today can flag the ones
    // that never became an order here. Sell > Instagram reads the rest of the log when it opens.
    let botOrders = [];
    try {
        const snap = await getDocs(query(collection(db, 'analytics_events'), where('event_name', '==', 'order_created')));
        botOrders = snap.docs.map(d => {
            const v = d.data(), prm = v.params || {};
            return { _id: d.id, t: toMs(v.timestamp) || toMs(v.created_at), orderId: prm.order_id || '', revenue: Number(prm.revenue) || 0,
                items: Number(prm.item_count) || 0, handled: !!v.handled, linkedOrderId: v.linkedOrderId || '' };
        }).filter(b => !isNaN(b.t));
    } catch { /* no chatbot events, or no permission: Today simply has nothing to say about them */ }
    // What you owe suppliers: creditors/{id} with invoices/{id} and payments/{id} beneath it.
    const creditors = await Promise.all(creditorDocs.docs.map(async c => {
        const [inv, pay] = await Promise.all([getDocs(collection(db, 'creditors', c.id, 'invoices')), getDocs(collection(db, 'creditors', c.id, 'payments'))]);
        return { _id: c.id, ...c.data(), invoices: inv.docs.map(i => ({ _id: i.id, ...i.data() })), payments: pay.docs.map(x => ({ _id: x.id, ...x.data() })) };
    }));
    // Debts live one level down: debtors/{id}/invoices, each with its own remainingBalance.
    const debts = [];
    await Promise.all(debtorDocs.docs.map(async d => {
        const invoices = await getDocs(collection(db, 'debtors', d.id, 'invoices'));
        invoices.forEach(i => debts.push({ _id: i.id, debtorId: d.id, debtor: d.data().name || '', ...i.data() }));
    }));
    // Owner decisions kept in settings: receipt names that are services (Stock > Link receipt
    // items), and lookalike customer names confirmed to be different people (Customers > Review).
    let receiptServices = [], notSameCustomers = [];
    try {
        const [s, r] = await Promise.all([getDoc(doc(db, 'settings', 'receiptNames')), getDoc(doc(db, 'settings', 'customerReview'))]);
        if (s.exists()) receiptServices = s.data().services || [];
        if (r.exists()) notSameCustomers = r.data().notSame || [];
    } catch { /* first use: the documents don't exist yet */ }
    const debtors = debtorDocs.docs.map(d => ({ _id: d.id, ...d.data() }));
    return { products, sales, orders, customers, tickets, warranties, debts, debtors, corrections, expenses, creditors, predictions, orderLines, returns, botOrders, receiptServices, notSameCustomers, loadedAt: Date.now() };
}

// ------------------------------------------------------------------ customers

// One entry per customer: every profile, plus every named buyer who has no profile yet, with a
// profile's own spellings (name and aliases) and any profile merged into it all counting as one.
// This is the single answer to "who is this customer" - the classic app had three.
export function customerDirectory(m) {
    const entries = new Map(), keyToId = new Map();
    const make = (id, name, profile) => ({ id, name: String(name || '').trim(), profile: profile || null, keys: new Set(),
        sales: [], orders: [], warranties: [], tickets: [], debts: [],
        nipt: (profile && profile.nipt) || '', phone: (profile && profile.phone) || '', email: (profile && profile.email) || '', address: (profile && profile.address) || '' });
    const claim = (key, id) => { if (key && !keyToId.has(key)) { keyToId.set(key, id); entries.get(id).keys.add(key); } };
    const live = m.customers.filter(c => !c.mergedInto && c.name && !WALKIN.test(c.name));
    live.forEach(p => { const e = make('p:' + p._id, p.name, p); entries.set(e.id, e); [p.name, ...(p.aliases || [])].forEach(n => claim(customerKey(n), e.id)); });
    m.customers.filter(c => c.mergedInto && entries.has('p:' + c.mergedInto))
        .forEach(c => [c.name, ...(c.aliases || [])].forEach(n => claim(customerKey(n), 'p:' + c.mergedInto)));
    const entryFor = name => {
        if (!name || WALKIN.test(name)) return null;
        const key = customerKey(name); if (!key) return null;
        if (!keyToId.has(key)) { const e = make('n:' + key, name, null); entries.set(e.id, e); claim(key, e.id); }
        return entries.get(keyToId.get(key));
    };
    m.sales.forEach(s => {
        const e = entryFor(s.clientName || s.customerName); if (!e) return;
        e.sales.push(s);
        const nipt = s.customerNipt || (s.easypos && s.easypos.customerNIPT);
        if (nipt && !e.nipt) e.nipt = nipt;
        if (!e.address && s.customerAddress) e.address = s.customerAddress;
    });
    m.orders.forEach(o => {
        const e = entryFor(o.clientName || o.customerName); if (!e) return;
        e.orders.push(o);
        if (!e.phone) e.phone = o.telephone || o.phoneNumber || '';
        if (!e.address) e.address = o.address || o.deliveryAddress || '';
    });
    m.warranties.forEach(w => { const e = entryFor(w.customerName); if (e) e.warranties.push(w); });
    m.tickets.forEach(t => { const e = entryFor(t.customerName); if (e) { e.tickets.push(t); if (!e.phone) e.phone = t.customerPhone || ''; } });
    m.debts.forEach(d => { const e = entryFor(d.debtor); if (e) e.debts.push(d); });
    entries.forEach(e => {
        const times = e.sales.map(saleTime).concat(e.orders.map(orderTime)).filter(t => !isNaN(t));
        const bought = e.sales.filter(s => !s.isReturn);
        e.revenue = bought.reduce((a, s) => a + (Number(s.total) || 0), 0) + e.orders.reduce((a, o) => a + orderTotal(o), 0);
        e.count = bought.length + e.orders.length;
        e.first = times.length ? Math.min(...times) : null;
        e.last = times.length ? Math.max(...times) : null;
        e.owed = e.debts.reduce((a, d) => a + Math.max(0, Number(d.remainingBalance) || 0), 0);
        e.phoneDigits = String(e.phone || '').replace(/\D/g, '');
    });
    return [...entries.values()];
}

// Pairs of customers whose names differ by a letter or two - usually one person, spelled two ways
// (OCR reads "ç" as "g": Koçi / Kogi). Only suggestions: the owner decides in Customers > Review.
export function lookalikeCustomers(directory, notSame = []) {
    const dismissed = new Set(notSame);
    const list = directory.filter(e => [...e.keys][0] && [...e.keys][0].length >= 5);
    const pairs = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = [...list[i].keys][0], b = [...list[j].keys][0];
        if (Math.abs(a.length - b.length) > 2) continue;
        if ((a.match(/\d+/g) || []).join() !== (b.match(/\d+/g) || []).join()) continue;
        const d = editDistance(a, b);
        if (d === 0 || d > (Math.min(a.length, b.length) >= 10 ? 2 : 1)) continue;
        const pairKey = [a, b].sort().join('|');
        if (dismissed.has(pairKey)) continue;
        // Two different phone numbers or NIPTs are evidence against; show it, and list those last.
        const pa = list[i].phoneDigits.slice(-8), pb = list[j].phoneDigits.slice(-8);
        const conflict = (pa && pb && pa !== pb) || (list[i].nipt && list[j].nipt && list[i].nipt !== list[j].nipt);
        pairs.push({ a: list[i], b: list[j], distance: d, pairKey, conflict });
    }
    // Shared NIPT is certain evidence of one business under two names.
    const byNipt = new Map();
    directory.forEach(e => { const n = String(e.nipt || '').toUpperCase().replace(/\s/g, ''); if (n) { if (!byNipt.has(n)) byNipt.set(n, []); byNipt.get(n).push(e); } });
    byNipt.forEach(group => { for (let i = 1; i < group.length; i++) {
        const pairKey = [[...group[0].keys][0], [...group[i].keys][0]].sort().join('|');
        if (!dismissed.has(pairKey) && !pairs.some(p => p.pairKey === pairKey)) pairs.push({ a: group[0], b: group[i], distance: 0, sameNipt: true, pairKey });
    } });
    return pairs.sort((x, y) => (y.sameNipt ? 1 : 0) - (x.sameNipt ? 1 : 0) || (x.conflict ? 1 : 0) - (y.conflict ? 1 : 0) || x.distance - y.distance);
}

// Every EasyPOS receipt line that isn't linked to a catalogue product, grouped by the name on the
// receipt. Such lines never reduced stock and have no cost, so profit on them is unknown.
export function unlinkedReceiptLines(m) {
    const knownIds = new Set(m.products.map(p => p._id));
    const services = new Set((m.receiptServices || []).map(squash));
    const groups = new Map();
    m.sales.forEach(sale => {
        if (sale.type !== 'easypos') return;
        (sale.items || []).forEach((item, index) => {
            if (item.isService || productIdOfLine(item, knownIds)) return;
            const name = String(item.name || item.product || '').trim();
            if (!name || services.has(squash(name))) return;
            const key = squash(name);
            const g = groups.get(key) || { name, key, lines: [], units: 0, revenue: 0, last: 0 };
            const qty = Number(item.quantity) || 1;
            g.lines.push({ saleId: sale._id, index, qty });
            g.units += qty;
            g.revenue += (Number(item.price) || 0) * qty;
            g.last = Math.max(g.last, saleTime(sale) || 0);
            groups.set(key, g);
        });
    });
    return [...groups.values()].sort((a, b) => b.last - a.last);
}

// ------------------------------------------------------------------ analysis

export function analyze(m, now = Date.now()) {
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const today0 = startOfToday.getTime();
    const monthStart = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1).getTime();
    const prevMonthStart = new Date(startOfToday.getFullYear(), startOfToday.getMonth() - 1, 1).getTime();
    const dayOfMonth = startOfToday.getDate();
    const prevMonthSameDay = Math.min(new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 0).getDate(), dayOfMonth);
    const prevMonthCutoff = new Date(startOfToday.getFullYear(), startOfToday.getMonth() - 1, prevMonthSameDay + 1).getTime();
    const since30 = now - 30 * DAY, sinceWindow = now - SALES_WINDOW_DAYS * DAY;

    const productById = new Map(m.products.map(p => [p._id, p]));
    const knownIds = new Set(productById.keys());
    const sales = m.sales.filter(s => !s.isReturn);
    const refunds = (m.returns || []).map(r => ({ ...r, _t: returnTime(r) })).filter(r => !isNaN(r._t));
    const byName = productNameIndex(m.products);

    // ---- revenue: today, month to date, and the same days of last month.
    // Money handed back comes off the day it was handed back - the sale itself stays as it was.
    const revenueOf = (from, to) =>
        sales.filter(s => { const t = saleTime(s); return t >= from && t < to; }).reduce((a, s) => a + (Number(s.total) || 0), 0)
        + m.orders.filter(o => { const t = orderTime(o); return t >= from && t < to; }).reduce((a, o) => a + orderTotal(o), 0)
        - refunds.filter(r => r._t >= from && r._t < to).reduce((a, r) => a + returnTotal(r), 0);
    const todayRevenue = revenueOf(today0, now + DAY);
    const monthRevenue = revenueOf(monthStart, now + DAY);
    const prevMonthToDate = revenueOf(prevMonthStart, prevMonthCutoff);
    const monthSalesCount = sales.filter(s => saleTime(s) >= monthStart).length + m.orders.filter(o => orderTime(o) >= monthStart).length;
    const dailySeries = [];
    for (let d = 0; d < dayOfMonth; d++) {
        const from = monthStart + d * DAY;
        dailySeries.push(revenueOf(from, from + DAY));
    }

    // ---- margin over the last 30 days, net to net, only on fully costed sales
    let net30 = 0, costedNet30 = 0, cost30 = 0, count30 = 0, costedCount30 = 0;
    sales.filter(s => saleTime(s) >= since30).forEach(s => {
        const net = netRevenue(s); const cost = saleNetCost(s);
        net30 += net; count30++;
        if (cost !== null) { costedNet30 += net; cost30 += cost; costedCount30++; }
    });
    // A refund reverses both sides: the money went back to the customer, the goods came back to
    // the shelf. Only refunds we can cost come off the costed pair, so margin stays like for like.
    const refunds30 = refunds.filter(r => r._t >= since30);
    refunds30.forEach(r => {
        const net = returnNet(r), cost = returnNetCost(r, byName);
        net30 -= net;
        if (cost !== null) { costedNet30 -= net; cost30 -= cost; }
    });
    const margin30 = costedNet30 > 0 ? (costedNet30 - cost30) / costedNet30 : null;
    const refunded30 = refunds30.reduce((a, r) => a + returnTotal(r), 0);
    const refunded12m = refunds.filter(r => r._t >= now - 365 * DAY).reduce((a, r) => a + returnTotal(r), 0);

    // ---- stock: how fast each product sells, what to reorder, what isn't moving
    const soldUnits = {}, lastSoldAt = {};
    const countLines = (list, timeOf) => list.forEach(rec => {
        const t = timeOf(rec);
        (rec.items || []).forEach(item => {
            const pid = productIdOfLine(item, knownIds);
            if (!pid) return;
            if (t > (lastSoldAt[pid] || 0)) lastSoldAt[pid] = t;
            if (t >= sinceWindow) soldUnits[pid] = (soldUnits[pid] || 0) + (Number(item.quantity) || 1);
        });
    });
    countLines(sales, saleTime);
    countLines(m.orders, orderTime);
    // Units that came back are not units sold. Never below zero: the sale itself may be older
    // than the 90-day window while the refund falls inside it.
    refunds.forEach(r => { if (r._t >= sinceWindow) returnLines(r, byName).forEach(l => {
        if (l.product) soldUnits[l.product._id] = Math.max(0, (soldUnits[l.product._id] || 0) - l.units);
    }); });
    // Only recent unlinked lines are "needs you"; the Link screen shows them all.
    const unmatched = unlinkedReceiptLines(m).filter(g => g.last >= sinceWindow).map(g => [g.name, g.units]);

    let stockValue = 0, unsoldValue = 0;
    const reorder = [], unsold = [], soldWithoutCost = [];
    m.products.forEach(p => {
        const stock = Number(p.stock) || 0;
        const units = soldUnits[p._id] || 0;
        const unitCost = productNetCost(p);
        if (stock > 0 && unitCost) stockValue += stock * unitCost;
        if (units >= MIN_UNITS_FOR_TREND) {
            const daysLeft = stock / (units / SALES_WINDOW_DAYS);
            if (daysLeft < RESTOCK_DAYS) reorder.push({ product: p, units, stock, daysLeft });
        }
        if (stock > 0 && !units) { unsold.push({ product: p, stock, value: stock * (unitCost || 0) }); unsoldValue += stock * (unitCost || 0); }
        if (units > 0 && !unitCost) soldWithoutCost.push({ product: p, units });
    });
    reorder.sort((a, b) => a.daysLeft - b.daysLeft);
    unsold.sort((a, b) => b.value - a.value);

    // Products the 14 Sep correction couldn't fix (more sold than ever held), still at the
    // stock they had then - i.e. nobody has counted them yet.
    const latestCorrection = [...m.corrections].sort((a, b) => toMs(b.appliedAt) - toMs(a.appliedAt))[0];
    const needsCount = ((latestCorrection && latestCorrection.skipped) || [])
        .map(s => ({ ...s, product: productById.get(s.id) }))
        .filter(s => s.product && Number(s.product.stock) === Number(s.before));

    // ---- customers: one definition everywhere (named buyers, spelling-normalised)
    const firstSeen = new Map();
    const note = (name, t) => {
        if (!name || WALKIN.test(name)) return;
        const key = customerKey(name); if (!key) return;
        const when = isNaN(t) ? Infinity : t;
        if (!firstSeen.has(key) || when < firstSeen.get(key).t) firstSeen.set(key, { t: when, name: String(name).trim() });
    };
    m.orders.forEach(o => note(o.clientName || o.customerName, orderTime(o)));
    m.sales.forEach(s => note(s.clientName || s.customerName, saleTime(s)));
    m.customers.forEach(c => note(c.name, toMs(c.createdAt)));
    const newCustomers30 = [...firstSeen.values()].filter(v => v.t >= since30).length;

    // ---- service, online orders, debts
    const openTickets = m.tickets.filter(t => !CLOSED_TICKET.has(String(t.status || '').toLowerCase()))
        .map(t => ({ ticket: t, ageDays: Math.floor((now - toMs(t.createdAt)) / DAY) }))
        .sort((a, b) => b.ageDays - a.ageDays);
    const openOrders = m.orders.filter(o => !CLOSED_ORDER.has(o.status))
        .map(o => ({ order: o, ageDays: Math.floor((now - orderTime(o)) / DAY) }))
        .sort((a, b) => b.ageDays - a.ageDays);
    const owed = m.debts.filter(d => Number(d.remainingBalance) > 0);
    const owedTotal = owed.reduce((a, d) => a + Number(d.remainingBalance), 0);

    // ---- pipeline and data health
    const lastEasypos = Math.max(0, ...m.sales.filter(s => s.type === 'easypos').map(saleTime).filter(t => !isNaN(t)));
    const polluted = m.customers.filter(c => /\bcop[eë]\s*x\s*\d|x\s*\d+[.,]\d{2}\s+\d+[.,]\d{2}\s*$/i.test(c.address || '')).length;

    // ---- orders the chatbot logged that never became an order here. Only ones carrying money
    // and only the last 90 days: the older ones are the bot's first weeks, already dealt with.
    const orderIds = new Set(m.orders.map(o => o._id));
    const botMissing = (m.botOrders || []).filter(b => b.t >= now - 90 * DAY && b.revenue > 0 && !b.handled
        && !orderIds.has(b.orderId) && !(b.linkedOrderId && orderIds.has(b.linkedOrderId)))
        .sort((x, y) => y.t - x.t);

    // ---- today's activity and the most recent sale
    const activity = [];
    m.sales.forEach(s => {
        const t = saleTime(s); if (!(t >= today0)) return;
        const who = s.clientName || s.customerName || 'Walk-in';
        const inv = shortInvoice(saleInvoiceNumber(s));
        activity.push({ t, what: `${inv ? (s.type === 'easypos' ? 'Receipt ' : 'Invoice ') + inv + ' · ' : 'Sale · '}${WALKIN.test(who) ? 'walk-in' : who}`, chip: saleSource(s), amount: Number(s.total) || 0 });
    });
    m.orders.forEach(o => { const t = orderTime(o); if (t >= today0) activity.push({ t, what: `Online order · ${o.clientName || o.customerName || '?'}`, chip: 'Online', amount: orderTotal(o) }); });
    refunds.forEach(r => { if (r._t >= today0) activity.push({ t: r._t, what: `Refund · ${WALKIN.test(r.customerName || '') ? 'walk-in' : (r.customerName || '?')}`, chip: 'Refund', amount: -returnTotal(r) }); });
    m.warranties.forEach(w => { const t = toMs(w.createdAt); if (t >= today0) activity.push({ t, what: `Warranty issued · ${w.customerName || ''}`, chip: 'Garanci', amount: null }); });
    m.tickets.forEach(tk => { const t = toMs(tk.createdAt); if (t >= today0) activity.push({ t, what: `Repair ticket · ${tk.customerName || ''}`, chip: 'Service', amount: null }); });
    activity.sort((a, b) => b.t - a.t);
    const lastSale = [...m.sales].sort((a, b) => saleTime(b) - saleTime(a))[0] || null;

    return {
        now, today0, monthStart,
        todayRevenue, monthRevenue, prevMonthToDate, monthSalesCount, dailySeries,
        net30, costedNet30, cost30, margin30, count30, costedCount30,
        refunds, refunds30, refunded30, refunded12m, productNames: byName, botMissing,
        soldUnits, lastSoldAt, reorder, unsold, unsoldValue, stockValue, soldWithoutCost,
        unmatched,
        productsSold: Object.keys(soldUnits).length,
        needsCount,
        customers: firstSeen.size, newCustomers30, customerNames: [...firstSeen.values()].map(v => v.name),
        openTickets, openOrders, owed, owedTotal,
        lastEasypos, polluted,
        activity, lastSale
    };
}
