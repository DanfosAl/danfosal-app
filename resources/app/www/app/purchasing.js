// A purchase from order to shelf: which papers belong together, whether it was paid (or prepaid),
// what the customs cost, and what each item really cost once it arrived.
//
// Pure: it takes the records the Paper Autopilot reads off the documents (collection
// purchaseDocs, written by tools/paper-autopilot/sync.js) plus the catalogue, and returns the
// picture. No database, no files, so the app and the autopilot use the same reasoning.
//
// How papers link, by what the papers themselves say:
//   invoice -> order         the invoice prints its order number ("Date Time Order No.")
//   payment -> order/invoice the owner writes the numbers into the bank transfer ("inv. 7571143454")
//   payment -> statement     "Pagese faturave te mbetura" pays what Kärcher's statement shows open
//   invoice -> paid          Kärcher's own statement: cleared on a date, or still open
//   credit note -> invoice   the credit note names the invoices it refunds (the 3% cash discount)
//   customs -> invoices      a declaration's declared invoice total matches a delivery's invoices
//
// Landed cost of a line = what was paid for it (after any cash discount credited back)
//   + its share of customs duty (only lines without EU preferential origin pay duty)
//   + its share of the other import costs (fees), by value.
// Import VAT is left out: it is reclaimed on the VAT return, so it is not a cost.

const r2 = n => Math.round(n * 100) / 100;
const DAY = 86400000;
const t = d => (d ? Date.parse(d + 'T12:00:00') : NaN);
const days = (a, b) => (t(b) - t(a)) / DAY;
const isKarcher = s => /k[aä]rcher/i.test(String(s || ''));

// One record per paper: several files can hold the same document (a reprint, a second download).
function unique(docs) {
    const keyOf = d => ({
        order: `o:${d.orderNo}:${d.source}`, invoice: `i:${d.invoiceNo}`, creditNote: `c:${d.number}`,
        payment: `p:${d.bankRef || `${d.date}:${d.amount}:${d.beneficiary}`}`, customs: `d:${d.number}`, statement: `s:${d.date}`
    }[d.kind] || `x:${d.id}`);
    const out = new Map();
    for (const d of docs) { const k = keyOf(d); const old = out.get(k); if (!old || (d.items || []).length > (old.items || []).length) out.set(k, d); }
    return [...out.values()];
}

// bookFrom: deliveries that arrived before this date are history. Most were never booked through
// Receive delivery, yet their stock is long counted in, so offering to book them would add it
// twice. The date the Purchases tab went live.
export const BOOK_FROM = '2026-09-26';

// receipts: purchaseReceipts, the deliveries that arrived but went to a customer rather than into
// stock (a warranty replacement handed over, parts used in the repair) - received, not booked.
export function buildPurchasing(allDocs, { products = [], receipts = [], today = new Date().toISOString().slice(0, 10), bookFrom = BOOK_FROM } = {}) {
    const handedOver = new Map(receipts.filter(r => r.invoiceNo).map(r => [r.invoiceNo, r]));
    const docs = unique(allDocs);
    const of = kind => docs.filter(d => d.kind === kind);
    const invoices = of('invoice').filter(d => isKarcher(d.supplier)).sort((a, b) => a.date.localeCompare(b.date));
    const credits = of('creditNote').filter(d => isKarcher(d.supplier));
    const payments = of('payment').sort((a, b) => a.date.localeCompare(b.date));
    const kPayments = payments.filter(p => isKarcher(p.beneficiary));
    const customs = of('customs').sort((a, b) => a.date.localeCompare(b.date));
    const statements = of('statement').sort((a, b) => a.date.localeCompare(b.date));
    const statement = statements[statements.length - 1] || null;

    // Invoices Kärcher's statement knows about, including ones whose PDF never reached Downloads.
    const stmtInvoice = new Map();
    (statement?.lines || []).filter(l => l.type === 'RV' && l.docNo).forEach(l => stmtInvoice.set(l.docNo, l));
    const booked = new Map();                        // invoice number -> the products it was booked into
    products.forEach(p => (p.batches || []).forEach(b => { const k = String(b.invoice || '').trim(); if (!k) return; if (!booked.has(k)) booked.set(k, []); booked.get(k).push({ product: p, batch: b }); }));

    // ---------------------------------------------------------------- 1. was each invoice paid?
    // "Remaining invoices" payments settle whatever the latest statement before them showed open.
    const settles = new Map();                       // invoice number -> the payment that settled it
    for (const p of kPayments.filter(p => !p.refs.length && /mbetura/i.test(p.details))) {
        const st = [...statements].reverse().find(s => s.date <= p.date && Math.abs(s.openTotal - p.amount) < 0.5);
        if (st) st.lines.filter(l => !l.clearingDate && l.type === 'RV').forEach(l => { if (!settles.has(l.docNo)) settles.set(l.docNo, p); });
    }
    const paidFor = new Map();                       // number (invoice or order) -> payments naming it
    kPayments.forEach(p => p.refs.forEach(n => { if (!paidFor.has(n)) paidFor.set(n, []); paidFor.get(n).push(p); }));

    function payment(no, orderNos, net, date) {
        const s = stmtInvoice.get(no);
        if (net === 0) return { status: 'paid', how: 'free replacement' };
        if (s?.clearingDate) return { status: 'paid', how: 'statement', date: s.clearingDate, note: `cleared on Kärcher's statement` };
        if (settles.has(no)) { const p = settles.get(no); return { status: 'paid', how: 'payment', date: p.date, payment: p, note: `paid with the remaining invoices` }; }
        const direct = paidFor.get(no);
        if (direct) {
            const part = direct.some(p => (p.partial || []).includes(no));
            return { status: part && direct.length < 2 ? 'part' : 'paid', how: 'payment', date: direct[direct.length - 1].date, payment: direct[direct.length - 1], note: part ? 'part paid' : 'paid' };
        }
        const pre = orderNos.flatMap(o => paidFor.get(o) || []);
        if (pre.length) return { status: 'paid', how: 'prepaid', date: pre[0].date, payment: pre[0], note: pre[0].date <= date ? 'prepaid' : 'paid against the order' };
        if (s) return { status: 'open', how: 'statement', amount: s.amount, note: `open on Kärcher's statement of ${statement.date}` };
        return { status: 'open', how: 'none', note: 'no payment found in the papers' };
    }

    // ---------------------------------------------------------------- 2. cash discount credited back
    const creditOn = new Map();                      // invoice number -> euros credited back
    credits.forEach(c => {
        const refs = c.refInvoices.filter(n => invoices.some(i => i.invoiceNo === n) || stmtInvoice.has(n));
        const nets = refs.map(n => (invoices.find(i => i.invoiceNo === n)?.net) ?? stmtInvoice.get(n)?.amount ?? 0);
        const sum = nets.reduce((a, b) => a + b, 0);
        refs.forEach((n, i) => creditOn.set(n, (creditOn.get(n) || 0) + (sum ? c.amount * nets[i] / sum : c.amount / refs.length)));
    });

    // ---------------------------------------------------------------- 3. customs -> the invoices it cleared
    // A Kärcher delivery clears customs a few days after its invoices. The declaration states the
    // invoices' total; find the invoice dates within 30 days before it whose invoices add up to it.
    // A free (warranty) line is invoiced at 0 but declared at its "Custom limit", so an invoice
    // counts here at what it declares: its net plus those values. Fees still follow what was paid.
    const allInv = new Map();                        // number -> {no, date, net, declared}, from PDFs and the statement
    stmtInvoice.forEach((l, no) => allInv.set(no, { no, date: l.date, net: l.amount, declared: l.amount }));
    invoices.forEach(i => allInv.set(i.invoiceNo, { no: i.invoiceNo, date: i.date, net: i.net,
        declared: r2(i.net + i.items.filter(x => x.free).reduce((s, x) => s + (Number(x.customsValue) || 0), 0)) }));
    const taken = new Set(), customsOf = new Map();  // invoice number -> {decl, share of duty and fees in EUR}
    const links = [];
    for (const d of customs.filter(d => isKarcher(d.exporter) && d.invoiceTotal > 0)) {
        const cands = [...allInv.values()].filter(i => !taken.has(i.no) && days(i.date, d.date) >= 0 && days(i.date, d.date) <= 30);
        const dates = [...new Set(cands.map(i => i.date))].sort().reverse();          // nearest first
        let best = null;
        for (let a = 0; a < dates.length; a++) for (let b = a; b < Math.min(dates.length, a + 3); b++) {
            const set = cands.filter(i => i.date <= dates[a] && i.date >= dates[b]);
            const sum = set.reduce((s, i) => s + i.declared, 0), off = Math.abs(sum - d.invoiceTotal) / d.invoiceTotal;
            if (!best || off < best.off) best = { set, sum, off };
        }
        if (!best || best.off > 0.03) { links.push({ decl: d, invoices: [], matched: false }); continue; }
        best.set.forEach(i => taken.add(i.no));
        const rate = d.rate || 100, duty = (d.dutyAll || 0) / rate, fees = Math.max(0, (d.extraAll || 0) - (d.dutyAll || 0)) / rate;
        const paidSum = best.set.reduce((s, i) => s + i.net, 0);
        // Duty falls on the lines without EU preference; an invoice we only know from the statement
        // is assumed to carry duty in proportion to its value.
        const dutyBase = i => { const pdf = invoices.find(x => x.invoiceNo === i.no); return pdf ? pdf.items.filter(x => x.preference !== 'EU').reduce((s, x) => s + x.total, 0) : i.net; };
        const dutySum = best.set.reduce((s, i) => s + dutyBase(i), 0);
        best.set.forEach(i => customsOf.set(i.no, { decl: d, duty: dutySum ? duty * dutyBase(i) / dutySum : 0, fees: paidSum ? fees * i.net / paidSum : 0 }));
        links.push({ decl: d, invoices: best.set.map(i => i.no), declared: d.invoiceTotal, invoiced: r2(best.sum), matched: true, dutyEUR: r2(duty), feesEUR: r2(fees), vatEUR: r2((d.vatAll || 0) / rate) });
    }

    // ---------------------------------------------------------------- 4. each invoice, costed
    const costed = invoices.map(inv => {
        const pay = payment(inv.invoiceNo, inv.orderNos, inv.net, inv.date);
        const credit = creditOn.get(inv.invoiceNo) || 0, cust = customsOf.get(inv.invoiceNo);
        const factor = inv.net ? Math.max(0, 1 - credit / inv.net) : 1;
        const dutyBase = inv.items.filter(x => x.preference !== 'EU').reduce((s, x) => s + x.total, 0);
        const lines = inv.items.map(x => {
            const paid = x.total * factor;
            const duty = cust && dutyBase && x.preference !== 'EU' ? cust.duty * x.total / dutyBase : 0;
            const fees = cust && inv.net ? cust.fees * x.total / inv.net : 0;
            return { ...x, paid: r2(paid), duty: r2(duty), fees: r2(fees), landed: r2(paid + duty + fees), landedUnit: x.qty ? r2((paid + duty + fees) / x.qty) : 0 };
        });
        // Arrival: the day it cleared customs, or failing that the invoice date.
        const arrived = cust ? cust.decl.date : inv.date, isBooked = booked.get(inv.invoiceNo) || null, handed = handedOver.get(inv.invoiceNo) || null;
        return { ...inv, pay, credit: r2(credit), customs: cust ? { number: cust.decl.number, date: cust.decl.date, duty: r2(cust.duty), fees: r2(cust.fees) } : null,
            lines, landed: r2(lines.reduce((s, x) => s + x.landed, 0)), booked: isBooked, handed, arrived, bookable: !isBooked && !handed && arrived >= bookFrom,
            allFree: inv.items.length > 0 && inv.items.every(x => x.free) };
    });

    // ---------------------------------------------------------------- 5. orders, from order to shelf
    const orders = new Map();
    const order = no => { if (!orders.has(no)) orders.set(no, { orderNo: no, date: '', docs: [], items: [], total: 0, invoices: [], payments: [], credits: [] }); return orders.get(no); };
    of('order').filter(o => o.orderNo).sort((a, b) => (a.source === 'proforma') - (b.source === 'proforma')).forEach(o => {
        const x = order(o.orderNo); x.docs.push(o);
        if (!x.date || o.date < x.date) x.date = o.date;
        if (o.items.length >= x.items.length) { x.items = o.items; x.total = o.total; }
        if (o.cashDiscountTotal) x.cashDiscountTotal = o.cashDiscountTotal;
        // A warranty claim: the claim number is the "order" the free replacement is invoiced against.
        if (o.source === 'warranty') Object.assign(x, { warranty: true, machine: o.machine, claimType: o.claimType, damage: o.damage, claimValue: o.claimValue || 0 });
    });
    costed.forEach(i => (i.orderNos.length ? i.orderNos : ['(no order)']).forEach(no => { const x = order(no); x.invoices.push(i); if (!x.date || i.date < x.date) x.date = i.date; }));
    // Invoices Kärcher's statement lists but whose PDF never arrived: they count, but can't be
    // booked line by line until the PDF is downloaded.
    const havePdf = new Set(invoices.map(i => i.invoiceNo));
    stmtInvoice.forEach((l, no) => {
        if (havePdf.has(no) || !l.orderNo) return;
        const x = order(l.orderNo);
        x.invoices.push({ invoiceNo: no, date: l.date, net: l.amount, orderNos: [l.orderNo], items: [], lines: [], pdf: false,
            pay: payment(no, [l.orderNo], l.amount, l.date), credit: 0, customs: customsOf.has(no) ? { number: customsOf.get(no).decl.number, date: customsOf.get(no).decl.date, duty: r2(customsOf.get(no).duty), fees: r2(customsOf.get(no).fees) } : null,
            landed: 0, booked: booked.get(no) || null, arrived: l.date, bookable: false });
        if (!x.date || l.date < x.date) x.date = l.date;
    });
    kPayments.forEach(p => p.refs.filter(n => orders.has(n)).forEach(n => orders.get(n).payments.push(p)));
    credits.forEach(c => { if (c.orderNo && orders.has(c.orderNo)) orders.get(c.orderNo).credits.push(c); });
    for (const x of orders.values()) {
        x.invoices.sort((a, b) => a.date.localeCompare(b.date));
        const firstInvoice = x.invoices.map(i => i.date).sort()[0];
        x.prepaid = x.payments.filter(p => !firstInvoice || p.date <= firstInvoice);
        x.paidAmount = r2(x.payments.reduce((s, p) => s + p.amount, 0));
        x.invoiced = r2(x.invoices.reduce((s, i) => s + i.net, 0));
        x.landed = r2(x.invoices.reduce((s, i) => s + i.landed, 0));
        x.unfiled = x.invoices.filter(i => i.pdf === false);
        x.waiting = x.invoices.filter(i => i.bookable);
        // ordered / prepaid: nothing invoiced yet · arrived: an invoice to book into stock ·
        // booked: every invoice is in stock · handed: it arrived and went to the customer (a
        // warranty replacement) · delivered: arrived before tracking began · claimed: a warranty
        // claim whose replacement hasn't come · labour: a claim for labour only, which Kärcher
        // settles with a credit note rather than goods.
        x.stage = !x.invoices.length ? (x.warranty ? (x.items.length ? 'claimed' : x.credits.length ? 'booked' : 'labour') : x.prepaid.length ? 'prepaid' : 'ordered')
            : x.waiting.length ? 'arrived' : x.invoices.every(i => i.booked || i.handed) ? (x.invoices.some(i => i.booked) ? 'booked' : 'handed') : 'delivered';
        // What was ordered but not invoiced yet, by product code. Unknowable while an invoice's
        // PDF is missing, so then it isn't claimed.
        // A receipt can also say a part came under another name on the invoice (the owner's word:
        // the K7 cylinder head invoiced as "Piston guidance"), so it isn't still to come.
        const got = new Map(); x.invoices.forEach(i => i.items.forEach(l => got.set(l.code, (got.get(l.code) || 0) + l.qty)));
        x.invoices.forEach(i => (i.handed?.alsoReceived || []).filter(l => !l.orderNo || l.orderNo === x.orderNo).forEach(l => got.set(l.code, (got.get(l.code) || 0) + (Number(l.qty) || 0))));
        x.outstandingKnown = !x.unfiled.length;
        x.outstanding = x.outstandingKnown ? x.items.map(l => ({ ...l, waiting: Math.max(0, l.qty - (got.get(l.code) || 0)) })).filter(l => l.waiting > 0) : [];
        x.open = r2(x.invoices.filter(i => i.pay.status !== 'paid').reduce((s, i) => s + (i.pay.amount ?? i.net), 0));
    }

    // ---------------------------------------------------------------- 6. the Kärcher account
    // Open invoices: those still open on the latest statement (with or without a PDF) and those
    // issued after it that no payment names, less payments since the statement that name nothing.
    const openFromStatement = [...stmtInvoice.values()].filter(l => !l.clearingDate && !settles.has(l.docNo) && !(paidFor.get(l.docNo) || []).length);
    const newer = costed.filter(i => (!statement || i.date > statement.date) && !stmtInvoice.has(i.invoiceNo) && i.pay.status !== 'paid');
    const unnamed = kPayments.filter(p => (!statement || p.date > statement.date) && !p.refs.length && !/mbetura/i.test(p.details));
    const account = {
        statementDate: statement?.date || '', statementOpen: statement ? r2(statement.openTotal) : null,
        open: r2(openFromStatement.reduce((s, l) => s + l.amount, 0) + newer.reduce((s, i) => s + i.net, 0) - unnamed.reduce((s, p) => s + p.amount, 0)),
        openInvoices: [...openFromStatement.map(l => ({ no: l.docNo, date: l.date, amount: l.amount, orderNo: l.orderNo })), ...newer.map(i => ({ no: i.invoiceNo, date: i.date, amount: i.net, orderNo: i.orderNos[0] }))],
        unnamedPayments: unnamed
    };

    return {
        orders: [...orders.values()].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
        invoices: costed, customs: links, account, payments, statement,
        waiting: costed.filter(i => i.bookable).sort((a, b) => b.date.localeCompare(a.date)),
        today, bookFrom
    };
}

// The order-list chip: an order line created from a proforma carries orderNo.
export function orderState(p, orderNo) {
    const o = p.orders.find(x => x.orderNo === orderNo);
    if (!o) return null;
    return { stage: o.stage, prepaid: o.prepaid.length > 0, paidOn: o.prepaid[0]?.date || '', paid: o.paidAmount, total: o.total, warranty: !!o.warranty };
}
