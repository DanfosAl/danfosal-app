// Stock > Purchases: every Kärcher order from the proforma to the shelf, with what was paid, what
// customs cost and what each item really cost.
//
// The papers are read and filed by the Paper Autopilot (tools/paper-autopilot), which writes what
// each one says to `purchaseDocs`; purchasing.js links them. This screen shows the result and does
// two things with it: puts an order on the order list, and hands an arrived invoice to Receive
// delivery with its landed costs and whether it is already paid, so a prepaid delivery never
// lands in Money > You owe.
import { db, collection, doc, getDocs, writeBatch } from './firebase.js';
import { esc, eur, int, icon, plural, money2, toast, openDrawer, openModal } from './ui.js';
import { buildPurchasing } from './purchasing.js';
import { loadOrderLines } from './orderlist.js';
import { prefillReceive } from './receive.js';

const pu = { filter: 'open' };
const d8 = s => s ? new Date(s + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
const STAGE = {
    ordered: ['Ordered', 'vio'], prepaid: ['Prepaid · on its way', 'ok'], arrived: ['Arrived · book it', 'warn'],
    booked: ['In stock', 'ok'], delivered: ['Delivered (history)', '']
};

export async function loadPurchasing(products) {
    const docs = (await getDocs(collection(db, 'purchaseDocs'))).docs.map(d => ({ id: d.id, ...d.data() }));
    return buildPurchasing(docs, { products });
}

function payChip(pay) {
    if (!pay) return '';
    if (pay.status === 'paid') return `<span class="chip ok" title="${esc(pay.note || '')}">${pay.how === 'prepaid' ? 'prepaid' : 'paid'}${pay.date ? ' ' + esc(d8(pay.date)) : ''}</span>`;
    if (pay.status === 'part') return `<span class="chip warn">part paid</span>`;
    return `<span class="chip bad" title="${esc(pay.note || '')}">open${pay.amount ? ' €' + money2(pay.amount) : ''}</span>`;
}

export async function renderPurchases(ctx) {
    ctx.setSub('Reading the purchase papers…');
    ctx.body.innerHTML = '<div class="skeleton" style="height:320px"></div>';
    let P, lines;
    try { [P, lines] = await Promise.all([loadPurchasing(ctx.model.products), loadOrderLines()]); }
    catch (e) { ctx.body.innerHTML = `<div class="error-box">${icon('error')}<div><b>Couldn't load the purchases.</b><br><span>${esc(e.message)}</span></div></div>`; return; }
    if (ctx.tab !== 'purchases') return;

    const onList = new Set(lines.map(l => l.orderNo).filter(Boolean));
    const year = String(new Date().getFullYear());
    const importCosts = P.customs.filter(c => c.matched && c.decl.date.startsWith(year));
    const acc = P.account;
    const prepaidWaiting = P.orders.filter(o => o.stage === 'prepaid');
    const FILTERS = [['open', 'Open', o => ['ordered', 'prepaid', 'arrived'].includes(o.stage)], ['booked', 'In stock', o => o.stage === 'booked'],
        ['history', 'History', o => o.stage === 'delivered'], ['all', 'All', () => true]];
    const f = FILTERS.find(x => x[0] === pu.filter) || FILTERS[0];
    const shown = P.orders.filter(f[2]);

    ctx.setSub(`${plural(P.orders.length, 'Kärcher order', 'Kärcher orders')} · ${acc.open > 0.005 ? `<b style="color:var(--warn)">${eur(acc.open, 2)} open</b> with Kärcher` : 'nothing open with Kärcher'}${acc.statementDate ? ` · statement of ${esc(d8(acc.statementDate))}` : ''}`);
    ctx.body.innerHTML = `
        <div class="kpis">
            <div class="kpi"><small>Kärcher account</small><span class="v"${acc.open > 0.005 ? ' style="color:var(--warn)"' : ''}>${eur(acc.open, 2)}</span>
                <span class="d">${acc.open > 0.005 ? `${plural(acc.openInvoices.length, 'invoice', 'invoices')} not paid` : acc.statementDate ? `statement of ${esc(d8(acc.statementDate))} settled` : 'no statement yet'}</span></div>
            <div class="kpi"><small>To book into stock</small><span class="v">${int(P.waiting.length)}</span><span class="d">${P.waiting.length ? `${eur(P.waiting.reduce((s, i) => s + i.landed, 0), 2)} at landed cost` : 'every new delivery is booked'}</span></div>
            <div class="kpi"><small>Prepaid, on its way</small><span class="v">${int(prepaidWaiting.length)}</span><span class="d">${prepaidWaiting.length ? `${eur(prepaidWaiting.reduce((s, o) => s + o.paidAmount, 0), 2)} paid in advance` : 'nothing paid ahead'}</span></div>
            <div class="kpi"><small>Import costs ${year}</small><span class="v">${eur(importCosts.reduce((s, c) => s + c.dutyEUR + c.feesEUR, 0), 2)}</span>
                <span class="d">duty and fees · VAT ${eur(importCosts.reduce((s, c) => s + c.vatEUR, 0), 0)} is reclaimed</span></div>
        </div>
        <div class="toolbar"><div class="filters" id="pu-f">${FILTERS.map(([id, label, test]) => `<button class="filter" type="button" data-f="${id}" aria-pressed="${id === pu.filter}">${esc(label)}<span class="n">${int(P.orders.filter(test).length)}</span></button>`).join('')}</div></div>
        <div class="table-wrap"><table class="dt"><thead><tr><th>Order</th><th>What</th><th class="n">Ordered</th><th>Paid</th><th>Invoices</th><th>Customs</th><th>Where it is</th><th></th></tr></thead>
        <tbody id="pu-rows">${shown.map(o => {
            const inv = o.invoices, cust = [...new Set(inv.filter(i => i.customs).map(i => i.customs.number))];
            const duty = inv.reduce((s, i) => s + (i.customs ? i.customs.duty + i.customs.fees : 0), 0);
            const what = o.items.length ? `${esc(o.items[0].name)}${o.items.length > 1 ? ` +${o.items.length - 1}` : ''}` : inv.length ? `${plural(inv.reduce((s, i) => s + (i.items || []).length, 0), 'line', 'lines')} invoiced` : '–';
            const paid = o.prepaid.length ? `<span class="chip ok" title="${esc(o.prepaid.map(p => `${p.date}: €${money2(p.amount)} “${p.details}”`).join('\n'))}">prepaid ${esc(d8(o.prepaid[0].date))}</span>`
                : inv.length ? (inv.every(i => i.pay.status === 'paid') ? '<span class="chip ok">paid</span>' : `<span class="chip bad">${eur(o.open, 2)} open</span>`) : '<span class="chip">not paid</span>';
            const [label, tone] = STAGE[o.stage];
            const canList = ['ordered', 'prepaid'].includes(o.stage) && o.items.length && !onList.has(o.orderNo);
            return `<tr data-o="${esc(o.orderNo)}" tabindex="0">
                <td class="name"><b>${esc(o.orderNo)}</b><span>${esc(d8(o.date))}${o.docs.length ? ` · ${esc(o.docs.map(d => d.source).filter((v, i, a) => a.indexOf(v) === i).join(' + '))}` : ''}</span></td>
                <td class="muted" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${what}</td>
                <td class="n">${o.total ? eur(o.total, 2) : o.invoiced ? `<span class="muted">${eur(o.invoiced, 2)}</span>` : '–'}</td>
                <td>${paid}</td>
                <td>${inv.length ? `${plural(inv.length, 'invoice', 'invoices')}${o.unfiled.length ? ` <span class="chip warn" title="Known from Kärcher's statement; the PDF isn't in the archive">${o.unfiled.length} PDF missing</span>` : ''}` : '<span class="muted">none yet</span>'}</td>
                <td>${cust.length && duty > 0.005 ? `<span class="chip" title="${esc(cust.join(', '))}">+${eur(duty, 2)}</span>` : '<span class="muted">–</span>'}</td>
                <td><span class="chip ${tone}">${esc(label)}</span>${onList.has(o.orderNo) ? ' <span class="chip vio">on the list</span>' : ''}</td>
                <td class="n" style="white-space:nowrap">${o.waiting.length ? `<button class="btn small money" type="button" data-book="${esc(o.orderNo)}">${icon('move_to_inbox')}Book into stock</button>` : ''}
                    ${canList ? `<button class="btn small" type="button" data-list="${esc(o.orderNo)}">${icon('playlist_add')}Order list</button>` : ''}</td></tr>`;
        }).join('') || `<tr><td colspan="8"><div class="all-clear">${icon('check_circle')}<div><b>${pu.filter === 'open' ? 'No order is waiting on anything.' : 'Nothing here.'}</b><br><span>New Kärcher papers are read when the Paper Autopilot files Downloads (Mondays).</span></div></div></td></tr>`}</tbody></table>
        <div class="table-foot">Read from the papers in E:\\Danfos Papers. Landed cost = what you paid Kärcher (less any cash discount credited back) + customs duty and fees; import VAT is left out because it is reclaimed.</div></div>`;

    ctx.body.querySelector('#pu-f').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { pu.filter = b.dataset.f; renderPurchases(ctx); } });
    ctx.body.querySelector('#pu-rows').addEventListener('click', async e => {
        const book = e.target.closest('[data-book]'), list = e.target.closest('[data-list]'), row = e.target.closest('tr[data-o]');
        const o = P.orders.find(x => x.orderNo === (book?.dataset.book || list?.dataset.list || row?.dataset.o));
        if (!o) return;
        if (book) return bookInvoice(ctx, o.waiting[0], o);
        if (list) return putOnOrderList(ctx, o);
        orderDrawer(ctx, P, o, onList);
    });
}

// ------------------------------------------------------------------ one order, all its papers

function orderDrawer(ctx, P, o, onList) {
    const row = (when, what, amount, extra = '') => `<div class="feed-row" style="display:grid;grid-template-columns:96px minmax(0,1fr) auto;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">
        <span class="muted">${esc(d8(when))}</span><div>${what}${extra ? `<div class="muted" style="font-size:12px;margin-top:2px">${extra}</div>` : ''}</div><span class="amt">${amount}</span></div>`;
    const events = [];
    o.docs.forEach(d => events.push([d.date, row(d.date, `<b>${d.source === 'proforma' ? 'Proforma' : 'Order confirmed'}</b> · ${plural(d.items.length, 'line', 'lines')}`, eur(d.total, 2),
        `${d.cashDiscountTotal ? `€${money2(d.cashDiscountTotal)} if paid at once (${d.cashDiscountPct}% cash discount) · ` : ''}${esc(d.file || '')}`)]));
    o.payments.forEach(p => events.push([p.date, row(p.date, `<b>Paid</b> to Kärcher`, eur(p.amount, 2), `“${esc(p.details)}” · bank ref ${esc(p.bankRef || '–')}${o.cashDiscountTotal && Math.abs(p.amount - o.cashDiscountTotal) > 0.05 && Math.abs(p.amount - o.total) < 0.05 ? ` · <span style="color:var(--warn)">paid in full: the ${esc(String(o.docs[0]?.cashDiscountPct || 3))}% cash discount would have made it €${money2(o.cashDiscountTotal)}</span>` : ''}`)]));
    o.invoices.forEach(i => {
        const lines = (i.lines || []).map(l => `<tr><td class="name"><b>${esc(l.name)}</b><span>${esc([l.code, l.origin, l.preference === 'EU' ? 'EU origin, no duty' : l.preference === 'none' ? 'duty applies' : '', l.serials ? `${l.serials.length} serial${l.serials.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · '))}</span></td>
            <td class="n">${int(l.qty)}</td><td class="n">€${money2(l.unitCost)}</td><td class="n">${l.duty + l.fees ? `+€${money2((l.duty + l.fees) / (l.qty || 1))}` : '–'}</td><td class="n"><b>€${money2(l.landedUnit)}</b></td></tr>`).join('');
        events.push([i.date, row(i.date, `<b>Invoice ${esc(i.invoiceNo)}</b> ${payChip(i.pay)} ${i.booked ? '<span class="chip ok">in stock</span>' : i.bookable ? '<span class="chip warn">to book</span>' : i.pdf === false ? '<span class="chip warn">PDF missing</span>' : ''}`, eur(i.net, 2),
            [i.pay?.note, i.credit ? `€${money2(i.credit)} credited back (cash discount)` : '', i.customs ? `customs ${esc(i.customs.number)} on ${esc(d8(i.customs.date))}: duty €${money2(i.customs.duty)}, fees €${money2(i.customs.fees)}` : '',
                i.pdf === false ? 'known from Kärcher’s statement; download the PDF to book its lines' : esc(i.file || '')].filter(Boolean).join(' · '))
            + (lines ? `<div class="table-wrap" style="margin:4px 0 10px"><table class="dt"><thead><tr><th>Line</th><th class="n">Qty</th><th class="n">Invoice</th><th class="n">Customs</th><th class="n">Landed</th></tr></thead><tbody>${lines}</tbody></table></div>` : '')
            + (i.pdf !== false && !i.booked ? `<button class="btn small ${i.bookable ? 'money' : ''}" type="button" data-book-inv="${esc(i.invoiceNo)}" style="margin-bottom:8px">${icon('move_to_inbox')}Book invoice ${esc(i.invoiceNo)} into stock</button>` : '')]);
    });
    o.credits.forEach(c => events.push([c.date, row(c.date, `<b>Credit note ${esc(c.number)}</b> (${esc(c.reason)})`, `−${eur(c.amount, 2)}`, esc(c.refInvoices.join(', ')))]));
    events.sort((a, b) => (a[0] || '').localeCompare(b[0] || ''));
    const waitingItems = o.outstandingKnown && o.outstanding.length ? `<p class="muted" style="margin:10px 0 0">Still to come: ${o.outstanding.map(l => `${esc(l.name)} × ${int(l.waiting)}`).join(', ')}</p>` : '';
    const canList = ['ordered', 'prepaid'].includes(o.stage) && o.items.length && !onList.has(o.orderNo);
    const { el, close } = openDrawer({
        title: `Order ${esc(o.orderNo)}`, sub: `${esc(d8(o.date))} · ${esc(STAGE[o.stage][0])}${o.landed ? ` · landed ${eur(o.landed, 2)}` : ''}`,
        body: `<div>${events.map(e => e[1]).join('') || '<p class="empty">No papers yet.</p>'}</div>${waitingItems}`,
        foot: canList ? `<button class="btn" type="button" id="od-list">${icon('playlist_add')}Put on the order list</button>` : ''
    });
    el.addEventListener('click', e => {
        const b = e.target.closest('[data-book-inv]');
        if (b) { close(); bookInvoice(ctx, o.invoices.find(i => i.invoiceNo === b.dataset.bookInv), o); }
        if (e.target.closest('#od-list')) { close(); putOnOrderList(ctx, o); }
    });
}

// ------------------------------------------------------------------ actions

// Hand the invoice to Receive delivery, costed and with its payment settled.
async function bookInvoice(ctx, inv, o) {
    if (!inv) return;
    if (!inv.bookable) {
        const ok = await openModal({ title: `Book invoice ${inv.invoiceNo}?`, confirmLabel: 'Book it anyway', confirmClass: 'money',
            body: `<p>This delivery arrived on ${esc(d8(inv.arrived))}, before purchases were tracked here. Its goods are most likely already counted in stock; booking it would add them a second time.</p><p class="muted">Only go on if you know these items never went into stock.</p>` });
        if (!ok) return;
    }
    prefillReceive({
        supplier: 'Karcher', invoiceNumber: inv.invoiceNo, date: inv.date, net: inv.net, prepayPct: 0, prepayAmount: 0,
        reader: `Purchases: order ${o.orderNo}, landed cost`, fileName: inv.file || '',
        items: inv.lines.map(l => ({ code: l.code, name: l.name, quantity: l.qty, unitCost: l.landedUnit, invoiceUnit: l.unitCost,
            extraUnit: l.qty ? Math.round((l.duty + l.fees) / l.qty * 100) / 100 : 0, free: l.free, serials: l.serials })),
        fromPurchase: { orderNo: o.orderNo, paid: inv.pay.status === 'paid', payNote: inv.pay.note || '', payDate: inv.pay.date || '', customs: inv.customs?.number || '' }
    });
    window.location.hash = '#receive';
}

async function putOnOrderList(ctx, o) {
    const norm = c => String(c || '').replace(/[.\-\s]/g, '');
    const lines = o.outstandingKnown && o.outstanding.length ? o.outstanding.map(l => ({ ...l, qty: l.waiting })) : o.items;
    const ok = await openModal({ title: `Put order ${o.orderNo} on the order list?`, confirmLabel: 'Add to the order list',
        body: `<p>${plural(lines.length, 'line', 'lines')}: ${lines.slice(0, 5).map(l => `${esc(l.name)} × ${int(l.qty)}`).join(', ')}${lines.length > 5 ? '…' : ''}.</p>
            <p class="muted">${o.prepaid.length ? `Marked prepaid (${esc(d8(o.prepaid[0].date))}). ` : ''}Receive delivery ticks the lines off when the invoice is booked.</p>` });
    if (!ok) return;
    const batch = writeBatch(db);
    lines.forEach(l => {
        const p = ctx.model.products.find(x => x.code && norm(x.code) === norm(l.code));
        batch.set(doc(collection(db, 'toOrder')), { name: p ? p.name : l.name, code: l.code, quantity: l.qty, supplier: 'Karcher', quantityReceived: 0, smartSuggestion: false,
            estimatedCost: Math.round((l.unitCost || 0) * l.qty * 100) / 100, addedAt: Date.now(), orderNo: o.orderNo, orderSource: o.docs[0]?.source || 'invoice', productId: p ? p._id : null });
    });
    try { await batch.commit(); toast(`Order ${o.orderNo} is on the order list`); renderPurchases(ctx); }
    catch (e) { toast(`Couldn't add it: ${e.message}`, { bad: true }); }
}
