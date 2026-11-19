// Cash still with the courier (owner, 19 Nov 2026, idea 1): online orders are paid in cash to the
// courier, so an order marked Shipped or Delivered but not Paid is money the courier still holds.
// Pure: orderTime(o) and orderTotal(o) are Danfosal's (data.js), passed in.

const DAY = 86400000;
const WITH_COURIER = new Set(['Shipped', 'Delivered']);
const ms = v => v && typeof v.toMillis === 'function' ? v.toMillis() : v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v) || 0;

// When it left the shop: the newest Shipped entry in the order's history, else Delivered, else the order date.
export function shippedAt(o, orderTime = x => ms(x.timestamp)) {
    const log = o.activityLog || [];
    const at = st => Math.max(0, ...log.filter(x => x && x.status === st).map(x => ms(x.timestamp)));
    return at('Shipped') || at('Delivered') || orderTime(o) || 0;
}

// -> {list: [{o, since, days, amount}], total, late, lateTotal}; late = with the courier over `lateDays`.
export function withCourier(orders = [], now = Date.now(), { orderTime = x => ms(x.timestamp), orderTotal = x => Number(x.total) || Number(x.price) || 0, lateDays = 7 } = {}) {
    const list = orders.filter(o => o && WITH_COURIER.has(o.status)).map(o => {
        const since = shippedAt(o, orderTime);
        return { o, since, days: since ? Math.floor((now - since) / DAY) : null, amount: Math.round((Number(orderTotal(o)) || 0) * 100) / 100 };
    }).sort((a, b) => (a.since || 0) - (b.since || 0));
    const late = list.filter(x => x.days !== null && x.days > lateDays);
    const sum = xs => Math.round(xs.reduce((s, x) => s + x.amount, 0) * 100) / 100;
    return { list, total: sum(list), late: late.length, lateTotal: sum(late) };
}
