// Money workspace: who owes you, and recording what they pay.
//
// Debts keep the classic shape so the classic pages still read them: debtors/{id} {name} and
// debtors/{id}/invoices/{id} {number, totalAmount, remainingBalance, items, payments[{amount,
// timestamp}]}. New debts also get createdAt (the classic ones have no date). Payments are
// recorded in a transaction that re-reads the invoice and recomputes the balance from the
// payments themselves, so two people paying in at once can't lose one.
import { bootWorkspace } from './workspace.js';
import { db, collection, doc, addDoc, runTransaction, Timestamp } from './firebase.js';
import { esc, eur, int, icon, plural, day, fold, money2, toast, openDrawer, openModal } from './ui.js';
import { toMs, customerKey, saleInvoiceNumber, shortInvoice } from './data.js';

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

// ================================================================== boot

bootWorkspace({
    active: 'money', title: 'Money', defaultTab: 'owed',
    tabs: [
        { id: 'owed', label: 'Owed to you', icon: 'account_balance_wallet', render: renderOwed, count: a => a.owed.length },
        { label: 'Expenses', icon: 'payments', href: 'expenses.html' }
    ]
});
