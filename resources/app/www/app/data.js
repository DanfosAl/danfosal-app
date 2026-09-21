// The one place that defines what the numbers mean.
//
// Before the redesign every page computed revenue, cost, customers and stock alerts its own way,
// which is how one app showed three different customer counts and "profit equal to revenue".
// New screens read these definitions instead of inventing their own. The rules match the
// Phase 0 data fix (GOLDEN_MANIFEST Finding #25).
import { db, ready, collection, getDocs } from './firebase.js';

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
    return { products, sales, orders, customers, tickets, warranties, debts, corrections, loadedAt: Date.now() };
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
    const soldUnits = {};
    const unmatched = {};
    const countLines = (list, timeOf, isEasypos) => list.forEach(rec => {
        if (!(timeOf(rec) >= sinceWindow)) return;
        (rec.items || []).forEach(item => {
            const pid = productIdOfLine(item, knownIds);
            const qty = Number(item.quantity) || 1;
            if (pid) soldUnits[pid] = (soldUnits[pid] || 0) + qty;
            else if (isEasypos(rec)) {
                const name = String(item.name || item.product || '?').trim();
                unmatched[name] = (unmatched[name] || 0) + qty;
            }
        });
    });
    countLines(sales, saleTime, s => s.type === 'easypos');
    countLines(m.orders, orderTime, () => false);

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
        soldUnits, reorder, unsold, unsoldValue, stockValue, soldWithoutCost,
        unmatched: Object.entries(unmatched).sort((a, b) => b[1] - a[1]),
        productsSold: Object.keys(soldUnits).length,
        needsCount,
        customers: firstSeen.size, newCustomers30, customerNames: [...firstSeen.values()].map(v => v.name),
        openTickets, openOrders, owed, owedTotal,
        lastEasypos, polluted,
        activity, lastSale
    };
}
