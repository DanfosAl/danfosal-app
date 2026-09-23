// Money workspace: who owes you, what you owe suppliers, and what the business costs to run.
//
// Debts keep the classic shape: debtors/{id} {name} and
// debtors/{id}/invoices/{id} {number, totalAmount, remainingBalance, items, payments[{amount,
// timestamp}]}. New debts also get createdAt (the classic ones have no date). Payments are
// recorded in a transaction that re-reads the invoice and recomputes the balance from the
// payments themselves, so two people paying in at once can't lose one.
import { bootWorkspace } from './workspace.js';
import { db, collection, doc, addDoc, updateDoc, deleteDoc, runTransaction, writeBatch, Timestamp } from './firebase.js';
import { esc, eur, int, icon, plural, day, fold, money2, toast, openDrawer, openModal } from './ui.js';
import { toMs, customerKey, saleInvoiceNumber, shortInvoice, saleTime, netRevenue, saleNetCost, DAY, productNameIndex, returnTime, returnTotal, returnNet, returnNetCost, recurringFor, runningCostOf, monthKeyOf
} from './data.js';
import { addSupplierInvoice } from './payables.js';

const r2 = n => Math.round(n * 100) / 100;
const paidOf = inv => (inv.payments || []).reduce((a, p) => a + (Number(p.amount) || 0), 0);
const balanceOf = inv => r2((Number(inv.totalAmount) || 0) - paidOf(inv));
// The invoice number carries the year ("446/2025"); new debts also have createdAt.
const debtTime = inv => toMs(inv.createdAt) || (/\/(20\d\d)\b/.test(inv.number || '') ? new Date(Number(inv.number.match(/\/(20\d\d)\b/)[1]), 0, 1).getTime() : NaN);
const lastPayment = inv => Math.max(0, ...(inv.payments || []).map(p => toMs(p.timestamp)).filter(t => !isNaN(t)));

function debtorGroups(m) {
    const groups = new Map();
    m.debts.forEach(d => {
        if (!groups.has(d.debtorId)) groups.set(d.debtorId, { id: d.debtorId, name: d.debtor, invoices: [] });
        groups.get(d.debtorId).invoices.push(d);
    });
    // Debtors with no invoices still exist (the classic list lets you add a name first).
    (m.debtors || []).forEach(d => { if (!groups.has(d._id)) groups.set(d._id, { id: d._id, name: d.name || '', invoices: [] }); });
    return [...groups.values()].map(g => ({
        ...g,
        total: g.invoices.reduce((a, i) => a + (Number(i.totalAmount) || 0), 0),
        paid: g.invoices.reduce((a, i) => a + paidOf(i), 0),
        owed: g.invoices.reduce((a, i) => a + Math.max(0, balanceOf(i)), 0),
        open: g.invoices.filter(i => balanceOf(i) > 0.005).length,
        lastPaid: Math.max(0, ...g.invoices.map(lastPayment)),
        oldest: Math.min(...g.invoices.filter(i => balanceOf(i) > 0.005).map(debtTime).filter(t => !isNaN(t)), Infinity)
    }));
}

// ================================================================== owed to you

const owed = { showPaid: false };

function renderOwed(ctx) {
    const groups = debtorGroups(ctx.model).sort((a, b) => b.owed - a.owed || fold(a.name).localeCompare(fold(b.name)));
    const total = groups.reduce((a, g) => a + g.owed, 0);
    const openInvoices = groups.reduce((a, g) => a + g.open, 0);
    const received90 = ctx.model.debts.flatMap(i => i.payments || []).filter(p => toMs(p.timestamp) >= ctx.a.now - 90 * 86400000).reduce((a, p) => a + (Number(p.amount) || 0), 0);
    ctx.setSub(`${eur(total, 2)} owed to you on ${plural(openInvoices, 'invoice', 'invoices')}`);
    const actions = ctx.setActions(`<button class="btn primary" type="button" id="new-debt">${icon('add')}New debt</button>`);
    actions.querySelector('#new-debt').addEventListener('click', () => newDebtDialog(ctx, null));
    const shown = groups.filter(g => owed.showPaid || g.owed > 0.005);
    const biggest = groups[0];

    ctx.body.innerHTML = `
        <div class="kpis">
            <div class="kpi"><small>Owed to you</small><span class="v">${eur(total)}</span><span class="d">${plural(groups.filter(g => g.owed > 0.005).length, 'customer', 'customers')}</span></div>
            <div class="kpi"><small>Largest</small><span class="v">${biggest && biggest.owed > 0.005 ? eur(biggest.owed) : '–'}</span><span class="d">${biggest && biggest.owed > 0.005 ? esc(biggest.name) + ` · ${Math.round(100 * biggest.owed / total)}% of the total` : ''}</span></div>
            <div class="kpi"><small>Received in 90 days</small><span class="v">${eur(received90)}</span><span class="d">payments recorded against debts</span></div>
            <div class="kpi"><small>Oldest unpaid</small><span class="v">${(() => { const t = Math.min(...groups.map(g => g.oldest)); return isFinite(t) ? new Date(t).getFullYear() : '–'; })()}</span><span class="d">year on the oldest open invoice</span></div>
        </div>
        <div class="toolbar"><div class="filters"><button class="filter" type="button" id="ow-paid" aria-pressed="${owed.showPaid}">Include paid off<span class="n">${int(groups.filter(g => g.owed <= 0.005).length)}</span></button></div></div>
        ${shown.length ? `<div class="table-wrap"><table class="dt"><thead><tr><th>Customer</th><th class="n">Open invoices</th><th class="n">Invoiced</th><th class="n">Paid</th><th class="n">Still owed</th><th>Paid off</th><th class="n">Last payment</th></tr></thead>
        <tbody id="ow-body">${shown.map(g => `
            <tr data-id="${esc(g.id)}" tabindex="0"><td class="name"><b>${esc(g.name || '?')}</b><span>${esc(g.invoices.map(i => i.number).filter(Boolean).join(', '))}</span></td>
                <td class="n">${int(g.open)}</td><td class="n">${eur(g.total, 2)}</td><td class="n">${eur(g.paid, 2)}</td>
                <td class="n">${g.owed > 0.005 ? `<b>${eur(g.owed, 2)}</b>` : '<span class="chip ok">paid</span>'}</td>
                <td>${g.total > 0 ? `<span class="cover"><span class="bar"><i style="width:${Math.min(100, 100 * g.paid / g.total).toFixed(1)}%;background:var(--ok)"></i></span><span class="muted">${Math.round(100 * g.paid / g.total)}%</span></span>` : ''}</td>
                <td class="n muted">${g.lastPaid ? esc(day(g.lastPaid)) + ' ' + new Date(g.lastPaid).getFullYear() : 'never'}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="all-clear">${icon('check_circle')}<div><b>Nobody owes you anything.</b><br><span>Record a debt when a customer takes goods on credit.</span></div></div>`}`;
    ctx.body.querySelector('#ow-paid').addEventListener('click', () => { owed.showPaid = !owed.showPaid; renderOwed(ctx); });
    const tb = ctx.body.querySelector('#ow-body');
    if (!tb) return;
    const open = e => { const tr = e.target.closest('tr[data-id]'); if (tr) debtorDrawer(ctx, tr.dataset.id); };
    tb.addEventListener('click', open);
    tb.addEventListener('keydown', e => { if (e.key === 'Enter') open(e); });
}

function debtorDrawer(ctx, debtorId) {
    const g = debtorGroups(ctx.model).find(x => x.id === debtorId);
    if (!g) return;
    const saleByNumber = new Map(ctx.model.sales.filter(s => saleInvoiceNumber(s)).map(s => [shortInvoice(saleInvoiceNumber(s)), s]));
    const invoices = g.invoices.slice().sort((a, b) => balanceOf(b) - balanceOf(a));
    const { el, close } = openDrawer({
        title: esc(g.name || '?'),
        sub: `${eur(g.owed, 2)} still owed · ${eur(g.paid, 2)} of ${eur(g.total, 2)} paid`,
        body: `${invoices.map(inv => {
            const bal = balanceOf(inv), sale = saleByNumber.get(shortInvoice(inv.number));
            return `<section class="panel" style="padding:12px 14px">
                <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
                    <b style="font-weight:500">Invoice ${esc(inv.number || '–')}</b>
                    ${bal > 0.005 ? `<span class="chip warn">€${money2(bal)} owed</span>` : '<span class="chip ok">paid in full</span>'}
                    ${sale ? `<a class="btn ghost small" href="sell.html?q=${encodeURIComponent(shortInvoice(inv.number))}#sales">${icon('receipt_long')}See the sale</a>` : ''}
                    <span class="muted" style="margin-left:auto;font-family:var(--mono);font-size:12.5px">€${money2(inv.totalAmount)}</span>
                </div>
                ${(inv.items || []).length ? `<p class="empty" style="margin:4px 0 0">${(inv.items || []).map(i => esc(i.name)).join(', ')}</p>` : ''}
                <div class="lines" style="margin-top:6px">${(inv.payments || []).map((p, i) => `
                    <div class="line"><div><b>Paid €${money2(p.amount)}</b><span>${toMs(p.timestamp) ? esc(day(toMs(p.timestamp))) + ' ' + new Date(toMs(p.timestamp)).getFullYear() : ''}</span></div>
                        <button class="btn ghost small" type="button" data-undo="${esc(inv._id)}" data-i="${i}" aria-label="Remove this payment">${icon('undo')}</button></div>`).join('') || '<p class="empty">No payments yet.</p>'}</div>
                ${bal > 0.005 ? `<div style="display:flex;gap:8px;margin-top:8px"><button class="btn small primary" type="button" data-pay="${esc(inv._id)}">${icon('payments')}Record payment</button>
                    <button class="btn small" type="button" data-full="${esc(inv._id)}">Paid in full</button></div>` : ''}
            </section>`;
        }).join('') || '<p class="empty">No invoices yet.</p>'}`,
        foot: `<button class="btn" type="button" id="dd-new">${icon('add')}New debt for ${esc(g.name)}</button>
               <a class="btn ghost" href="customers.html?q=${encodeURIComponent(g.name)}#all" style="margin-left:auto">${icon('person')}Customer profile</a>`
    });
    el.querySelector('#dd-new').addEventListener('click', () => { close(); newDebtDialog(ctx, g); });
    el.addEventListener('click', async e => {
        const pay = e.target.closest('[data-pay]'), full = e.target.closest('[data-full]'), undo = e.target.closest('[data-undo]');
        const inv = id => invoices.find(i => i._id === id);
        if (pay) {
            const i = inv(pay.dataset.pay);
            const ok = await openModal({
                title: `Payment on invoice ${i.number || ''}`, confirmLabel: 'Record payment', confirmClass: 'money',
                body: `<p>${esc(g.name)} owes €${money2(balanceOf(i))} on this invoice.</p>
                    <div class="form-grid"><label class="fld">Amount (€)<input id="pm-amount" type="number" min="0.01" step="0.01" max="${balanceOf(i)}"></label>
                    <label class="fld">Date<input id="pm-date" type="date" value="${new Date().toISOString().slice(0, 10)}"></label></div>`,
                validate: w => { const a = Number(w.querySelector('#pm-amount').value); return !(a > 0) ? 'Enter the amount paid.' : a > balanceOf(i) + 0.005 ? `That's more than the €${money2(balanceOf(i))} owed.` : ''; }
            });
            if (ok) await recordPayment(ctx, g, i, Number(ok.querySelector('#pm-amount').value), ok.querySelector('#pm-date').value, close);
        }
        if (full) {
            const i = inv(full.dataset.full);
            const ok = await openModal({ title: `Mark invoice ${i.number || ''} as paid?`, confirmLabel: `Record €${money2(balanceOf(i))}`, confirmClass: 'money',
                body: `<p>Records a payment of €${money2(balanceOf(i))} today, which clears this invoice.</p>` });
            if (ok) await recordPayment(ctx, g, i, balanceOf(i), new Date().toISOString().slice(0, 10), close);
        }
        if (undo) {
            const i = inv(undo.dataset.undo), p = i.payments[Number(undo.dataset.i)];
            const ok = await openModal({ title: 'Remove this payment?', confirmLabel: 'Remove payment',
                body: `<p>€${money2(p.amount)} on invoice ${esc(i.number || '')} will no longer count, and the balance goes back up. Use this for a payment recorded by mistake.</p>` });
            if (ok) await changePayments(ctx, g, i, pays => { const k = pays.findIndex(x => x.amount === p.amount && x.timestamp === p.timestamp); if (k < 0) throw new Error('That payment was already removed.'); pays.splice(k, 1); return pays; }, 'Payment removed', close);
        }
    });
}

// Re-read the invoice, change its payments, and store the balance they add up to.
async function changePayments(ctx, g, inv, change, message, close) {
    const ref = doc(db, 'debtors', g.id, 'invoices', inv._id);
    try {
        await runTransaction(db, async tx => {
            const snap = await tx.get(ref);
            if (!snap.exists()) throw new Error('This invoice no longer exists.');
            const cur = snap.data();
            const payments = change([...(cur.payments || [])]);
            tx.update(ref, { payments, remainingBalance: balanceOf({ totalAmount: cur.totalAmount, payments }) });
        });
        toast(message); close(); await ctx.reload(); debtorDrawer(ctx, g.id);
    } catch (e) { toast(`Couldn't save: ${e.message}`, { bad: true }); }
}

function recordPayment(ctx, g, inv, amount, dateStr, close) {
    const today = new Date().toISOString().slice(0, 10);
    const timestamp = dateStr && dateStr !== today ? new Date(dateStr + 'T12:00').getTime() : Date.now();
    return changePayments(ctx, g, inv, pays => [...pays, { amount: r2(amount), timestamp }], `€${money2(amount)} recorded from ${g.name}`, close);
}

async function newDebtDialog(ctx, group) {
    const groups = debtorGroups(ctx.model);
    const ok = await openModal({
        title: 'New debt', confirmLabel: 'Save debt',
        body: `<div class="form-grid">
            <label class="fld wide">Customer<input id="nd-name" list="nd-names" value="${esc(group ? group.name : '')}" autocomplete="off"></label>
            <datalist id="nd-names">${groups.map(x => `<option value="${esc(x.name)}">`).join('')}</datalist>
            <label class="fld">Invoice number<input id="nd-number" placeholder="e.g. 355/2026"></label>
            <label class="fld">Amount owed (€)<input id="nd-amount" type="number" min="0.01" step="0.01"></label>
            <label class="fld wide">Already paid now (€)<input id="nd-paid" type="number" min="0" step="0.01" placeholder="0">
                <span class="hint">A deposit taken at the sale, if any.</span></label></div>`,
        validate: w => {
            const v = id => w.querySelector(id).value.trim();
            const amount = Number(v('#nd-amount')), paid = Number(v('#nd-paid')) || 0;
            return !v('#nd-name') ? 'Enter the customer.' : !v('#nd-number') ? 'Enter the invoice number.' : !(amount > 0) ? 'Enter the amount owed.' : paid < 0 || paid > amount ? 'The deposit must be between 0 and the amount.' : '';
        }
    });
    if (!ok) return;
    const v = id => ok.querySelector(id).value.trim();
    const name = v('#nd-name'), amount = r2(Number(v('#nd-amount'))), paid = r2(Number(v('#nd-paid')) || 0);
    try {
        let debtor = groups.find(x => customerKey(x.name) === customerKey(name));
        const debtorId = debtor ? debtor.id : (await addDoc(collection(db, 'debtors'), { name })).id;
        const payments = paid > 0 ? [{ amount: paid, timestamp: Date.now() }] : [];
        await addDoc(collection(db, 'debtors', debtorId, 'invoices'), {
            number: v('#nd-number'), totalAmount: amount, remainingBalance: r2(amount - paid), items: [], payments, createdAt: Timestamp.now()
        });
        toast(`€${money2(amount - paid)} owed by ${name} recorded`);
        await ctx.reload();
        debtorDrawer(ctx, debtorId);
    } catch (e) { toast(`Couldn't save: ${e.message}`, { bad: true }); }
}

// ================================================================== expenses

// Categories match the classic Expenses page, so its 5 entries keep their meaning.
const CATEGORIES = [['Rent', 'Rent'], ['Salaries', 'Salaries'], ['Utilities', 'Utilities (power, water, internet)'], ['Maintenance', 'Maintenance & repairs'],
    ['Marketing', 'Marketing & ads'], ['Supplies', 'Office & store supplies'], ['Taxes', 'Taxes'], ['Other', 'Other']];
const CAT_COLORS = ['#8b5cf6', '#6d5bb8', '#38bdf8', '#8a6a2a', '#9a4b3a', '#2f6d57', '#5b5f8f', '#a78bfa'];
const catLabel = c => (CATEGORIES.find(x => x[0] === c) || [c, c || 'Other'])[1];
const ymd = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const expTime = e => toMs(e.date) || toMs(e.createdAt);
const monthStartOf = t => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
const monthName = t => new Date(t).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const shortMonth = t => new Date(t).toLocaleDateString('en-GB', { month: 'long' });
const exp = { month: null };

// Gross profit per month from sales whose cost is known - the same rule as Today and Insights.
function grossByMonth(m) {
    const out = new Map();
    m.sales.filter(s => !s.isReturn).forEach(s => {
        const t = saleTime(s); if (isNaN(t)) return;
        const k = monthStartOf(t), x = out.get(k) || { net: 0, costedNet: 0, cost: 0 };
        const net = netRevenue(s), cost = saleNetCost(s);
        x.net += net; if (cost !== null) { x.costedNet += net; x.cost += cost; }
        out.set(k, x);
    });
    // Refunds reverse the month they were given in: the money went back, and so did the goods.
    const byName = productNameIndex(m.products);
    (m.returns || []).forEach(r => {
        const t = returnTime(r); if (isNaN(t)) return;
        const k = monthStartOf(t), x = out.get(k) || { net: 0, costedNet: 0, cost: 0 };
        const net = returnNet(r), cost = returnNetCost(r, byName);
        x.net -= net; if (cost !== null) { x.costedNet -= net; x.cost -= cost; }
        out.set(k, x);
    });
    return out;
}

function renderExpenses(ctx) {
    const m = ctx.model, thisMonth = monthStartOf(ctx.a.now);
    if (exp.month === null) exp.month = thisMonth;
    const next = t => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(); };
    const all = m.expenses.filter(e => !isNaN(expTime(e))).sort((a, b) => expTime(b) - expTime(a));
    const monthExp = all.filter(e => expTime(e) >= exp.month && expTime(e) < next(exp.month));
    // Rent and salaries do not need retyping every month: they are entered once under "Every
    // month" and counted here, which is what lets a month state its real profit at all.
    const repeat = recurringFor(m, exp.month);
    const cost = runningCostOf(m, exp.month, monthExp);
    const monthTotal = cost.total;
    const known = monthExp.length > 0 || repeat.length > 0;
    const gross = grossByMonth(m);
    const g = gross.get(exp.month) || { net: 0, costedNet: 0, cost: 0 };
    const gp = g.costedNet - g.cost;
    // The latest earlier month that has expenses is the template for "copy costs".
    const prevMonths = [...new Set(all.map(e => monthStartOf(expTime(e))))].filter(t => t < exp.month).sort((a, b) => b - a);
    const template = prevMonths.length ? all.filter(e => monthStartOf(expTime(e)) === prevMonths[0]) : [];

    ctx.setSub(`${monthName(exp.month)} · ${known ? eur(monthTotal) + ' to run the shop' : 'nothing recorded yet'}`);
    const actions = ctx.setActions(`<div class="seg" role="group" aria-label="Month">
            <button type="button" data-mv="-1" aria-label="Previous month">${icon('chevron_left')}</button>
            <button type="button" aria-pressed="true" style="min-width:150px;justify-content:center">${esc(monthName(exp.month))}</button>
            <button type="button" data-mv="1" aria-label="Next month"${exp.month >= thisMonth ? ' disabled' : ''}>${icon('chevron_right')}</button></div>
        ${template.length && !monthExp.length ? `<button class="btn" type="button" id="copy-exp">${icon('content_copy')}Copy ${esc(shortMonth(prevMonths[0]))}'s costs</button>` : ''}
        <button class="btn" type="button" id="fixed-exp">${icon('event_repeat')}Every month</button>
        <button class="btn primary" type="button" id="new-exp">${icon('add')}New expense</button>`);
    actions.querySelectorAll('[data-mv]').forEach(b => b.addEventListener('click', () => {
        const d = new Date(exp.month); exp.month = new Date(d.getFullYear(), d.getMonth() + Number(b.dataset.mv), 1).getTime(); renderExpenses(ctx);
    }));
    actions.querySelector('#new-exp').addEventListener('click', () => expenseDialog(ctx));
    actions.querySelector('#fixed-exp').addEventListener('click', () => recurringDialog(ctx));
    const copy = actions.querySelector('#copy-exp');
    if (copy) copy.addEventListener('click', () => copyExpenses(ctx, template));

    // Twelve months ending with the selected one.
    const rows = [];
    for (let i = 0; i < 12; i++) {
        const d = new Date(exp.month), k = new Date(d.getFullYear(), d.getMonth() - i, 1).getTime();
        const x = gross.get(k) || { net: 0, costedNet: 0, cost: 0 };
        const list = all.filter(z => monthStartOf(expTime(z)) === k);
        const c = runningCostOf(m, k, list);
        rows.push({ k, gp: x.costedNet - x.cost, net: x.net, costedShare: x.net ? x.costedNet / x.net : 1, e: c.total, hasExp: list.length > 0 || c.repeating > 0, repeating: c.repeating });
    }
    const byCat = new Map();
    monthExp.forEach(e => byCat.set(e.category || 'Other', (byCat.get(e.category || 'Other') || 0) + (Number(e.amount) || 0)));
    const cats = [...byCat].sort((a, b) => b[1] - a[1]);

    ctx.body.innerHTML = `
        <div class="kpis">
            <div class="kpi"><small>Costs</small><span class="v">${eur(monthTotal)}</span><span class="d">${repeat.length ? `${eur(cost.repeating)} every month${cost.oneOff ? ` + ${eur(cost.oneOff)} recorded` : ''}` : `${plural(monthExp.length, 'entry', 'entries')} in ${esc(shortMonth(exp.month))}`}</span></div>
            <div class="kpi"><small>Gross profit</small><span class="v">${eur(gp)}</span><span class="d">sales after cost of goods, net of VAT</span></div>
            <div class="kpi"><small>Net profit</small><span class="v" style="${known && gp - monthTotal < 0 ? 'color:var(--bad)' : ''}">${known ? eur(gp - monthTotal) : '–'}</span><span class="d">${known ? 'gross profit minus what the shop costs to run' : 'add what the shop costs to run to see it'}</span></div>
            <div class="kpi"><small>Break even</small><span class="v">${known && monthTotal ? eur(monthTotal / Math.max(0.05, g.net ? (g.costedNet - g.cost) / g.net : 0.4)) : '–'}</span><span class="d">${known && monthTotal ? `of sales a month at ${Math.round(100 * (g.net ? (g.costedNet - g.cost) / g.net : 0.4))}% margin · ${gp >= monthTotal ? 'reached' : eur(monthTotal - gp) + ' of profit short'}` : 'sales needed to cover the costs'}</span></div>
        </div>
        <div class="cols">
            <section class="panel" aria-labelledby="ex-h">
                <h2 class="panel-title" id="ex-h">${esc(monthName(exp.month))}<span>${eur(monthTotal)}</span></h2>
                ${cats.length > 1 ? `<div class="stackbar" style="margin-bottom:8px">${cats.map(([c, v], i) => `<i style="flex:${v};background:${CAT_COLORS[i % 8]}" title="${esc(catLabel(c))}: ${eur(v)}"></i>`).join('')}</div>
                    <div class="legend" style="margin-bottom:10px">${cats.map(([c, v], i) => `<span><i style="background:${CAT_COLORS[i % 8]}"></i>${esc(catLabel(c))} <b>${eur(v)}</b></span>`).join('')}</div>` : ''}
                ${repeat.length ? `<div class="lines">${repeat.map(r => `
                    <div class="line"><div><b>${esc(r.description || catLabel(r.category))}</b><span>${esc(catLabel(r.category))} · <span class="chip">every month</span>${r.fromMonth ? ` since ${esc(r.fromMonth)}` : ''}</span></div>
                        <span class="n">€${money2(r.amount)}</span></div>`).join('')}</div>` : ''}
                ${monthExp.length ? `<div class="lines">${monthExp.map(e => `
                    <div class="line"><div><b>${esc(e.description || catLabel(e.category))}</b><span>${esc(catLabel(e.category))} · ${esc(day(expTime(e)))}</span></div>
                        <span class="n" style="display:flex;gap:6px;align-items:center;justify-content:flex-end">€${money2(e.amount)}<button class="btn ghost small" type="button" data-del="${esc(e._id)}" aria-label="Delete this expense">${icon('delete')}</button></span></div>`).join('')}</div>`
                : repeat.length ? '' : `<p class="empty">Nothing recorded for this month. Rent, salaries and the like repeat every month – put them under “Every month” once and every month counts them by itself.${template.length ? ` Or copy ${esc(shortMonth(prevMonths[0]))}'s entries.` : ''}</p>`}
            </section>
            <section class="panel" aria-labelledby="pl-h">
                <h2 class="panel-title" id="pl-h">Profit after expenses, last 12 months</h2>
                <div class="table-wrap" style="border:0"><table class="dt"><thead><tr><th>Month</th><th class="n">Gross profit</th><th class="n">Expenses</th><th class="n">Net</th></tr></thead>
                <tbody id="pl-body">${rows.map(r => `<tr data-k="${r.k}"${r.k === exp.month ? ' class="sel"' : ''}><td>${esc(new Date(r.k).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }))}${r.net && r.costedShare < 0.8 ? ' <span class="chip warn" title="Part of this month’s sales have no cost price">partly costed</span>' : ''}</td>
                    <td class="n">${r.net ? eur(r.gp) : '<span class="muted">no sales</span>'}</td><td class="n">${r.hasExp ? eur(r.e) : '<span class="muted">not recorded</span>'}</td>
                    <td class="n">${r.hasExp ? `<b style="color:${r.gp - r.e < 0 ? 'var(--bad)' : 'var(--ok)'}">${eur(r.gp - r.e)}</b>` : '–'}</td></tr>`).join('')}</tbody></table></div>
                <p class="chart-note" style="margin-top:8px">Net is shown only for months whose costs are known: a month with none would otherwise look like pure profit. Costs entered under “Every month” count for every month they cover. Click a month to open it.</p>
            </section>
        </div>`;
    ctx.body.querySelector('#pl-body').addEventListener('click', e => { const tr = e.target.closest('[data-k]'); if (tr) { exp.month = Number(tr.dataset.k); renderExpenses(ctx); } });
    ctx.body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
        const e = m.expenses.find(x => x._id === b.dataset.del);
        const ok = await openModal({ title: 'Delete this expense?', confirmLabel: 'Delete', body: `<p>${esc(e.description || catLabel(e.category))}, €${money2(e.amount)} on ${esc(day(expTime(e)))}.</p>` });
        if (!ok) return;
        try { await deleteDoc(doc(db, 'expenses', e._id)); toast('Expense deleted'); await ctx.reload(); }
        catch (x) { toast(`Couldn't delete: ${x.message}`, { bad: true }); }
    }));
}

async function expenseDialog(ctx) {
    const today = ymd(Date.now()), d = new Date(exp.month);
    // Past months default to their last day; the current month to today.
    const def = exp.month === monthStartOf(Date.now()) ? today : ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime());
    const ok = await openModal({
        title: 'New expense', confirmLabel: 'Save expense', confirmClass: 'money',
        body: `<div class="form-grid">
            <label class="fld">Category<select id="ex-cat">${CATEGORIES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>
            <label class="fld">Amount (€)<input id="ex-amount" type="number" min="0.01" step="0.01"></label>
            <label class="fld wide">What for<input id="ex-desc" placeholder="e.g. Shop rent, warehouse, salary"></label>
            <label class="fld">Date<input id="ex-date" type="date" value="${def}" max="${today}"></label></div>`,
        validate: w => !(Number(w.querySelector('#ex-amount').value) > 0) ? 'Enter the amount.' : !w.querySelector('#ex-date').value ? 'Pick the date.' : ''
    });
    if (!ok) return;
    const v = id => ok.querySelector(id).value.trim();
    try {
        await addDoc(collection(db, 'expenses'), { category: v('#ex-cat'), amount: r2(Number(v('#ex-amount'))), date: v('#ex-date'), description: v('#ex-desc'), createdAt: new Date().toISOString() });
        toast(`€${money2(Number(v('#ex-amount')))} expense saved`); await ctx.reload();
    } catch (x) { toast(`Couldn't save: ${x.message}`, { bad: true }); }
}

async function copyExpenses(ctx, template) {
    const day1 = ymd(exp.month);
    const ok = await openModal({
        title: `Copy costs into ${monthName(exp.month)}`, confirmLabel: 'Add selected', confirmClass: 'money',
        body: `<p>Tick the ones that repeat and adjust any amount. Each is dated the 1st of the month.</p>
            <div class="lines">${template.map((e, i) => `<label class="line" style="grid-template-columns:auto minmax(0,1fr) 110px;align-items:center;cursor:pointer">
                <input type="checkbox" data-i="${i}" checked style="accent-color:var(--violet)"><div><b>${esc(e.description || catLabel(e.category))}</b><span>${esc(catLabel(e.category))}</span></div>
                <input class="inp" type="number" min="0.01" step="0.01" data-a="${i}" value="${Number(e.amount) || ''}" aria-label="Amount"></label>`).join('')}</div>`,
        validate: w => w.querySelector('[data-i]:checked') ? '' : 'Tick at least one.'
    });
    if (!ok) return;
    const batch = writeBatch(db); let n = 0, total = 0;
    template.forEach((e, i) => {
        if (!ok.querySelector(`[data-i="${i}"]`).checked) return;
        const amount = r2(Number(ok.querySelector(`[data-a="${i}"]`).value) || 0);
        if (!(amount > 0)) return;
        batch.set(doc(collection(db, 'expenses')), { category: e.category || 'Other', amount, date: day1, description: e.description || '', createdAt: new Date().toISOString() });
        n++; total += amount;
    });
    try { await batch.commit(); toast(`${plural(n, 'expense', 'expenses')} added, ${eur(total)}`); await ctx.reload(); }
    catch (x) { toast(`Couldn't save: ${x.message}`, { bad: true }); }
}

// What the shop costs to run every month, entered once. Deliberately plain: a name, an amount,
// a category, and the month it started - a cost that ends gets an end month rather than being
// deleted, so past months keep counting it.
async function recurringDialog(ctx) {
    const m = ctx.model;
    const thisKey = monthKeyOf(ctx.a.now);
    const draw = () => {
        const list = (m.recurring || []).slice().sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
        const live = list.filter(r => !r.toMonth || r.toMonth >= thisKey);
        const total = live.reduce((a, r) => a + (Number(r.amount) || 0), 0);
        return `
            <p class="empty" style="margin:0 0 10px">Rent, salaries, the accountant, internet – whatever the shop pays every month whether it sells anything or not. Entered here once, counted in every month.</p>
            <div class="kv"><div><small>Every month</small><b>${eur(total)}</b></div>
                <div><small>Entries</small><b>${int(live.length)}</b></div>
                <div><small>A year</small><b>${eur(total * 12)}</b></div></div>
            ${list.length ? `<div class="lines" id="rc-list">${list.map(r => {
                const ended = r.toMonth && r.toMonth < thisKey;
                return `<div class="line"${ended ? ' style="opacity:.55"' : ''}><div><b>${esc(r.description || catLabel(r.category))}</b>
                    <span>${esc(catLabel(r.category))}${r.fromMonth ? ` · since ${esc(r.fromMonth)}` : ''}${r.toMonth ? ` · until ${esc(r.toMonth)}` : ''}</span></div>
                    <span class="n" style="display:flex;gap:6px;align-items:center;justify-content:flex-end">€${money2(r.amount)}
                        ${ended ? '' : `<button class="btn ghost small" type="button" data-stop="${esc(r._id)}" title="It has stopped">${icon('event_busy')}</button>`}
                        <button class="btn ghost small" type="button" data-rm="${esc(r._id)}" title="Remove it completely" style="color:var(--bad)">${icon('delete')}</button></span></div>`;
            }).join('')}</div>` : '<p class="empty">Nothing yet.</p>'}
            <form class="form-grid" id="rc-form" style="margin-top:12px" novalidate>
                <label class="fld wide">What is it<input id="rc-name" placeholder="Rent, salaries, accountant…" autocomplete="off"></label>
                <label class="fld">Every month (€)<input id="rc-amt" type="number" min="0" step="0.01"></label>
                <label class="fld">Category<select id="rc-cat">${CATEGORIES.map(c => `<option value="${esc(c[0])}">${esc(c[1])}</option>`).join('')}</select></label>
                <label class="fld">Paying it since<input id="rc-from" type="month" value="${esc(thisKey)}"></label>
                <p class="err wide" id="rc-err" hidden></p>
            </form>`;
    };
    const { el, close } = openDrawer({ title: 'What the shop costs every month', sub: 'Counted in every month, without retyping', body: draw(),
        foot: `<button class="btn primary" type="button" id="rc-add">${icon('add')}Add it</button><span class="muted" style="margin-left:auto">Close when you are done</span>` });

    const refresh = async () => { await ctx.reload(); close(); recurringDialog(ctx); };
    el.querySelector('#rc-add').addEventListener('click', async () => {
        const err = el.querySelector('#rc-err');
        const name = el.querySelector('#rc-name').value.trim();
        const amount = Number(el.querySelector('#rc-amt').value) || 0;
        if (!name || !(amount > 0)) { err.textContent = 'A name and an amount, please.'; err.hidden = false; return; }
        try {
            await addDoc(collection(db, 'recurringCosts'), { description: name, amount: Math.round(amount * 100) / 100, category: el.querySelector('#rc-cat').value,
                fromMonth: el.querySelector('#rc-from').value || thisKey, toMonth: null, createdAt: Timestamp.now() });
            toast(`${name} counted every month`);
            await refresh();
        } catch (x) { err.textContent = `Couldn't save it: ${x.message}`; err.hidden = false; }
    });
    el.addEventListener('click', async e => {
        const stop = e.target.closest('[data-stop]'), rm = e.target.closest('[data-rm]');
        if (!stop && !rm) return;
        const id = (stop || rm).dataset[stop ? 'stop' : 'rm'];
        const r = (m.recurring || []).find(x => x._id === id);
        if (stop) {
            const ok = await openModal({ title: `Stop ${r.description}?`, confirmLabel: 'It has stopped',
                body: `<p>It stops counting from next month. Months up to ${esc(monthName(ctx.a.now))} keep it, because the shop paid it then.</p>` });
            if (!ok) return;
            try { await updateDoc(doc(db, 'recurringCosts', id), { toMonth: thisKey }); toast(`${r.description} stops after ${monthName(ctx.a.now)}`); await refresh(); }
            catch (x) { toast(`Couldn't save: ${x.message}`, { bad: true }); }
            return;
        }
        const ok = await openModal({ title: `Remove ${r.description}?`, confirmLabel: 'Remove', confirmClass: 'money',
            body: `<p>It disappears from every month, past ones included – their profit goes up by €${money2(r.amount)} each. If the shop simply stopped paying it, use “it has stopped” instead.</p>` });
        if (!ok) return;
        try { await deleteDoc(doc(db, 'recurringCosts', id)); toast(`${r.description} removed`); await refresh(); }
        catch (x) { toast(`Couldn't remove: ${x.message}`, { bad: true }); }
    });
}

// ================================================================== you owe (suppliers)

// Classic shape, also written by Receive delivery: creditors/{id} {name}, invoices/{id}
// {invoiceNumber, totalAmount, date, timestamp, remainingBalance, paid, dueDate?}, payments/{id}
// {invoiceId, invoiceNumber, amount, timestamp}. A payment updates the invoice and adds the payment
// record in one transaction. (The classic page read `remainingBalance || totalAmount`, so an invoice
// paid down to 0 showed as fully owed; here 0 means paid.)
const cBal = inv => (inv.remainingBalance === undefined || inv.remainingBalance === null || inv.remainingBalance === '' || !Number.isFinite(Number(inv.remainingBalance)))
    ? r2(Number(inv.totalAmount) || 0) : r2(Number(inv.remainingBalance));
const dueOf = inv => toMs(inv.dueDate);
const openSupplierInvoices = m => m.creditors.reduce((n, c) => n + c.invoices.filter(i => cBal(i) > 0.005).length, 0);

function renderYouOwe(ctx) {
    const now = ctx.a.now;
    const sups = ctx.model.creditors.map(c => {
        const open = c.invoices.filter(i => cBal(i) > 0.005);
        const due = open.map(dueOf).filter(t => !isNaN(t));
        return { c, open, owed: open.reduce((a, i) => a + cBal(i), 0), total: c.invoices.reduce((a, i) => a + (Number(i.totalAmount) || 0), 0),
            paid: c.payments.reduce((a, p) => a + (Number(p.amount) || 0), 0), nextDue: due.length ? Math.min(...due) : null };
    }).sort((a, b) => (a.nextDue ?? Infinity) - (b.nextDue ?? Infinity) || b.owed - a.owed);
    const openAll = sups.flatMap(s => s.open);
    const owedTotal = sups.reduce((a, s) => a + s.owed, 0);
    const overdue = openAll.filter(i => dueOf(i) < now);
    const in30 = openAll.filter(i => dueOf(i) >= now && dueOf(i) < now + 30 * DAY);
    ctx.setSub(`${eur(owedTotal, 2)} to pay suppliers on ${plural(openAll.length, 'invoice', 'invoices')}`);
    const actions = ctx.setActions(`<button class="btn primary" type="button" id="new-sup">${icon('add')}Supplier invoice</button>`);
    actions.querySelector('#new-sup').addEventListener('click', () => supplierInvoiceDialog(ctx, null));
    const shown = sups.filter(s => s.owed > 0.005 || owed.showPaid);
    ctx.body.innerHTML = `
        <div class="kpis">
            <div class="kpi"><small>You owe</small><span class="v">${eur(owedTotal)}</span><span class="d">${plural(sups.filter(s => s.owed > 0.005).length, 'supplier', 'suppliers')}</span></div>
            <div class="kpi"><small>Overdue</small><span class="v" style="${overdue.length ? 'color:var(--bad)' : ''}">${eur(overdue.reduce((a, i) => a + cBal(i), 0))}</span><span class="d">${plural(overdue.length, 'invoice', 'invoices')} past the due date</span></div>
            <div class="kpi"><small>Due in 30 days</small><span class="v">${eur(in30.reduce((a, i) => a + cBal(i), 0))}</span><span class="d">${plural(in30.length, 'invoice', 'invoices')}</span></div>
            <div class="kpi"><small>Paid to suppliers</small><span class="v">${eur(sups.reduce((a, s) => a + s.paid, 0))}</span><span class="d">all recorded payments</span></div>
        </div>
        <div class="toolbar"><div class="filters"><button class="filter" type="button" id="yo-paid" aria-pressed="${owed.showPaid}">Include paid off<span class="n">${int(sups.filter(s => s.owed <= 0.005).length)}</span></button></div></div>
        ${shown.length ? `<div class="table-wrap"><table class="dt"><thead><tr><th>Supplier</th><th class="n">Open invoices</th><th class="n">Still to pay</th><th class="n">Next due</th><th>Paid off</th></tr></thead>
        <tbody id="yo-body">${shown.map(s => `<tr data-id="${esc(s.c._id)}" tabindex="0"><td class="name"><b>${esc(s.c.name || '?')}</b><span>${esc(s.open.map(i => i.invoiceNumber).filter(Boolean).join(', '))}</span></td>
            <td class="n">${int(s.open.length)}</td><td class="n">${s.owed > 0.005 ? `<b>${eur(s.owed, 2)}</b>` : '<span class="chip ok">paid</span>'}</td>
            <td class="n ${s.nextDue !== null && s.nextDue < now ? 'zero' : 'muted'}">${s.nextDue !== null ? esc(day(s.nextDue)) + (s.nextDue < now ? ' · overdue' : '') : '–'}</td>
            <td>${s.total > 0 ? `<span class="cover"><span class="bar"><i style="width:${Math.min(100, 100 * (s.total - s.owed) / s.total).toFixed(1)}%;background:var(--ok)"></i></span><span class="muted">${Math.round(100 * (s.total - s.owed) / s.total)}%</span></span>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="all-clear">${icon('check_circle')}<div><b>You don't owe any supplier.</b><br><span>Record an invoice you'll pay later with “Supplier invoice”, or when receiving a delivery.</span></div></div>`}`;
    ctx.body.querySelector('#yo-paid').addEventListener('click', () => { owed.showPaid = !owed.showPaid; renderYouOwe(ctx); });
    const tb = ctx.body.querySelector('#yo-body');
    if (tb) {
        const open = e => { const tr = e.target.closest('tr[data-id]'); if (tr) supplierDrawer(ctx, tr.dataset.id); };
        tb.addEventListener('click', open);
        tb.addEventListener('keydown', e => { if (e.key === 'Enter') open(e); });
    }
}

function supplierDrawer(ctx, id) {
    const c = ctx.model.creditors.find(x => x._id === id); if (!c) return;
    const invoices = c.invoices.slice().sort((a, b) => cBal(b) - cBal(a) || (toMs(b.date) || 0) - (toMs(a.date) || 0));
    const owedNow = invoices.reduce((a, i) => a + Math.max(0, cBal(i)), 0);
    const { el, close } = openDrawer({
        title: esc(c.name || '?'), sub: `${eur(owedNow, 2)} still to pay`,
        body: invoices.map(inv => {
            const bal = cBal(inv), due = dueOf(inv);
            const pays = c.payments.filter(p => p.invoiceId === inv._id).sort((a, b) => toMs(a.timestamp) - toMs(b.timestamp));
            return `<section class="panel" style="padding:12px 14px">
                <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><b style="font-weight:500">Invoice ${esc(inv.invoiceNumber || '–')}</b>
                    ${bal > 0.005 ? `<span class="chip ${due < Date.now() ? 'bad' : 'warn'}">€${money2(bal)} to pay${!isNaN(due) ? ' by ' + esc(day(due)) : ''}</span>` : '<span class="chip ok">paid</span>'}
                    <span class="muted" style="margin-left:auto;font-family:var(--mono);font-size:12.5px">€${money2(inv.totalAmount)}</span></div>
                ${inv.date ? `<p class="empty" style="margin:2px 0 0">Dated ${esc(day(toMs(inv.date)))} ${new Date(toMs(inv.date)).getFullYear()}</p>` : ''}
                <div class="lines">${pays.map(p => `<div class="line"><div><b>Paid €${money2(p.amount)}</b><span>${esc(day(toMs(p.timestamp)))} ${new Date(toMs(p.timestamp)).getFullYear()}</span></div>
                    <button class="btn ghost small" type="button" data-undo="${esc(p._id)}" aria-label="Remove this payment">${icon('undo')}</button></div>`).join('')}</div>
                ${bal > 0.005 ? `<div style="display:flex;gap:8px;margin-top:8px"><button class="btn small primary" type="button" data-pay="${esc(inv._id)}">${icon('payments')}Record payment</button>
                    <button class="btn small" type="button" data-full="${esc(inv._id)}">Paid in full</button></div>` : ''}</section>`;
        }).join('') || '<p class="empty">No invoices yet.</p>',
        foot: `<button class="btn" type="button" id="sd-new">${icon('add')}New invoice from ${esc(c.name)}</button>`
    });
    el.querySelector('#sd-new').addEventListener('click', () => { close(); supplierInvoiceDialog(ctx, c); });
    el.addEventListener('click', async e => {
        const pay = e.target.closest('[data-pay]'), full = e.target.closest('[data-full]'), undo = e.target.closest('[data-undo]');
        if (pay || full) {
            const inv = invoices.find(i => i._id === (pay ? pay.dataset.pay : full.dataset.full));
            let amount = cBal(inv), date = ymd(Date.now());
            if (pay) {
                const ok = await openModal({ title: `Payment to ${c.name}`, confirmLabel: 'Record payment', confirmClass: 'money',
                    body: `<p>Invoice ${esc(inv.invoiceNumber || '')}: €${money2(cBal(inv))} left to pay.</p><div class="form-grid"><label class="fld">Amount (€)<input id="sp-amount" type="number" min="0.01" step="0.01"></label>
                        <label class="fld">Date<input id="sp-date" type="date" value="${date}"></label></div>`,
                    validate: w => { const a = Number(w.querySelector('#sp-amount').value); return !(a > 0) ? 'Enter the amount paid.' : a > cBal(inv) + 0.005 ? `That's more than the €${money2(cBal(inv))} left.` : ''; } });
                if (!ok) return;
                amount = Number(ok.querySelector('#sp-amount').value); date = ok.querySelector('#sp-date').value;
            } else if (!await openModal({ title: `Mark invoice ${inv.invoiceNumber || ''} as paid?`, confirmLabel: `Record €${money2(amount)}`, confirmClass: 'money',
                body: `<p>Records a payment of €${money2(amount)} to ${esc(c.name)} today.</p>` })) return;
            await supplierPayment(ctx, c, inv, r2(amount), date, close);
        }
        if (undo) {
            const p = c.payments.find(x => x._id === undo.dataset.undo);
            if (!await openModal({ title: 'Remove this payment?', confirmLabel: 'Remove payment', body: `<p>€${money2(p.amount)} to ${esc(c.name)} will no longer count, and the invoice balance goes back up. Use this for a payment recorded by mistake.</p>` })) return;
            try {
                await runTransaction(db, async tx => {
                    const invRef = doc(db, 'creditors', c._id, 'invoices', p.invoiceId), payRef = doc(db, 'creditors', c._id, 'payments', p._id);
                    const iv = await tx.get(invRef), pv = await tx.get(payRef);
                    if (!pv.exists()) throw new Error('That payment was already removed.');
                    if (iv.exists()) { const bal = r2(cBal(iv.data()) + (Number(pv.data().amount) || 0)); tx.update(invRef, { remainingBalance: bal, paid: bal <= 0.005 }); }
                    tx.delete(payRef);
                });
                toast('Payment removed'); close(); await ctx.reload(); supplierDrawer(ctx, c._id);
            } catch (x) { toast(`Couldn't save: ${x.message}`, { bad: true }); }
        }
    });
}

async function supplierPayment(ctx, c, inv, amount, dateStr, close) {
    const timestamp = dateStr && dateStr !== ymd(Date.now()) ? new Date(dateStr + 'T12:00').getTime() : Date.now();
    try {
        await runTransaction(db, async tx => {
            const invRef = doc(db, 'creditors', c._id, 'invoices', inv._id);
            const snap = await tx.get(invRef);
            if (!snap.exists()) throw new Error('This invoice no longer exists.');
            const bal = cBal(snap.data());
            if (amount > bal + 0.005) throw new Error(`Only €${money2(bal)} is left on this invoice (a payment may have been recorded meanwhile).`);
            const left = r2(bal - amount);
            tx.update(invRef, { remainingBalance: left, paid: left <= 0.005 });
            tx.set(doc(collection(db, 'creditors', c._id, 'payments')), { invoiceId: inv._id, invoiceNumber: inv.invoiceNumber || '', amount, timestamp });
        });
        toast(`€${money2(amount)} paid to ${c.name} recorded`); close(); await ctx.reload(); supplierDrawer(ctx, c._id);
    } catch (x) { toast(`Couldn't save: ${x.message}`, { bad: true }); }
}

async function supplierInvoiceDialog(ctx, c) {
    const names = [...new Set([...ctx.model.creditors.map(x => x.name), ...ctx.model.products.map(p => p.producer)].filter(Boolean))].sort();
    const today = ymd(Date.now());
    const ok = await openModal({
        title: 'Supplier invoice to pay', confirmLabel: 'Save invoice',
        body: `<div class="form-grid">
            <label class="fld wide">Supplier<input id="si-sup" list="si-names" value="${esc(c ? c.name : '')}" autocomplete="off"></label>
            <datalist id="si-names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
            <label class="fld">Invoice number<input id="si-num"></label>
            <label class="fld">Amount to pay (€)<input id="si-amount" type="number" min="0.01" step="0.01"></label>
            <label class="fld">Invoice date<input id="si-date" type="date" value="${today}"></label>
            <label class="fld">Due date<input id="si-due" type="date"><span class="hint">Optional. Shows as overdue after this day.</span></label></div>`,
        validate: w => !w.querySelector('#si-sup').value.trim() ? 'Enter the supplier.' : !w.querySelector('#si-num').value.trim() ? 'Enter the invoice number.' : !(Number(w.querySelector('#si-amount').value) > 0) ? 'Enter the amount.' : ''
    });
    if (!ok) return;
    const v = id => ok.querySelector(id).value.trim();
    try {
        const id = await addSupplierInvoice({ supplier: v('#si-sup'), invoiceNumber: v('#si-num'), totalAmount: Number(v('#si-amount')), date: v('#si-date'), dueDate: v('#si-due'), creditors: ctx.model.creditors });
        toast(`€${money2(Number(v('#si-amount')))} owed to ${v('#si-sup')} recorded`); await ctx.reload(); supplierDrawer(ctx, id);
    } catch (x) { toast(`Couldn't save: ${x.message}`, { bad: true }); }
}

// ================================================================== next 30 days

// What the next 30 days probably look like, from things with real dates or a stated basis.
// (Replaces the classic Forecasts cash-flow chart, which gave every debt without a due date an
// invented payment date "in 7 days".)
function renderOutlook(ctx) {
    const m = ctx.model, now = ctx.a.now, end = now + 30 * DAY;
    // In: sales at the pace of the last 90 days (what customers actually pay, VAT included).
    const since = now - 90 * DAY;
    const sold90 = m.sales.filter(s => !s.isReturn && saleTime(s) >= since).reduce((a, s) => a + (Number(s.total) || 0), 0)
        + m.orders.filter(o => !['Returned', 'Cancelled'].includes(o.status) && toMs(o.timestamp || o.orderDate) >= since).reduce((a, o) => a + (Number(o.total) || Number(o.price) || 0), 0)
        - (m.returns || []).filter(r => returnTime(r) >= since).reduce((a, r) => a + returnTotal(r), 0);
    const salesIn = sold90 / 3;
    const owedToYou = m.debts.reduce((a, d) => a + Math.max(0, balanceOf(d)), 0);
    // Out: supplier invoices by due date.
    const sup = m.creditors.flatMap(c => c.invoices.filter(i => cBal(i) > 0.005).map(i => ({ c, i, due: dueOf(i) })));
    const dueSoon = sup.filter(x => !isNaN(x.due) && x.due < end), noDue = sup.filter(x => isNaN(x.due));
    // Out: what the shop costs to run. The costs entered as repeating are the honest answer;
    // failing that, fall back to the latest month that has anything recorded.
    const repeating = recurringFor(m, monthStartOf(now)).reduce((a, r) => a + (Number(r.amount) || 0), 0);
    const months = [...new Set(m.expenses.map(e => monthStartOf(expTime(e))).filter(t => !isNaN(t)))].sort((a, b) => b - a);
    const lastMonth = months[0];
    const running = repeating || (lastMonth ? m.expenses.filter(e => monthStartOf(expTime(e)) === lastMonth).reduce((a, e) => a + (Number(e.amount) || 0), 0) : 0);
    // Out: deliveries the yearly plan puts in this month and next (net cost; VAT on imports is extra).
    const plan = (m.predictions || []).find(p => p.version === 2 && Number(p.year) === new Date(now).getFullYear());
    const mo = new Date(now).getMonth();
    const planned = plan ? plan.products.reduce((a, r) => a + ((r.orders[mo] || 0) + (mo < 11 ? r.orders[mo + 1] || 0 : 0)) * (Number(r.unitCost) || 0), 0) / 2 : 0;
    const outKnown = dueSoon.reduce((a, x) => a + cBal(x.i), 0);
    const net = salesIn - outKnown - running - planned;

    ctx.setSub(`Until ${day(end)}: a rough guide, built only from dated invoices and stated estimates`);
    ctx.setActions('');
    const row = (label, how, value, sign, href) => `<div class="line"><div><b>${href ? `<a href="${href}" style="text-decoration:none">${esc(label)}</a>` : esc(label)}</b><span>${how}</span></div><span class="n" style="color:${sign > 0 ? 'var(--ok)' : sign < 0 ? 'var(--bad)' : 'var(--muted)'}">${sign > 0 ? '+' : sign < 0 ? '−' : ''}${eur(Math.abs(value))}</span></div>`;
    ctx.body.innerHTML = `
        <div class="cols">
            <section class="panel">
                <h2 class="panel-title">Next 30 days<span style="color:${net >= 0 ? 'var(--ok)' : 'var(--bad)'}">${net >= 0 ? '+' : '−'}${eur(Math.abs(net))}</span></h2>
                <div class="lines">
                    ${row('Sales', `if the next 30 days sell like the last 90 (${eur(sold90)} in 90 days, VAT included)`, salesIn, 1, 'insights.html')}
                    ${row('Supplier invoices due', dueSoon.length ? `${plural(dueSoon.length, 'invoice', 'invoices')} due by ${esc(day(end))}${dueSoon.some(x => x.due < now) ? ', some already overdue' : ''}` : 'none with a due date in this period', outKnown, outKnown ? -1 : 0, 'money.html#owe')}
                    ${row('Running costs', lastMonth ? `estimated from ${esc(new Date(lastMonth).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }))}, the latest month with expenses recorded` : 'no expenses recorded yet', running, running ? -1 : 0, 'money.html#expenses')}
                    ${row('Planned deliveries', plan ? `half of what the ${plan.year} plan puts in ${esc(new Date(now).toLocaleDateString('en-GB', { month: 'long' }))} and next month, at net cost` : 'no plan for this year', planned, planned ? -1 : 0, 'stock.html#plan')}
                </div>
                <p class="chart-note" style="margin-top:10px">Not a bank balance: it only shows what the app knows. Customer debts have no due dates, so they are listed separately rather than guessed.</p>
            </section>
            <section class="panel" style="display:grid;gap:12px">
                <h2 class="panel-title" style="margin:0">Without a date</h2>
                <div class="lines">
                    ${row('Owed to you', 'could come in any time; debts have no due dates', owedToYou, owedToYou ? 1 : 0, 'money.html#owed')}
                    ${row('Supplier invoices without a due date', noDue.length ? `${plural(noDue.length, 'invoice', 'invoices')}: add a due date to place them in time` : 'none', noDue.reduce((a, x) => a + cBal(x.i), 0), noDue.length ? -1 : 0, 'money.html#owe')}
                </div>
                ${dueSoon.length ? `<div><h3 style="margin:6px 0">Due by ${esc(day(end))}</h3><div class="lines">${dueSoon.sort((a, b) => a.due - b.due).map(x => `<div class="line"><div><b>${esc(x.c.name)} · ${esc(x.i.invoiceNumber || '')}</b><span>${x.due < now ? '<span style="color:var(--bad)">overdue since ' + esc(day(x.due)) + '</span>' : 'due ' + esc(day(x.due))}</span></div><span class="n">€${money2(cBal(x.i))}</span></div>`).join('')}</div></div>` : ''}
            </section>
        </div>`;
}

// ================================================================== boot

bootWorkspace({
    active: 'money', title: 'Money', defaultTab: 'owed',
    tabs: [
        { id: 'owed', label: 'Owed to you', icon: 'account_balance_wallet', render: renderOwed, count: a => a.owed.length },
        { id: 'owe', label: 'You owe', icon: 'local_shipping', render: renderYouOwe, count: (a, m) => openSupplierInvoices(m) },
        { id: 'expenses', label: 'Expenses', icon: 'payments', render: renderExpenses },
        { id: 'outlook', label: 'Next 30 days', icon: 'date_range', render: renderOutlook }
    ]
});
