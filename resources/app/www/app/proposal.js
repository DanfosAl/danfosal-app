// Stock › Next order: what to order next from a supplier, and how many. The numbers only (no
// screen, no database), so they can be checked on their own; nextorder.js is the screen.
//
// One proposal instead of four places to look (owner, 18 Nov 2026). A product is proposed when:
//   - it sells, and what is on the shelf plus what is already on the order list won't last the
//     restock (Kärcher takes about six weeks);
//   - it is out of stock but sold twice or more in the last 12 months - a product with no stock
//     can't sell, so its recent sales say nothing;
//   - it is out of stock and people asked the Instagram chatbot for it twice or more in 6 months;
//   - the yearly purchase plan, at the pace sales are really going, expects more to sell before a
//     restock could arrive than there is.
// How many: enough to last the restock plus a month (COVER_DAYS), at the faster of the 90-day and
// 12-month selling rates, or the plan's expectation over the same days - whichever is more - less
// what is on the shelf and already on the list. Products that sit unsold are flagged, so a slow
// shelf isn't refilled by accident.
//
// Pure: no imports. The caller passes the figures from data.js / planmodel.js.

export const COVER_DAYS = 30;            // after the delivery, stock for another month
export const ASKED_MIN = 2;              // chatbot questions in 6 months that count as "wanted"
const DAY = 86400000;
const r2 = n => Math.round(n * 100) / 100;

export const codeKey = c => String(c || '').replace(/[.\-\s]/g, '');
export const supplierKey = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Kärcher's material number as the portal wants it: 1.628-104.0. Codes typed without the dots
// ("16281040") are put back in shape; anything else isn't a material number.
export function materialNo(code) {
    const s = String(code || '').trim();
    if (/^\d\.\d{3}-\d{3}\.\d$/.test(s)) return s;
    const d = codeKey(s);
    return /^\d{8}$/.test(d) ? `${d[0]}.${d.slice(1, 4)}-${d.slice(4, 7)}.${d[7]}` : '';
}

// What Kärcher last charged per unit for each material number (net, after the contract
// discount), from the newest invoice or order that lists it. Free warranty lines don't count.
export function supplierPrices(docs) {
    const out = new Map();
    docs.filter(d => (d.kind === 'invoice' || (d.kind === 'order' && d.source !== 'warranty')) && /k[aä]rcher/i.test(d.supplier || ''))
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
        .forEach(d => (d.items || []).forEach(i => {
            const k = codeKey(i.code), unit = Number(i.unitCost) || (Number(i.qty) ? Number(i.total) / Number(i.qty) : 0);
            if (k && unit > 0 && !i.free) out.set(k, { unit: r2(unit), date: d.date || '', from: d.kind });
        }));
    return out;
}

// What customs added to Kärcher deliveries in the last 12 months, as a share of what was
// invoiced: duty and fees (a cost) and import VAT (paid at the border, reclaimed later).
// From buildPurchasing(...).customs. Null when no declaration was matched.
export function customsShare(links, now = Date.now()) {
    const since = new Date(now - 365 * DAY).toISOString().slice(0, 10);
    const used = (links || []).filter(l => l.matched && l.invoiced > 0 && String(l.decl?.date || '') >= since);
    const invoiced = used.reduce((s, l) => s + l.invoiced, 0);
    if (!invoiced) return null;
    return { dutyFees: used.reduce((s, l) => s + (l.dutyEUR || 0) + (l.feesEUR || 0), 0) / invoiced, vat: used.reduce((s, l) => s + (l.vatEUR || 0), 0) / invoiced, declarations: used.length };
}

// Planned sales over the next `days`, at the pace sales are really going. demandByYear: year ->
// Map(productId -> demand[12]) from the year plans; a month without a plan counts as nothing
// planned. Null when no plan has the product at all.
export function planExpected(id, { demandByYear, pace = 1, now, days }) {
    if (!demandByYear || ![...demandByYear.values()].some(m => m.has(id))) return null;
    let t = now, left = days, sum = 0;
    while (left > 0.001) {
        const d = new Date(t), y = d.getFullYear(), m = d.getMonth(), dim = new Date(y, m + 1, 0).getDate();
        const take = Math.min(left, dim - d.getDate() + 1);
        const demand = demandByYear.get(y)?.get(id);
        sum += (demand ? Number(demand[m]) || 0 : 0) * take / dim;
        left -= take;
        t = new Date(y, m + 1, 1).getTime();
    }
    return sum * pace;
}

// Everything the proposal knows about one product. `extra`: added by hand (always a row).
export function assess(p, f, { extra = false } = {}) {
    const { soldUnits = {}, soldUnits12 = {}, lastSoldAt = {}, waiting = new Map(), asked = new Map(), prices = new Map(),
        demandByYear = null, paceOf = () => 1, now = Date.now(), windowDays = 90, restockDays = 42, minUnits = 2, coverDays = COVER_DAYS } = f;
    const id = p._id;
    const stock = Math.max(0, Number(p.stock) || 0);
    const onList = waiting.get(id) || 0;
    const units90 = soldUnits[id] || 0, units12 = soldUnits12[id] || 0;
    const rate = Math.max(units90 / windowDays, units12 / 365);
    const have = stock + onList;
    const lasts = rate > 0 ? have / rate : Infinity;           // days the shelf and the list last
    const horizon = restockDays + coverDays;
    const salesNeed = Math.max(0, Math.ceil(rate * horizon - have - 1e-9));
    const pace = paceOf(id);
    const planSoon = planExpected(id, { demandByYear, pace, now, days: restockDays });
    const planLong = planExpected(id, { demandByYear, pace, now, days: horizon });
    const planNeed = planLong === null ? 0 : Math.max(0, Math.ceil(planLong - have - 1e-9));
    const q = asked.get(id);
    const askedRecently = q ? (q.questions_6m || 0) : 0;

    const reasons = [];
    if (units90 >= minUnits && lasts < restockDays) reasons.push({ k: 'short', text: onList ? `lasts ${Math.round(lasts)} days with what's on the list` : stock ? `runs out in ${Math.round(lasts)} days` : 'out of stock and selling' });
    if (stock <= 0 && !onList && units12 >= minUnits && !reasons.length) reasons.push({ k: 'out', text: `out of stock · sold ${units12} in 12 months` });
    if (stock <= 0 && !onList && askedRecently >= ASKED_MIN) reasons.push({ k: 'asked', text: `asked ${askedRecently}× on Instagram in 6 months` });
    if (planSoon !== null && planSoon - have >= 0.5 && planNeed >= 1) reasons.push({ k: 'plan', text: `yearly plan: ${Math.round(planSoon)} to sell in ${Math.round(restockDays / 7)} weeks${pace !== 1 ? ` at ${Math.round(pace * 100)}% of plan` : ''}` });
    if (extra) reasons.push({ k: 'added', text: 'added by you' });

    const wanted = reasons.some(r => r.k === 'out' || r.k === 'asked');
    const suggested = Math.max(salesNeed, planNeed, (wanted || extra) ? 1 : 0);
    const lastSold = lastSoldAt[id] || 0;
    // Sitting: stock on the shelf and nothing sold in the sales window.
    const slow = stock > 0 && (!lastSold || now - lastSold > windowDays * DAY) ? { stock, lastSold } : null;
    const material = materialNo(p.code);
    const price = (material && prices.get(codeKey(material))) || null;
    return { p, id, material, stock, onList, units90, units12, rate, lasts, salesNeed, planNeed, planSoon, asked: askedRecently, reasons, suggested, slow, price, extra };
}

// The proposal for one supplier: the products with a reason to order, most urgent first.
export function proposeOrder(products, supplier, f) {
    const key = supplierKey(supplier);
    return products.filter(p => supplierKey(p.producer) === key)
        .map(p => assess(p, f))
        .filter(r => r.reasons.length && r.suggested >= 1)
        .sort((a, b) => (a.stock > 0) - (b.stock > 0) || a.lasts - b.lasts || b.units12 - a.units12);
}

// The lines on the order list, per product, still waiting to arrive (ordered, or planned and not
// ordered yet). Matched by product id, then material number, then name - the list stores names.
export function waitingByProductId(products, lines) {
    const byId = new Set(products.map(p => p._id));
    const byCode = new Map(products.filter(p => codeKey(p.code)).map(p => [codeKey(p.code), p._id]));
    const byName = new Map(products.map(p => [String(p.name || '').trim().toLowerCase(), p._id]));
    const out = new Map();
    lines.forEach(l => {
        const left = Math.max(0, (Number(l.quantity) || 0) - (Number(l.quantityReceived) || 0));
        if (!left) return;
        const id = (l.productId && byId.has(l.productId) && l.productId) || byCode.get(codeKey(l.code)) || byName.get(String(l.name || '').trim().toLowerCase());
        if (id) out.set(id, (out.get(id) || 0) + left);
    });
    return out;
}

// The text for Kärcher's portal: one line per item, material number, a tab, the quantity.
export function portalText(lines) {
    return lines.filter(l => l.material && l.qty > 0).map(l => `${l.material}\t${l.qty}`).join('\n');
}
