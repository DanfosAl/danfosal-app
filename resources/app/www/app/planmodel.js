// Yearly purchase plan: the numbers (no screen). Used by Stock > Yearly plan and by Today's alerts.
//
// A plan (predictions/{year}-plan, version 2) stores, per product, the planned SALES for each
// month (demand[12]) and the deliveries needed to cover them (orders[12]), netted against stock,
// what is already on the order list, and a safety buffer. Storing planned sales is what makes
// the plan checkable: during the year, actual sales to date are compared with planned sales to
// date, the rest of the year is projected at the actual pace, and the difference becomes
// "order N more" or "order N less". (The classic plan stored only order quantities and compared
// them with sales, which can't tell you anything.)
import { RESTOCK_DAYS, saleTime, orderTime, productIdOfLine, productNetCost, saleSource } from './data.js';

export const PACE_FAST = 1.2;       // selling 20%+ faster than planned
export const PACE_SLOW = 0.7;       // selling 30%+ slower than planned
export const MIN_PLANNED = 3;       // below this many planned units to date, pace is noise
export const SAFETY_MONTHS = 0.5;   // keep half a month of sales as a buffer
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthName = m => MONTHS[m];
const mkOf = t => { const d = new Date(t); return d.getFullYear() * 12 + d.getMonth(); };

// Units sold per product per month (sales and online orders; returns and cancellations excluded),
// and how each month was recorded: imported history, EasyPOS/invoices, or till only (incomplete).
export function unitsByMonth(m) {
    if (m._unitsByMonth) return m._unitsByMonth;
    const known = new Set(m.products.map(p => p._id));
    const byName = new Map(m.products.map(p => [String(p.name || '').trim().toLowerCase(), p._id]));
    const units = new Map(), coverage = new Map();
    const pidOf = it => productIdOfLine(it, known) || (it.id && known.has(it.id) ? it.id : null) || byName.get(String(it.name || '').trim().toLowerCase()) || null;
    const add = (pid, mk, q) => { if (!pid) return; if (!units.has(pid)) units.set(pid, new Map()); const u = units.get(pid); u.set(mk, (u.get(mk) || 0) + q); };
    m.sales.filter(s => !s.isReturn).forEach(s => {
        const t = saleTime(s); if (isNaN(t)) return;
        const mk = mkOf(t), src = saleSource(s), c = coverage.get(mk) || {};
        c[src] = (c[src] || 0) + 1; coverage.set(mk, c);
        (s.items || []).forEach(it => { if (!it.isService) add(pidOf(it), mk, Number(it.quantity) || 1); });
    });
    m.orders.filter(o => !['Returned', 'Cancelled'].includes(o.status)).forEach(o => {
        const t = orderTime(o); if (isNaN(t)) return;
        (o.items || []).forEach(it => add(pidOf(it), mkOf(t), Number(it.quantity) || 1));
    });
    // Recorded automatically (EasyPOS/PDF) beats imported beats till-only; a month counts as imported
    // only if most of its sales were (Dec 2025 has 1 imported sale among 24 till sales).
    const kind = mk => {
        const c = coverage.get(mk); if (!c) return 'none';
        const total = Object.values(c).reduce((a, b) => a + b, 0);
        return (c.EasyPOS || c.PDF) ? 'live' : (c.Import || 0) * 2 >= total ? 'import' : 'gap';
    };
    return (m._unitsByMonth = { units, kind });
}

// Which past month stands in for month m of `year`: the same month a year earlier, or two years
// earlier if that one was incomplete (till only) or empty.
export function basisMonths(m, year) {
    const { kind } = unitsByMonth(m);
    return MONTHS.map((_, i) => {
        const tries = [(year - 1) * 12 + i, (year - 2) * 12 + i];
        const good = tries.find(mk => ['import', 'live'].includes(kind(mk)));
        const any = tries.find(mk => kind(mk) !== 'none');
        const mk = good ?? any ?? null;
        return { mk, kind: mk === null ? 'none' : kind(mk), label: mk === null ? '–' : `${MONTHS[mk % 12]} ${Math.floor(mk / 12)}` };
    });
}

// Net the planned sales against stock: deliveries needed (by month of arrival) to stay above the buffer.
export function netOrders(demand, opening, startMonth = 0) {
    const avg = demand.reduce((a, b) => a + b, 0) / 12;
    const safety = avg >= 0.5 ? Math.ceil(avg * SAFETY_MONTHS) : 0;
    let running = opening; const orders = Array(12).fill(0);
    for (let i = startMonth; i < 12; i++) {
        running -= demand[i];
        if (running < safety) { orders[i] = safety - running; running = safety; }
    }
    return { orders, safety };
}

export function buildPlan(m, { year, growth, supplier, waitingByProduct = new Map(), now = Date.now() }) {
    const { units } = unitsByMonth(m);
    const basis = basisMonths(m, year);
    const thisYear = new Date(now).getFullYear();
    const start = year === thisYear ? new Date(now).getMonth() : 0;   // can't order in the past
    const rows = [];
    m.products.forEach(p => {
        if (supplier && supplier !== 'All' && String(p.producer || '').toLowerCase() !== supplier.toLowerCase()) return;
        const u = units.get(p._id);
        const base = basis.map(b => (b.mk !== null && u ? u.get(b.mk) || 0 : 0));
        if (!base.some(x => x > 0)) return;
        const demand = base.map(x => (x > 0 ? Math.ceil(x * (1 + growth)) : 0));
        const opening = Math.max(0, Number(p.stock) || 0) + (waitingByProduct.get(p._id) || 0);
        const { orders, safety } = netOrders(demand, opening, start);
        const unitCost = productNetCost(p) || 0;
        const totalToOrder = orders.reduce((a, b) => a + b, 0);
        rows.push({ id: p._id, name: p.name, code: p.code || '', supplier: p.producer || '', unitCost: Math.round(unitCost * 100) / 100,
            demand, orders, safety, openingStock: opening, totalToOrder, totalCost: Math.round(totalToOrder * unitCost * 100) / 100 });
    });
    rows.sort((a, b) => b.totalCost - a.totalCost || b.demand.reduce((x, y) => x + y, 0) - a.demand.reduce((x, y) => x + y, 0));
    return { year, version: 2, growthRate: growth, supplier: supplier || 'All', startMonth: start,
        basis: basis.map(b => ({ label: b.label, kind: b.kind })), products: rows, generatedAt: now, generatedDate: new Date(now).toISOString() };
}

// Where the plan stands today, per product: planned vs actual sales to date, pace, and what to
// order for the rest of the year at that pace.
export function trackPlan(m, plan, { now = Date.now(), waitingByProduct = new Map() } = {}) {
    if (!plan || plan.version !== 2) return null;
    const { units } = unitsByMonth(m);
    const d = new Date(now), year = plan.year;
    const month = d.getFullYear() === year ? d.getMonth() : d.getFullYear() > year ? 12 : -1;
    const frac = month >= 0 && month < 12 ? (d.getDate() - 1) / new Date(year, month + 1, 0).getDate() : 0;
    const productById = new Map(m.products.map(p => [p._id, p]));
    const planned = new Set();
    const rows = plan.products.map(r => {
        planned.add(r.id);
        const p = productById.get(r.id);
        const u = units.get(r.id);
        const actual = [...Array(12)].map((_, i) => (u ? u.get(year * 12 + i) || 0 : 0));
        let plannedToDate = 0, actualToDate = 0;
        for (let i = 0; i < 12; i++) {
            if (i < month) { plannedToDate += r.demand[i]; actualToDate += actual[i]; }
            else if (i === month) { plannedToDate += r.demand[i] * frac; actualToDate += actual[i]; }
        }
        const pace = plannedToDate >= 0.5 ? actualToDate / plannedToDate : null;
        const usePace = pace === null ? 1 : Math.min(3, Math.max(0.25, pace));
        let remainingPlanned = 0;
        for (let i = Math.max(0, month); i < 12; i++) remainingPlanned += r.demand[i] * (i === month ? 1 - frac : 1);
        const projectedRemaining = remainingPlanned * usePace;
        const stock = p ? Number(p.stock) || 0 : 0, waiting = waitingByProduct.get(r.id) || 0;
        const needNow = Math.max(0, Math.ceil(projectedRemaining + (r.safety || 0) - stock - waiting));
        let plannedOrdersLeft = 0;
        for (let i = Math.max(0, month); i < 12; i++) plannedOrdersLeft += r.orders[i];
        const diff = needNow - plannedOrdersLeft;
        // Will stock run out before a restock could arrive?
        const nextSix = r.demand.slice(Math.max(0, month), Math.max(0, month) + 2).reduce((a, b) => a + b, 0) * usePace * (RESTOCK_DAYS / 60);
        let status = 'on';
        if (month < 0) status = 'future';
        else if (month >= 12) status = 'done';
        else if (stock + waiting <= 0 && needNow > 0) status = 'out';
        else if (stock + waiting < nextSix && needNow > 0) status = 'low';
        else if (pace !== null && plannedToDate >= MIN_PLANNED && pace >= PACE_FAST) status = 'faster';
        else if (pace !== null && plannedToDate >= MIN_PLANNED && pace <= PACE_SLOW) status = 'slower';
        return { ...r, product: p, actual, plannedToDate, actualToDate, pace, projectedRemaining, stock, waiting, needNow, plannedOrdersLeft, diff, status,
            plannedYear: r.demand.reduce((a, b) => a + b, 0), projectedYear: Math.round(actualToDate + projectedRemaining) };
    });
    // Products selling this year that the plan left out.
    const unplanned = [];
    if (month >= 0 && month < 12) units.forEach((u, id) => {
        if (planned.has(id)) return;
        let sold = 0; for (let i = 0; i <= month; i++) sold += u.get(year * 12 + i) || 0;
        const p = productById.get(id);
        if (p && sold >= 3 && (!plan.supplier || plan.supplier === 'All' || String(p.producer || '').toLowerCase() === plan.supplier.toLowerCase())) unplanned.push({ product: p, sold });
    });
    unplanned.sort((a, b) => b.sold - a.sold);
    const attention = rows.filter(r => ['out', 'low', 'faster', 'slower'].includes(r.status) && Math.abs(r.diff) >= 1);
    return { month, frac, rows, unplanned, attention,
        plannedToDate: rows.reduce((a, r) => a + r.plannedToDate, 0), actualToDate: rows.reduce((a, r) => a + r.actualToDate, 0),
        plannedValueToDate: rows.reduce((a, r) => a + r.plannedToDate * r.unitCost, 0), actualValueToDate: rows.reduce((a, r) => a + r.actualToDate * r.unitCost, 0) };
}

// Units still waiting on the order list, per product (matched by name, as the order list stores names).
export function waitingByProduct(m) {
    const byName = new Map(m.products.map(p => [String(p.name || '').trim().toLowerCase(), p._id]));
    const out = new Map();
    (m.orderLines || []).forEach(l => {
        const left = Math.max(0, (Number(l.quantity) || 0) - (Number(l.quantityReceived) || 0));
        const id = byName.get(String(l.name || '').trim().toLowerCase());
        if (id && left) out.set(id, (out.get(id) || 0) + left);
    });
    return out;
}

// The plan for a year, if one exists in the new format.
export const planFor = (m, year) => (m.predictions || []).find(p => p.version === 2 && Number(p.year) === year) || null;

// For Today: products off plan this year (empty when there is no plan).
export function planAttention(m, now = Date.now()) {
    const plan = planFor(m, new Date(now).getFullYear());
    if (!plan) return null;
    const t = trackPlan(m, plan, { now, waitingByProduct: waitingByProduct(m) });
    return t ? { plan, attention: t.attention, unplanned: t.unplanned } : null;
}

