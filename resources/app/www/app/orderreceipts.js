// An online order and its easyPOS receipt are ONE sale (owner, 19 Nov 2026: "when I have the online
// order I usually make the sale through easyPOS and a receipt is printed - make sure it counts as an
// online sale, not twice; and when I print the receipt the order should move to preparing").
//
// Before this, an order and its receipt were both counted: revenue, units sold (Next order),
// customer totals, and stock when the order had taken it too. Now:
//   - pairs are found here (pure) and written as links: order.receiptSaleId, sale.onlineOrderId;
//   - a linked order no longer counts as a sale of its own (data.js countedOrder) - the receipt
//     does, marked as an online sale;
//   - linking an order that is still New Lead / Ordered / Pending moves it to Processing
//     ("being prepared"), noted in its history;
//   - if the order had taken stock and the receipt took it again, that stock is given back once.
//
// Automatic pairs - only when nothing else could be meant:
//   strong: the receipt carries the order's customer name (or phone), every product of the order
//           is on it and the money agrees (within €2 / 3%), up to a day before to 10 days after;
//   exact:  the order is still open, the receipt came after it (within 7 days), the very same
//           products and quantities, the same money within €1, and neither side has another
//           candidate.
// Anything less clear is a suggestion the owner confirms (Same sale / Not the same) - only for
// orders of the last 30 days: the owner doesn't want to go back over old ones (19 Nov 2026).

const DAY = 86400000;
export const OPEN_FOR_RECEIPT = new Set(['New Lead', 'Ordered', 'Pending']);
const CLOSED = new Set(['Returned', 'Cancelled']);
const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const digits8 = s => String(s || '').replace(/\D/g, '').slice(-8);
const WALKIN = /walk.?in|klient|anonim|privat|^-+$|^\?+$/i;

const orderLines = o => (o.items || []).filter(i => i && (i.id || fold(i.name)) && i.name !== '00')
    .map(i => ({ id: i.id || '', name: fold(i.name), qty: Number(i.quantity) || 1 }));
const saleLines = s => (s.items || []).filter(i => i && !i.isService)
    .map(i => ({ id: i.costProductId || i.productId || '', name: fold(i.name || i.productName), qty: Number(i.quantity) || 1 }));
const sameLine = (a, b) => (a.id && b.id && a.id === b.id) || (a.name && b.name && (a.name.includes(b.name) || b.name.includes(a.name)));
const itemsSum = o => (o.items || []).reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);

// Every order line is on the receipt (exact: and nothing else, same quantities).
function covers(ol, sl, exact) {
    if (!ol.length || !sl.length) return false;
    const left = sl.map(x => ({ ...x }));
    for (const o of ol) {
        const hit = left.find(x => sameLine(o, x) && (!exact || x.qty === o.qty));
        if (!hit) return false;
        left.splice(left.indexOf(hit), 1);
    }
    return !exact || left.length === 0;
}

// -> 'strong' | 'exact' | 'maybe' | null
export function matchKind(o, s, { orderTime, saleTime }) {
    if (!o || !s || CLOSED.has(o.status) || s.isReturn) return null;
    const ot = orderTime(o), st = saleTime(s);
    if (!ot || !st || st < ot - DAY || st > ot + 10 * DAY) return null;
    const ol = orderLines(o), sl = saleLines(s);
    const want = itemsSum(o) || Number(o.price) || 0, got = Number(s.total) || 0;
    const moneyClose = want > 0 && Math.abs(got - want) <= Math.max(2, want * 0.03);
    const who = s.clientName || s.customerName || '';
    const nameSame = who && !WALKIN.test(who) && fold(who).length >= 5 && fold(who) === fold(o.clientName || o.customerName);
    const phoneSame = digits8(s.customerPhone) && digits8(s.customerPhone) === digits8(o.telephone || o.phoneNumber);
    if ((nameSame || phoneSame) && moneyClose && covers(ol, sl, false)) return 'strong';
    const otherName = who && !WALKIN.test(who) && !nameSame;
    if (otherName) return null;                                     // the receipt is in someone else's name
    if (Math.abs(got - want) <= 1 && covers(ol, sl, true) && st >= ot - 3600000 && st <= ot + 7 * DAY)
        return OPEN_FOR_RECEIPT.has(o.status || 'Ordered') ? 'exact' : 'maybe';
    return null;
}

// -> {pairs: Map(orderId -> {saleId, how}), suggestions: [{order, sale}]}
// how: 'linked' (already written), 'strong' or 'exact' (to write now).
export const SUGGEST_DAYS = 30;
export function pairOrdersWithReceipts(orders = [], sales = [], { notSame = new Set(), orderTime, saleTime, now = Date.now(), suggestDays = SUGGEST_DAYS } = {}) {
    const pairs = new Map(), usedSales = new Set();
    const salesById = new Map(sales.map(s => [s._id, s]));
    for (const o of orders) {                                       // links already written
        if (o.receiptSaleId && salesById.has(o.receiptSaleId)) { pairs.set(o._id, { saleId: o.receiptSaleId, how: 'linked' }); usedSales.add(o.receiptSaleId); }
    }
    for (const s of sales) {
        if (s.onlineOrderId && !usedSales.has(s._id) && orders.some(o => o._id === s.onlineOrderId) && !pairs.has(s.onlineOrderId)) {
            pairs.set(s.onlineOrderId, { saleId: s._id, how: 'linked' }); usedSales.add(s._id);
        }
    }
    const cands = [];
    const freeOrders = orders.filter(o => !pairs.has(o._id) && !CLOSED.has(o.status));
    const t0 = Math.min(...freeOrders.map(orderTime).filter(Boolean)) - DAY;
    const freeSales = sales.filter(s => !usedSales.has(s._id) && !s.isReturn && !s.onlineOrderId && saleTime(s) >= t0);
    for (const o of freeOrders) for (const s of freeSales) {
        if (notSame.has(`${o._id}|${s._id}`)) continue;
        const kind = matchKind(o, s, { orderTime, saleTime });
        if (kind) cands.push({ o, s, kind, gap: Math.abs(saleTime(s) - orderTime(o)) });
    }
    const perOrder = new Map(), perSale = new Map();
    cands.forEach(c => { perOrder.set(c.o._id, (perOrder.get(c.o._id) || 0) + 1); perSale.set(c.s._id, (perSale.get(c.s._id) || 0) + 1); });
    const suggestions = [];
    // strong first (closest in time), then exact only when it is the only possibility on both sides.
    for (const c of cands.filter(x => x.kind === 'strong').sort((a, b) => a.gap - b.gap)) {
        if (pairs.has(c.o._id) || usedSales.has(c.s._id)) continue;
        pairs.set(c.o._id, { saleId: c.s._id, how: 'strong' }); usedSales.add(c.s._id);
    }
    for (const c of cands.filter(x => x.kind !== 'strong')) {
        if (pairs.has(c.o._id) || usedSales.has(c.s._id)) continue;
        if (c.kind === 'exact' && perOrder.get(c.o._id) === 1 && perSale.get(c.s._id) === 1) { pairs.set(c.o._id, { saleId: c.s._id, how: 'exact' }); usedSales.add(c.s._id); }
        else suggestions.push({ order: c.o, sale: c.s });
    }
    return { pairs, suggestions: suggestions.filter(x => !pairs.has(x.order._id) && !usedSales.has(x.sale._id) && orderTime(x.order) >= now - suggestDays * DAY) };
}

// What linking writes. stockBack: [{productId, qty}] when the order had taken stock and the receipt
// (whose lines are linked to products - the till bridge takes stock for those) took it again.
export function linkUpdates(o, s, now = Date.now(), { knownIds = null } = {}) {
    const order = { receiptSaleId: s._id, receiptLinkedAt: now }, sale = { onlineOrderId: o._id }, stockBack = [];
    if (OPEN_FOR_RECEIPT.has(o.status || 'Ordered')) {
        order.status = 'Processing';
        order.activityLog = [{ status: 'Processing', timestamp: new Date(now), note: 'easyPOS receipt printed' },
            ...((o.activityLog && o.activityLog.length) ? o.activityLog : [{ status: 'Order Placed', timestamp: o.timestamp || new Date(now) }])];
    }
    if (o.stockDeducted) {
        const sl = (s.items || []).map(i => i.costProductId || i.productId).filter(id => id && (!knownIds || knownIds.has(id)));
        (o.items || []).forEach(i => { if (i.id && sl.includes(i.id)) stockBack.push({ productId: i.id, qty: Number(i.quantity) || 1 }); });
        if (stockBack.length) { order.stockDeducted = false; order.stockGivenBackForReceipt = now; }
    }
    return { order, sale, stockBack };
}
