// Prepayments: the customer pays part of a price in advance, the goods come later.
//
// How Danfos invoices it (every case in the archive, 2025-2026):
//   - the prepayment invoice has one line, "Parapagim 70% per makinen B 50 W Bp" (sometimes the
//     platform type 386 "Faturë parapagimi");
//   - the final invoice lists the goods at their full price and takes the prepayment off with a
//     negative line naming it: "Zbritje parapagimi sipas fatures 17/2025 date 27.02.2025",
//     "Zbritje sipas parapagimit te fatures nr.98/2025". Its total is what is left to pay.
//
// In Sales both invoices are kept as they are, so revenue is what was invoiced, month by month.
// The prepayment never moves stock (the goods aren't delivered yet); the final invoice does. When
// the final one arrives, the goods' cost is shared between the two invoices in proportion to their
// amounts - the prepayment line carries its part, the deduction line takes the same part off - so
// each invoice shows the real margin and the two add up to exactly the goods' cost. Until then the
// prepayment's cost is unknown and it stays out of margin figures.
//
// Pure: the caller supplies the database calls (the app's Import invoice screen, and the Paper
// Autopilot's automatic import under Node).

const PREPAY_WORD = /parapag|paradh[eë]n|avans/i;
const r2 = n => Math.round(n * 100) / 100;
const short = n => String(n || '').split('/').slice(0, 2).join('/').trim();

// "…fatures 17/2025 date 27.02.2025", "…fatures nr.98/2025" -> the invoice numbers, not dates.
export function prepaymentRefs(name) {
    return [...String(name || '').matchAll(/(?:^|[^\d\/])(\d{1,5}\/20\d{2})(?![\d\/])/g)].map(m => m[1]);
}

// What an invoice read by the processor is: 'prepayment', 'final' (it deducts a prepayment), or null.
export function prepaymentKind(data, text = '') {
    const items = data.items || [];
    const deducts = items.some(i => Number(i.lineTotal ?? i.pricePerUnit) < 0 && PREPAY_WORD.test(i.itemName || i.name || ''));
    if (deducts) return 'final';
    const type386 = /Kodi\s*\/\s*Emri i llojit t[ëe] fatur[ëe]s:\s*386\b/i.test(text);
    const allPrepay = items.length > 0 && items.every(i => /^\s*(parapag|paradh[eë]n|avans)/i.test(i.itemName || i.name || '') && Number(i.lineTotal ?? i.pricePerUnit) > 0);
    return type386 || allPrepay ? 'prepayment' : null;
}

// Before saving: prepayment and deduction lines never touch stock and are not products. (Without
// noStock the processor would match "…per makinen B 50 W Bp" to the machine by name and take it
// off the shelf.)
export function prepareItems(data, kind) {
    if (!kind) return data;
    const items = (data.items || []).map(i => {
        const prepay = kind === 'prepayment' || (Number(i.lineTotal ?? i.pricePerUnit) < 0 && PREPAY_WORD.test(i.itemName || ''));
        return prepay ? { ...i, productId: undefined, linkedProductName: undefined, matchedBy: null, noStock: true } : i;
    });
    return { ...data, items };
}

// Which catalogue product a prepayment is for ("Parapagim 70% per makinen B 50 W Bp" -> B 50 W),
// using the app's own matcher. Only a label: nothing is taken from stock.
export function prepaymentFor(name, products, match) {
    const what = String(name || '').replace(/^\s*(parapagim|parapagese|paradh[eë]nie|avans)\w*\s*/i, '').replace(/^\d+\s*%\s*/, '').replace(/^(p[eë]r|per)\s+(makin[eë]n|makin[eë]s|pajisjen)?\s*/i, '').trim();
    const p = what && match ? match(products, what) : null;
    return p ? { productId: p._id || p.id, productName: p.name } : what ? { productName: what } : null;
}

// After saving. store: { getSale(id), salesByInvoice(number) -> [{id, ...}], updateSale(id, patch) }.
// netCostOf(line): the app's lineNetCost. Returns what was linked, and what couldn't be.
export async function linkAfterSave(store, saleId, kind, { products = [], match = null, netCostOf } = {}) {
    if (!kind) return null;
    const sale = await store.getSale(saleId);
    if (!sale) return null;
    if (kind === 'prepayment') {
        const items = (sale.items || []).map(i => ({ ...i, isPrepayment: true }));
        const forWhat = prepaymentFor(items[0]?.name, products, match);
        await store.updateSale(saleId, { items, prepayment: { status: 'open', ...(forWhat || {}) } });
        return { kind, status: 'open', for: forWhat };
    }
    // A final invoice: tag the deduction lines, find each prepayment, share the goods' cost.
    const items = (sale.items || []).map(i => ({ ...i }));
    const deductions = items.filter(i => Number(i.price) < 0 && PREPAY_WORD.test(i.name || ''));
    const goods = items.filter(i => !deductions.includes(i));
    const goodsNet = goods.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
    const costs = goods.map(i => netCostOf(i));
    const goodsCost = costs.some(c => c === null) ? null : goods.reduce((s, i, k) => s + costs[k] * (Number(i.quantity) || 1), 0);
    const prepaid = [], missing = [];
    for (const d of deductions) {
        d.isPrepaymentDeduction = true;
        const amount = -(Number(d.price) || 0) * (Number(d.quantity) || 1);          // net, positive
        const refs = prepaymentRefs(d.name);
        d.prepaymentRefs = refs;
        const found = [];
        for (const ref of refs) {
            const cands = (await store.salesByInvoice(ref)).filter(s => s.id !== saleId && (s.prepayment || (s.items || []).some(x => x.isPrepayment)));
            const p = cands.find(s => sale.customerNipt && s.customerNipt === sale.customerNipt) || cands[0];
            if (p) found.push(p); else missing.push(ref);
        }
        const share = goodsCost !== null && goodsNet > 0 ? goodsCost * amount / goodsNet : null;
        d.netCost = share === null ? null : -r2(share);
        const netOf = p => (p.items || []).reduce((s, x) => s + (Number(x.price) || 0) * (Number(x.quantity) || 1), 0);
        const allNet = found.reduce((s, p) => s + netOf(p), 0);
        for (const p of found) {
            // Its part of the cost (one line naming two prepayments shares it by their amounts),
            // on its own prepayment line(s) in proportion to their amounts.
            const pItems = (p.items || []).map(x => ({ ...x }));
            const pNet = netOf(p);
            const pShare = share === null || !allNet ? null : share * pNet / allNet;
            pItems.forEach(x => {
                x.isPrepayment = true;
                const q = Number(x.quantity) || 1;
                x.netCost = pShare === null || !pNet ? null : r2(pShare * (Number(x.price) || 0) * q / pNet / q);
            });
            await store.updateSale(p.id, { items: pItems, prepayment: { ...(p.prepayment || {}), status: 'settled', settledBy: { saleId, invoiceNumber: sale.invoiceNumber || '' } } });
            prepaid.push({ invoiceNumber: short(p.invoiceNumber), saleId: p.id, net: r2(pNet) });
        }
        if (!found.length) d.prepaymentMissing = true;
    }
    await store.updateSale(saleId, { items, prepaid: [...prepaid, ...missing.map(ref => ({ invoiceNumber: ref, saleId: null, net: null }))] });
    return { kind, prepaid, missing, costShared: goodsCost !== null };
}
