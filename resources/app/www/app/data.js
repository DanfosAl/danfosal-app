// The one place that defines what the numbers mean.
//
// Before the redesign every page computed revenue, cost, customers and stock alerts its own way,
// which is how one app showed three different customer counts and "profit equal to revenue".
// New screens read these definitions instead of inventing their own. The rules match the
// Phase 0 data fix (GOLDEN_MANIFEST Finding #25).
import { db, ready, collection, getDocs, doc, getDoc } from './firebase.js';

export const VAT = 1.2;                  // Albanian standard VAT, 20%
export const RESTOCK_DAYS = 42;          // a Kärcher restock takes ~6 weeks (owner, 21 Sep 2026)
export const SALES_WINDOW_DAYS = 90;     // "how fast does it sell" looks back this far
export const MIN_UNITS_FOR_TREND = 2;    // one sale in 90 days is not a trend
export const DAY = 86400000;
const CLOSED_TICKET = new Set(['completed', 'cancelled', 'rejected', 'delivered', 'closed']);
const CLOSED_ORDER = new Set(['Paid', 'Returned']);

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
export const WALKIN = /walk.?in|klient.*(pa|i )|klien(t)?\s+privat|anonim|^-+$|^\?+$|^n\/?a$/i;

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
    const [products, sales, orders, customers, tickets, warranties, debtorDocs, corrections] = await Promise.all([
        all('products'), all('storeSales'), all('onlineOrders'), all('customers'),
        all('serviceTickets'), all('warrantyCards'), getDocs(collection(db, 'debtors')), all('stockCorrections')
    ]);
    // Debts live one level down: debtors/{id}/invoices, each with its own remainingBalance.
    const debts = [];
    await Promise.all(debtorDocs.docs.map(async d => {
        const invoices = await getDocs(collection(db, 'debtors', d.id, 'invoices'));
        invoices.forEach(i => debts.push({ _id: i.id, debtorId: d.id, debtor: d.data().name || '', ...i.data() }));
    }));
    // Receipt names the owner marked as services (labour, no stock) in Stock > Link receipt items.
    let receiptServices = [];
    try {
        const s = await getDoc(doc(db, 'settings', 'receiptNames'));
        if (s.exists()) receiptServices = s.data().services || [];
    } catch { /* first use: the document doesn't exist yet */ }
    return { products, sales, orders, customers, tickets, warranties, debts, corrections, receiptServices, loadedAt: Date.now() };
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

    // ---- revenue: today, month to date, and the same days of last month
    const revenueOf = (from, to) =>
        sales.filter(s => { const t = saleTime(s); return t >= from && t < to; }).reduce((a, s) => a + (Number(s.total) || 0), 0)
        + m.orders.filter(o => { const t = orderTime(o); return t >= from && t < to; }).reduce((a, o) => a + orderTotal(o), 0);
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
    const margin30 = costedNet30 > 0 ? (costedNet30 - cost30) / costedNet30 : null;

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

    // ---- today's activity and the most recent sale
    const activity = [];
    m.sales.forEach(s => {
        const t = saleTime(s); if (!(t >= today0)) return;
        const who = s.clientName || s.customerName || 'Walk-in';
        const inv = shortInvoice(saleInvoiceNumber(s));
        activity.push({ t, what: `${inv ? (s.type === 'easypos' ? 'Receipt ' : 'Invoice ') + inv + ' · ' : 'Sale · '}${WALKIN.test(who) ? 'walk-in' : who}`, chip: saleSource(s), amount: Number(s.total) || 0 });
    });
    m.orders.forEach(o => { const t = orderTime(o); if (t >= today0) activity.push({ t, what: `Online order · ${o.clientName || o.customerName || '?'}`, chip: 'Online', amount: orderTotal(o) }); });
    m.warranties.forEach(w => { const t = toMs(w.createdAt); if (t >= today0) activity.push({ t, what: `Warranty issued · ${w.customerName || ''}`, chip: 'Garanci', amount: null }); });
    m.tickets.forEach(tk => { const t = toMs(tk.createdAt); if (t >= today0) activity.push({ t, what: `Repair ticket · ${tk.customerName || ''}`, chip: 'Service', amount: null }); });
    activity.sort((a, b) => b.t - a.t);
    const lastSale = [...m.sales].sort((a, b) => saleTime(b) - saleTime(a))[0] || null;

    return {
        now, today0, monthStart,
        todayRevenue, monthRevenue, prevMonthToDate, monthSalesCount, dailySeries,
        net30, costedNet30, cost30, margin30, count30, costedCount30,
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
