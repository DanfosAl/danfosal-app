// Stock > Order list: what's been ordered (or is about to be) and what has arrived.
//
// Same toOrder records as the classic page and the Reorder tab: {name, quantity, supplier,
// quantityReceived, smartSuggestion, urgency, daysUntilStockout, reason, estimatedCost, addedAt}.
// Receiving a line raises the product's stock in the same batch, as the classic page did.
// Deliveries with an invoice go through Receive delivery, which ticks these lines off by itself.
import { db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, increment, writeBatch } from './firebase.js';
import { esc, eur, int, icon, plural, day, fold, toast, openModal } from './ui.js';
import { DAY, SALES_WINDOW_DAYS, productNetCost, rankProducts } from './data.js';

const STALE_DAYS = 60;   // an order line waiting this long has probably been forgotten
const ol = { filter: 'waiting' };

export async function loadOrderLines() {
    return (await getDocs(collection(db, 'toOrder'))).docs.map(d => ({ _id: d.id, ...d.data() }));
}
export const outstanding = l => Math.max(0, (Number(l.quantity) || 0) - (Number(l.quantityReceived) || 0));
export const productForLine = (products, l) => products.find(p => p.name === l.name) || products.find(p => fold(p.name) === fold(l.name)) || null;

export async function renderOrderList(ctx) {
    ctx.setSub('Loading the order list…');
    ctx.body.innerHTML = '<div class="skeleton" style="height:260px"></div>';
    let lines;
    try { lines = await loadOrderLines(); }
    catch (e) { ctx.body.innerHTML = `<div class="error-box">${icon('error')}<div><b>Couldn't load the order list.</b><br><span>${esc(e.message)}</span></div></div>`; return; }
    if (ctx.tab !== 'orders') return;   // the owner moved on while it loaded

    const now = ctx.a.now, products = ctx.model.products;
    const rows = lines.map(l => {
        const p = productForLine(products, l), wait = outstanding(l), net = p ? productNetCost(p) : null;
        return { l, p, wait, net, value: wait * (net || 0), age: l.addedAt ? Math.floor((now - Number(l.addedAt)) / DAY) : null };
    });
    const waiting = rows.filter(r => r.wait > 0);
    const FILTERS = [['waiting', 'Waiting', r => r.wait > 0], ['stale', `Waiting over ${STALE_DAYS} days`, r => r.wait > 0 && r.age > STALE_DAYS], ['done', 'Received', r => r.wait === 0], ['all', 'All', () => true]];
    const f = FILTERS.find(x => x[0] === ol.filter) || FILTERS[0];
    const shown = rows.filter(f[2]).sort((a, b) => fold(a.l.supplier).localeCompare(fold(b.l.supplier)) || (b.age || 0) - (a.age || 0));
    const bySupplier = new Map();
    // "Karcher" and "Kärcher" are one supplier: group by the folded name, show the first spelling.
    const label = new Map();
    shown.forEach(r => {
        const name = r.l.supplier || r.p?.producer || 'No supplier', k = fold(name).replace(/[^a-z0-9]/g, '');
        if (!label.has(k)) label.set(k, name);
        const key = label.get(k); if (!bySupplier.has(key)) bySupplier.set(key, []); bySupplier.get(key).push(r);
    });

    ctx.setSub(`${plural(waiting.length, 'line', 'lines')} waiting · ${eur(waiting.reduce((a, r) => a + r.value, 0))} at cost`);
    const actions = ctx.setActions(`<button class="btn" type="button" id="ol-copy"${waiting.length ? '' : ' disabled'}>${icon('content_copy')}Copy order</button>
        <a class="btn" href="#receive">${icon('move_to_inbox')}Receive delivery</a>
        <button class="btn primary" type="button" id="ol-add">${icon('add')}Add product</button>`);
    actions.querySelector('#ol-add').addEventListener('click', () => addLineDialog(ctx));
    actions.querySelector('#ol-copy').addEventListener('click', () => copyOrder(waiting));

    const stale = waiting.filter(r => r.age > STALE_DAYS);
    ctx.body.innerHTML = `
        ${stale.length ? `<div class="panel" style="padding:12px 16px;display:flex;gap:12px;align-items:center;border-color:#5b3a1c">${icon('schedule')}<div style="flex:1"><b style="font-weight:500">${plural(stale.length, 'line has', 'lines have')} been waiting over ${STALE_DAYS} days.</b>
            <span class="muted">Oldest added ${esc(day(Math.min(...stale.map(r => Number(r.l.addedAt)))))} ${new Date(Math.min(...stale.map(r => Number(r.l.addedAt)))).getFullYear()}. If they arrived, receive them; if they were never ordered, remove them so the list stays trustworthy.</span></div>
            <button class="btn small" type="button" data-f="stale">Show them</button></div>` : ''}
        <div class="toolbar"><div class="filters" id="ol-f">${FILTERS.map(([id, label, test]) => `<button class="filter${id === 'stale' ? ' alert' : ''}" type="button" data-f="${id}" aria-pressed="${id === ol.filter}">${esc(label)}<span class="n">${int(rows.filter(test).length)}</span></button>`).join('')}</div></div>
        <div id="ol-list" style="display:flex;flex-direction:column;gap:16px">${shown.length ? [...bySupplier].map(([sup, list]) => `
            <section class="table-wrap"><table class="dt"><thead><tr><th>${esc(sup)} · ${plural(list.length, 'line', 'lines')}</th><th class="n">Ordered</th><th class="n">Received</th><th class="n">Waiting</th><th class="n">In stock</th><th class="n">Sold ${SALES_WINDOW_DAYS}d</th><th class="n">Added</th><th class="n">At cost</th><th></th></tr></thead>
            <tbody>${list.map(r => `<tr data-id="${esc(r.l._id)}" style="cursor:default">
                <td class="name"><b>${esc(r.l.name)}</b><span>${esc([r.p?.code, r.l.smartSuggestion ? 'suggested by Reorder' : '', r.p ? '' : 'not in the catalogue'].filter(Boolean).join(' · '))}</span></td>
                <td class="n">${int(r.l.quantity)}</td><td class="n muted">${int(r.l.quantityReceived || 0)}</td>
                <td class="n">${r.wait ? `<b>${int(r.wait)}</b>` : '<span class="chip ok">done</span>'}</td>
                <td class="n ${r.p && Number(r.p.stock) <= 0 ? 'zero' : ''}">${r.p ? int(Number(r.p.stock) || 0) : '–'}</td>
                <td class="n muted">${r.p ? int(ctx.a.soldUnits[r.p._id] || 0) : '–'}</td>
                <td class="n ${r.age > STALE_DAYS && r.wait ? 'zero' : 'muted'}">${r.l.addedAt ? esc(day(Number(r.l.addedAt))) : '–'}</td>
                <td class="n">${r.value ? eur(r.value) : r.wait ? '<span class="chip warn">no cost</span>' : ''}</td>
                <td class="n" style="white-space:nowrap">${r.wait ? `<button class="btn small" type="button" data-rcv="${esc(r.l._id)}">${icon('move_to_inbox')}Receive</button>` : ''}
                    <button class="btn ghost small" type="button" data-edit="${esc(r.l._id)}" aria-label="Change quantity">${icon('edit')}</button>
                    <button class="btn ghost small" type="button" data-del="${esc(r.l._id)}" aria-label="Remove from the list">${icon('delete')}</button></td></tr>`).join('')}</tbody></table></section>`).join('')
        : `<div class="all-clear">${icon('check_circle')}<div><b>${ol.filter === 'waiting' ? 'Nothing is waiting to arrive.' : 'No lines here.'}</b><br><span>Add products from Reorder, or with “Add product”.</span></div></div>`}</div>`;

    ctx.body.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { ol.filter = b.dataset.f; renderOrderList(ctx); }));
    // The list lives in its own element, re-created on every render, so its listener can't pile up.
    ctx.body.querySelector('#ol-list').addEventListener('click', async e => {
        const btn = e.target.closest('[data-rcv],[data-edit],[data-del]'); if (!btn) return;
        const r = rows.find(x => x.l._id === (btn.dataset.rcv || btn.dataset.edit || btn.dataset.del)); if (!r) return;
        if (btn.dataset.rcv) await receiveLine(ctx, r);
        else if (btn.dataset.edit) await editLine(ctx, r);
        else await removeLine(ctx, r);
    });
}

async function receiveLine(ctx, r) {
    const ok = await openModal({
        title: `Receive ${r.l.name}`, confirmLabel: 'Receive', confirmClass: 'money',
        body: `<p>${int(r.wait)} still waiting. ${r.p ? `Stock goes from ${int(Number(r.p.stock) || 0)} up by what you enter.` : 'This name isn’t in the catalogue, so only the list is updated; stock can’t be raised.'}</p>
            <label class="fld">Units that arrived<input id="rv-q" type="number" min="1" step="1" value="${r.wait}"></label>
            <p class="empty" style="margin:0">Have the supplier invoice? Receive delivery records the cost price too.</p>`,
        validate: w => { const q = Number(w.querySelector('#rv-q').value); return !(q >= 1 && Number.isInteger(q)) ? 'Enter a whole number of units.' : q > r.wait ? `Only ${r.wait} are waiting. Change the ordered quantity first if more came.` : ''; }
    });
    if (!ok) return;
    const q = Number(ok.querySelector('#rv-q').value);
    const batch = writeBatch(db);
    batch.update(doc(db, 'toOrder', r.l._id), { quantityReceived: increment(q) });
    if (r.p) batch.update(doc(db, 'products', r.p._id), { stock: increment(q), lastRestockDate: Date.now() });
    try { await batch.commit(); toast(`${q} × ${r.l.name} received${r.p ? ', stock updated' : ''}`); await ctx.reload(); }
    catch (x) { toast(`Couldn't save: ${x.message}`, { bad: true }); renderOrderList(ctx); }
}

async function editLine(ctx, r) {
    const got = Number(r.l.quantityReceived) || 0;
    const ok = await openModal({
        title: `Ordered quantity: ${r.l.name}`, confirmLabel: 'Save',
        body: `<label class="fld">Units ordered<input id="ed-q" type="number" min="${Math.max(1, got)}" step="1" value="${Number(r.l.quantity) || 1}"></label>${got ? `<p class="empty" style="margin:0">${got} already received.</p>` : ''}`,
        validate: w => { const q = Number(w.querySelector('#ed-q').value); return !(Number.isInteger(q) && q >= Math.max(1, got)) ? `Enter a whole number, at least ${Math.max(1, got)}.` : ''; }
    });
    if (!ok) return;
    try { await updateDoc(doc(db, 'toOrder', r.l._id), { quantity: Number(ok.querySelector('#ed-q').value) }); toast('Quantity changed'); renderOrderList(ctx); }
    catch (x) { toast(`Couldn't save: ${x.message}`, { bad: true }); renderOrderList(ctx); }
}

async function removeLine(ctx, r) {
    const ok = await openModal({ title: `Remove ${r.l.name}?`, confirmLabel: 'Remove',
        body: `<p>${r.wait ? `${int(r.wait)} units are still waiting. Remove it only if it won't arrive (never ordered, or cancelled).` : 'It has fully arrived.'} Stock isn't changed.</p>` });
    if (!ok) return;
    try { await deleteDoc(doc(db, 'toOrder', r.l._id)); toast(`${r.l.name} removed from the list`); renderOrderList(ctx); }
    catch (x) { toast(`Couldn't remove: ${x.message}`, { bad: true }); renderOrderList(ctx); }
}

async function addLineDialog(ctx) {
    let chosen = null;
    const modalPromise = openModal({
        title: 'Add to the order list', confirmLabel: 'Add',
        body: `<label class="field-search" style="max-width:none">${icon('search')}<input id="al-q" type="search" placeholder="Search the catalogue" aria-label="Search products"></label>
            <div class="results" id="al-res" role="listbox" style="max-height:240px;overflow:auto"></div>
            <label class="fld">Units to order<input id="al-n" type="number" min="1" step="1" value="1"></label>`,
        validate: w => !chosen ? 'Pick a product from the list.' : !(Number(w.querySelector('#al-n').value) >= 1) ? 'Enter how many.' : ''
    });
    const m = [...document.querySelectorAll('.modal-backdrop')].pop();
    const res = m.querySelector('#al-res'), q = m.querySelector('#al-q');
    const draw = list => { res.innerHTML = list.map(p => `<div class="res" role="option" data-id="${esc(p._id)}" aria-selected="${chosen && chosen._id === p._id}"><div><b>${esc(p.name)}</b><span class="sub">${esc(p.code || '')}</span></div><span class="stk ${Number(p.stock) > 0 ? '' : 'zero'}">${int(Number(p.stock) || 0)} in stock</span><span class="pr">${int(ctx.a.soldUnits[p._id] || 0)} sold</span></div>`).join('') || '<p class="empty">Type to search.</p>'; };
    let shown = [];
    q.addEventListener('input', () => { shown = rankProducts(ctx.model.products, q.value, ctx.a.soldUnits, 8); draw(shown); });
    res.addEventListener('click', e => { const o = e.target.closest('[data-id]'); if (o) { chosen = ctx.model.products.find(p => p._id === o.dataset.id); draw(shown); } });
    draw([]);
    const ok = await modalPromise;
    if (!ok) return;
    const n = Math.round(Number(ok.querySelector('#al-n').value));
    try {
        await addDoc(collection(db, 'toOrder'), { name: chosen.name, quantity: n, supplier: chosen.producer || '', quantityReceived: 0, smartSuggestion: false,
            estimatedCost: Math.round(n * (productNetCost(chosen) || 0) * 100) / 100, addedAt: Date.now() });
        toast(`${n} × ${chosen.name} added`); ol.filter = 'waiting'; renderOrderList(ctx);
    } catch (x) { toast(`Couldn't add: ${x.message}`, { bad: true }); }
}

// Plain text for an email or a supplier portal: one block per supplier, code and quantity per line.
async function copyOrder(waiting) {
    const bySup = new Map();
    const label = new Map();
    waiting.forEach(r => {
        const name = r.l.supplier || r.p?.producer || 'Other', k = fold(name).replace(/[^a-z0-9]/g, '');
        if (!label.has(k)) label.set(k, name);
        const key = label.get(k); if (!bySup.has(key)) bySup.set(key, []); bySup.get(key).push(r);
    });
    const text = [...bySup].map(([sup, list]) => `${sup}\n` + list.map(r => `${r.p?.code ? r.p.code + '  ' : ''}${r.l.name}  x ${r.wait}`).join('\n')).join('\n\n');
    try { await navigator.clipboard.writeText(text); toast(`Order copied: ${plural(waiting.length, 'line', 'lines')}`); }
    catch { toast('Couldn’t reach the clipboard.', { bad: true }); }
}
