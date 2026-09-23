// Sell > Online orders: Instagram, phone and web orders, from first message to paid.
//
// Same onlineOrders records as the classic page and the Instagram webhook: {clientName, telephone,
// address, items[{name, quantity, price, id}], shippingFee, price (items total), status, timestamp,
// activityLog[{status, timestamp}], source}. Statuses are unchanged: New Lead (chatbot), Ordered,
// Pending, Processing, Shipped, Delivered, Paid, Returned, Cancelled.
//
// Stock, fixed: the classic page never took stock when an order was created, yet put stock back
// when one was cancelled - so every cancellation inflated stock. New orders now take their items
// off stock in the same batch and are marked stockDeducted; only those give stock back when
// cancelled or returned. Older orders offer "Take from stock" instead of guessing.
import { db, collection, doc, writeBatch, increment, updateDoc, deleteDoc } from './firebase.js';
import { esc, eur, int, icon, plural, day, fold, money2, dateTime, toast, openDrawer, openModal } from './ui.js';
import { DAY, WALKIN, orderTime, orderTotal, rankProducts, customerDirectory, toMs } from './data.js';
import { warrantyDialog } from './warranty.js';

const r2 = n => Math.round(n * 100) / 100;
export const ORDER_STATUSES = ['New Lead', 'Ordered', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Paid', 'Returned', 'Cancelled'];
const CLOSED = new Set(['Paid', 'Returned', 'Cancelled']);
const GIVES_BACK = new Set(['Returned', 'Cancelled']);
const CHIP = { 'New Lead': 'vio', Ordered: '', Pending: '', Processing: 'warn', Shipped: 'warn', Delivered: 'warn', Paid: 'ok', Returned: 'bad', Cancelled: 'bad' };
const SOURCES = ['Instagram', 'Phone', 'Web', 'Walk-in pickup', 'Other'];
const sourceOf = o => o.source === 'Instagram Chatbot' ? 'Instagram bot' : o.source === 'imported' ? 'Imported' : o.source || '–';
const who = o => o.clientName || o.customerName || '';
const phoneOf = o => o.telephone || o.phoneNumber || '';
const addressOf = o => [o.address || o.deliveryAddress, o.city].filter(Boolean).join(', ');
const itemsTotal = items => r2(items.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0));
const productFor = (products, it) => (it.id && products.find(p => p._id === it.id)) || products.find(p => p.name === it.name) || null;

const on = { filter: 'open', q: '' };

export function renderOnline(ctx) {
    const orders = ctx.model.orders.slice().sort((a, b) => (orderTime(b) || 0) - (orderTime(a) || 0));
    const open = orders.filter(o => !CLOSED.has(o.status || 'Ordered'));
    const last = orders.find(o => !isNaN(orderTime(o)));
    const since = last ? Math.floor((ctx.a.now - orderTime(last)) / DAY) : null;
    ctx.setSub(`${plural(open.length, 'order', 'orders')} open · ${last ? `last order ${since === 0 ? 'today' : plural(since, 'day', 'days') + ' ago'}` : 'no orders yet'}`);
    const actions = ctx.setActions(`<button class="btn primary" type="button" id="new-order">${icon('add')}New order</button>`);
    actions.querySelector('#new-order').addEventListener('click', () => orderDrawer(ctx, null));

    const FILTERS = [['open', 'Open', o => !CLOSED.has(o.status || 'Ordered')], ...ORDER_STATUSES.map(s => [s, s, o => (o.status || 'Ordered') === s]), ['all', 'All', () => true]];
    const month = new Date(ctx.a.now); month.setDate(1); month.setHours(0, 0, 0, 0);
    const thisMonth = orders.filter(o => orderTime(o) >= month.getTime() && !GIVES_BACK.has(o.status));
    ctx.body.innerHTML = `
        ${since !== null && since > 30 ? `<div class="panel" style="padding:12px 16px;display:flex;gap:12px;align-items:center">${icon('info')}<span class="muted" style="flex:1">No online order has been recorded for ${plural(since, 'day', 'days')}. If Instagram sales are still happening, record them here with “New order” so they count in stock, customers and Insights.</span></div>` : ''}
        <div class="kpis">
            <div class="kpi"><small>Open orders</small><span class="v">${int(open.length)}</span><span class="d">${eur(open.reduce((a, o) => a + orderTotal(o), 0))} not yet paid</span></div>
            <div class="kpi"><small>To ship</small><span class="v">${int(open.filter(o => ['Ordered', 'Pending', 'Processing'].includes(o.status || 'Ordered')).length)}</span><span class="d">ordered or being prepared</span></div>
            <div class="kpi"><small>This month</small><span class="v">${eur(thisMonth.reduce((a, o) => a + orderTotal(o), 0))}</span><span class="d">${plural(thisMonth.length, 'order', 'orders')}</span></div>
            <div class="kpi"><small>Chatbot leads</small><span class="v">${int(orders.filter(o => o.status === 'New Lead').length)}</span><span class="d">waiting to become orders</span></div>
        </div>
        <div class="toolbar">
            <label class="field-search">${icon('search')}<input id="on-q" type="search" placeholder="Customer, phone, city or product" value="${esc(on.q)}" aria-label="Search orders"></label>
            <div class="filters" id="on-f"></div>
        </div>
        <div class="table-wrap" style="max-height:calc(100vh - 380px)"><table class="dt"><thead><tr><th>Date</th><th>Customer</th><th>Items</th><th class="n">Total</th><th>Source</th><th>Status</th></tr></thead><tbody id="on-body"></tbody></table></div>`;
    const draw = () => {
        const terms = fold(on.q).trim().split(/\s+/).filter(Boolean);
        const searched = orders.filter(o => { const hay = fold(`${who(o)} ${phoneOf(o)} ${addressOf(o)} ${(o.items || []).map(i => i.name).join(' ')}`); return terms.every(t => hay.includes(t)); });
        ctx.body.querySelector('#on-f').innerHTML = FILTERS.filter(([id, , t]) => id === 'open' || id === 'all' || searched.some(t))
            .map(([id, label, t]) => `<button class="filter" type="button" data-f="${esc(id)}" aria-pressed="${id === on.filter}">${esc(label)}<span class="n">${int(searched.filter(t).length)}</span></button>`).join('');
        const f = FILTERS.find(x => x[0] === on.filter) || FILTERS[0];
        ctx.body.querySelector('#on-body').innerHTML = searched.filter(f[2]).slice(0, 300).map(o => `
            <tr data-id="${esc(o._id)}" tabindex="0">
                <td class="muted" style="white-space:nowrap">${isNaN(orderTime(o)) ? '–' : esc(day(orderTime(o))) + ' ' + new Date(orderTime(o)).getFullYear()}</td>
                <td class="name"><b>${esc(who(o) || '?')}</b><span>${esc([phoneOf(o), o.city].filter(Boolean).join(' · '))}</span></td>
                <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((o.items || []).map(i => `${Number(i.quantity) > 1 ? i.quantity + ' × ' : ''}${i.name}`).join(', ') || o.productName || '–')}</td>
                <td class="n">${eur(orderTotal(o), 2)}</td>
                <td class="muted">${esc(sourceOf(o))}</td>
                <td><span class="chip ${CHIP[o.status || 'Ordered'] ?? ''}">${esc(o.status || 'Ordered')}</span></td></tr>`).join('')
            || '<tr><td colspan="6" class="muted" style="padding:18px">No orders match.</td></tr>';
    };
    draw();
    ctx.body.querySelector('#on-q').addEventListener('input', e => { on.q = e.target.value; draw(); });
    ctx.body.querySelector('#on-f').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { on.filter = b.dataset.f; draw(); } });
    const openRow = e => { const tr = e.target.closest('tr[data-id]'); if (tr) orderDetail(ctx, ctx.model.orders.find(o => o._id === tr.dataset.id)); };
    ctx.body.querySelector('#on-body').addEventListener('click', openRow);
    ctx.body.querySelector('#on-body').addEventListener('keydown', e => { if (e.key === 'Enter') openRow(e); });
}

// ------------------------------------------------------------------ one order

export function orderDetail(ctx, o) {
    const status = o.status || 'Ordered';
    const log = (o.activityLog || []).slice().sort((a, b) => toMs(b.timestamp) - toMs(a.timestamp));
    const products = ctx.model.products;
    const { el, close } = openDrawer({
        title: esc(who(o) || 'Online order'),
        sub: `${esc(sourceOf(o))} · ${isNaN(orderTime(o)) ? '' : esc(dateTime(orderTime(o)))}`,
        body: `
            <div class="kv">
                <div><small>Total</small><b>€${money2(orderTotal(o))}</b></div>
                <div><small>Shipping</small><b>${Number(o.shippingFee) ? '€' + money2(o.shippingFee) : '–'}</b></div>
                <div><small>Stock</small><b>${o.stockDeducted ? '<span class="chip ok">taken</span>' : '<span class="chip">not taken</span>'}</b></div>
            </div>
            <label class="fld">Status<select id="od-status">${ORDER_STATUSES.map(s => `<option${s === status ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
                <span class="hint" id="od-hint">${o.stockDeducted ? 'Returned or Cancelled puts the items back in stock.' : 'This order never took stock, so changing its status doesn’t change stock.'}</span></label>
            <section><h3>Customer</h3><p style="margin:0">${esc(who(o) || '–')}${phoneOf(o) ? ` · <a href="tel:${esc(phoneOf(o).replace(/\s/g, ''))}">${esc(phoneOf(o))}</a>` : ''}</p>
                <p class="empty" style="margin:2px 0 0">${esc(addressOf(o) || 'No address')}</p></section>
            <section><h3>Items</h3><div class="lines">${(o.items || []).map(i => { const p = productFor(products, i); return `
                <div class="line"><div><b>${Number(i.quantity) > 1 ? int(i.quantity) + ' × ' : ''}${esc(i.name)}</b><span>${p ? `${int(Number(p.stock) || 0)} in stock` : 'not in the catalogue'}${i.serialNumber ? ' · S/N ' + esc(i.serialNumber) : ''}</span></div><span class="n">€${money2((Number(i.price) || 0) * (Number(i.quantity) || 1))}</span></div>`; }).join('') || '<p class="empty">No items recorded.</p>'}</div></section>
            ${log.length ? `<section><h3>History</h3><div class="lines">${log.map(x => `<div class="line"><div><b>${esc(x.status)}</b><span>${isNaN(toMs(x.timestamp)) ? '' : esc(dateTime(toMs(x.timestamp)))}</span></div></div>`).join('')}</div></section>` : ''}`,
        foot: `<button class="btn primary" type="button" id="od-save">${icon('check')}Save status</button>
            ${!o.stockDeducted && !CLOSED.has(status) && (o.items || []).length ? `<button class="btn" type="button" id="od-take">${icon('inventory_2')}Take from stock</button>` : ''}
            <button class="btn" type="button" id="od-edit">${icon('edit')}Edit</button>
            <button class="btn" type="button" id="od-warranty">${icon('verified')}Warranty</button>
            <button class="btn ghost" type="button" id="od-del" style="margin-left:auto;color:var(--bad)" aria-label="Delete order">${icon('delete')}</button>`
    });

    el.querySelector('#od-save').addEventListener('click', async () => {
        const next = el.querySelector('#od-status').value;
        if (next === status) return close();
        const giveBack = o.stockDeducted && GIVES_BACK.has(next) && !GIVES_BACK.has(status);
        const takeAgain = o.stockDeducted && GIVES_BACK.has(status) && !GIVES_BACK.has(next);
        if (giveBack || takeAgain) {
            const ok = await openModal({ title: `Mark as ${next}?`, confirmLabel: `Mark as ${next}`,
                body: `<p>${giveBack ? 'The items go back into stock' : 'The items are taken from stock again'}: ${(o.items || []).map(i => `${int(i.quantity || 1)} × ${esc(i.name)}`).join(', ')}.</p>` });
            if (!ok) return;
        }
        const batch = writeBatch(db);
        const logNow = [{ status: next, timestamp: new Date() }, ...(o.activityLog && o.activityLog.length ? o.activityLog : [{ status: 'Order Placed', timestamp: o.timestamp || new Date() }])];
        batch.update(doc(db, 'onlineOrders', o._id), { status: next, activityLog: logNow });
        if (giveBack || takeAgain) (o.items || []).forEach(i => { const p = productFor(products, i); if (p) batch.update(doc(db, 'products', p._id), { stock: increment((giveBack ? 1 : -1) * (Number(i.quantity) || 1)) }); });
        try { await batch.commit(); toast(`Order marked ${next}${giveBack ? ', stock restored' : takeAgain ? ', stock taken' : ''}`); close(); await ctx.reload(); }
        catch (x) { toast(`Couldn't save: ${x.message}`, { bad: true }); }
    });
    const take = el.querySelector('#od-take');
    if (take) take.addEventListener('click', async () => {
        const missing = (o.items || []).filter(i => !productFor(products, i));
        const ok = await openModal({ title: 'Take these items from stock?', confirmLabel: 'Take from stock', confirmClass: 'money',
            body: `<p>Online orders recorded before this screen never lowered stock. This takes ${(o.items || []).filter(i => productFor(products, i)).map(i => `${int(i.quantity || 1)} × ${esc(i.name)}`).join(', ')} off stock now.${missing.length ? ` Not in the catalogue, so skipped: ${missing.map(i => esc(i.name)).join(', ')}.` : ''}</p>` });
        if (!ok) return;
        const batch = writeBatch(db);
        (o.items || []).forEach(i => { const p = productFor(products, i); if (p) batch.update(doc(db, 'products', p._id), { stock: increment(-(Number(i.quantity) || 1)) }); });
        batch.update(doc(db, 'onlineOrders', o._id), { stockDeducted: true });
        try { await batch.commit(); toast('Stock updated for this order'); close(); await ctx.reload(); }
        catch (x) { toast(`Couldn't save: ${x.message}`, { bad: true }); }
    });
    el.querySelector('#od-edit').addEventListener('click', () => { close(); orderDrawer(ctx, o); });
    el.querySelector('#od-warranty').addEventListener('click', () => warrantyDialog(ctx, o, { customer: who(o), saleType: 'onlineOrder', coll: 'onlineOrders' }));
    el.querySelector('#od-del').addEventListener('click', async () => {
        const back = o.stockDeducted && !GIVES_BACK.has(status);
        const ok = await openModal({ title: 'Delete this order?', confirmLabel: 'Delete order', confirmClass: 'money',
            body: `<p>${esc(who(o) || 'This order')}, €${money2(orderTotal(o))}. ${back ? 'Its items go back into stock. ' : ''}It disappears from sales, customers and Insights. This can't be undone; for a cancelled order, use the Cancelled status instead.</p>` });
        if (!ok) return;
        const batch = writeBatch(db);
        batch.delete(doc(db, 'onlineOrders', o._id));
        if (back) (o.items || []).forEach(i => { const p = productFor(products, i); if (p) batch.update(doc(db, 'products', p._id), { stock: increment(Number(i.quantity) || 1) }); });
        try { await batch.commit(); toast('Order deleted'); close(); await ctx.reload(); }
        catch (x) { toast(`Couldn't delete: ${x.message}`, { bad: true }); }
    });
}

// ------------------------------------------------------------------ new or edited order

// A new order can arrive with items already chosen - Sell > Instagram opens it that way from a
// question somebody asked the chatbot.
export function openNewOrder(ctx, prefill) { orderDrawer(ctx, null, prefill); }

function orderDrawer(ctx, existing, prefill) {
    const isNew = !existing;
    const o = existing || { clientName: '', telephone: '', address: '', items: (prefill && prefill.items) || [], shippingFee: 0, source: (prefill && prefill.source) || 'Instagram' };
    const products = ctx.model.products;
    let items = (o.items || []).map(i => ({ ...i }));
    const dir = ctx.model._directory || (ctx.model._directory = customerDirectory(ctx.model));
    const { el, close } = openDrawer({
        title: isNew ? 'New online order' : `Edit order · ${esc(who(o))}`,
        sub: isNew ? 'The items are taken from stock when you save.' : o.stockDeducted ? 'Changing items adjusts stock by the difference.' : 'This order never took stock; editing it doesn’t either.',
        body: `<form class="form-grid" id="no" novalidate>
                <label class="fld wide">Customer<input id="no-name" list="no-names" value="${esc(who(o))}" autocomplete="off"></label>
                <datalist id="no-names">${dir.filter(e => e.count > 0 || e.profile).sort((a, b) => (b.last || 0) - (a.last || 0)).slice(0, 600).map(e => `<option value="${esc(e.name)}">`).join('')}</datalist>
                <label class="fld">Phone<input id="no-phone" type="tel" value="${esc(phoneOf(o))}" placeholder="+355 6…"></label>
                <label class="fld">Came from<select id="no-src">${SOURCES.map(s => `<option${(o.source || 'Instagram') === s ? ' selected' : ''}>${s}</option>`).join('')}${o.source && !SOURCES.includes(o.source) ? `<option selected>${esc(o.source)}</option>` : ''}</select></label>
                <label class="fld wide">Delivery address<input id="no-addr" value="${esc(o.address || o.deliveryAddress || '')}"></label>
            </form>
            <section><h3>Items</h3>
                <label class="field-search" style="max-width:none">${icon('search')}<input id="no-q" type="search" placeholder="Add a product: type its name or code" aria-label="Search products"></label>
                <div class="results" id="no-res" style="max-height:200px;overflow:auto"></div>
                <div id="no-items" style="margin-top:8px"></div></section>
            <div class="form-grid"><label class="fld">Shipping fee (€)<input id="no-ship" type="number" min="0" step="0.01" value="${Number(o.shippingFee) || ''}"></label></div>
            <p class="err" id="no-err" hidden></p>`,
        foot: `<button class="btn primary" type="button" id="no-save">${icon('check')}${isNew ? 'Save order' : 'Save changes'}</button><span class="muted" id="no-total" style="margin-left:auto;font-family:var(--mono)"></span>`
    });
    const name = el.querySelector('#no-name'), phone = el.querySelector('#no-phone'), addr = el.querySelector('#no-addr');
    name.addEventListener('change', () => { const e = dir.find(x => fold(x.name) === fold(name.value.trim())); if (e) { if (!phone.value) phone.value = e.phone || ''; if (!addr.value) addr.value = e.address || ''; } });
    const drawItems = () => {
        el.querySelector('#no-items').innerHTML = items.map((i, n) => { const p = productFor(products, i); return `<div class="cart-line"><div><b>${esc(i.name)}</b><span class="sub">${p ? `${int(Number(p.stock) || 0)} in stock` : 'not in the catalogue'}</span></div>
            <span class="qty"><button type="button" data-d="${n}" aria-label="One less">−</button><span>${int(i.quantity)}</span><button type="button" data-u="${n}" aria-label="One more">+</button></span>
            <input class="inp" type="number" min="0" step="0.01" data-p="${n}" value="${Number(i.price) || 0}" style="width:90px;text-align:right" aria-label="Price each, incl. VAT"></div>`; }).join('') || '<p class="empty">No items yet.</p>';
        el.querySelector('#no-total').textContent = `Items €${money2(itemsTotal(items))}`;
    };
    drawItems();
    const q = el.querySelector('#no-q'), res = el.querySelector('#no-res');
    q.addEventListener('input', () => {
        const list = q.value.trim() ? rankProducts(products, q.value, ctx.a.soldUnits, 6) : [];
        res.innerHTML = list.map(p => `<div class="res" data-id="${esc(p._id)}"><div><b>${esc(p.name)}</b><span class="sub">${esc(p.code || '')}</span></div><span class="stk ${Number(p.stock) > 0 ? '' : 'zero'}">${int(Number(p.stock) || 0)} in stock</span><span class="pr">€${money2(p.price)}</span></div>`).join('');
    });
    res.addEventListener('click', e => {
        const r = e.target.closest('[data-id]'); if (!r) return;
        const p = products.find(x => x._id === r.dataset.id);
        const have = items.find(i => i.id === p._id);
        if (have) have.quantity = (Number(have.quantity) || 1) + 1; else items.push({ name: p.name, quantity: 1, price: Number(p.price) || 0, id: p._id });
        q.value = ''; res.innerHTML = ''; q.focus(); drawItems();
    });
    el.querySelector('#no-items').addEventListener('click', e => {
        const d = e.target.closest('[data-d]'), u = e.target.closest('[data-u]');
        if (u) items[Number(u.dataset.u)].quantity = (Number(items[Number(u.dataset.u)].quantity) || 1) + 1;
        if (d) { const i = Number(d.dataset.d); items[i].quantity = (Number(items[i].quantity) || 1) - 1; if (items[i].quantity <= 0) items.splice(i, 1); }
        if (u || d) drawItems();
    });
    el.querySelector('#no-items').addEventListener('change', e => { const p = e.target.closest('[data-p]'); if (p) { items[Number(p.dataset.p)].price = r2(Number(p.value) || 0); drawItems(); } });

    el.querySelector('#no-save').addEventListener('click', async () => {
        const err = el.querySelector('#no-err');
        const fail = m => { err.textContent = m; err.hidden = false; };
        if (!name.value.trim() || WALKIN.test(name.value)) return fail('Enter the customer’s name.');
        if (!items.length) return fail('Add at least one item.');
        const short = items.map(i => ({ i, p: productFor(products, i) })).filter(x => x.p && isNew && (Number(x.p.stock) || 0) < x.i.quantity);
        if (short.length && !await openModal({ title: 'Not enough in stock', confirmLabel: 'Save anyway',
            body: `<p>${short.map(x => `${esc(x.p.name)}: ${int(Number(x.p.stock) || 0)} in stock, ${int(x.i.quantity)} ordered`).join('; ')}. Stock will go below zero until it's corrected.</p>` })) return;
        const data = { clientName: name.value.trim(), telephone: phone.value.trim(), address: addr.value.trim(), items, shippingFee: r2(Number(el.querySelector('#no-ship').value) || 0),
            price: itemsTotal(items), source: el.querySelector('#no-src').value };
        const batch = writeBatch(db);
        if (isNew) {
            const now = new Date();
            batch.set(doc(collection(db, 'onlineOrders')), { ...data, status: 'Ordered', timestamp: now, activityLog: [{ status: 'Ordered', timestamp: now }], stockDeducted: true });
            items.forEach(i => { const p = productFor(products, i); if (p) batch.update(doc(db, 'products', p._id), { stock: increment(-(Number(i.quantity) || 1)) }); });
        } else {
            batch.update(doc(db, 'onlineOrders', o._id), data);
            // Stock follows the difference in quantities, only for orders that took stock.
            if (o.stockDeducted && !GIVES_BACK.has(o.status)) {
                const delta = new Map();
                (o.items || []).forEach(i => { const p = productFor(products, i); if (p) delta.set(p._id, (delta.get(p._id) || 0) + (Number(i.quantity) || 1)); });
                items.forEach(i => { const p = productFor(products, i); if (p) delta.set(p._id, (delta.get(p._id) || 0) - (Number(i.quantity) || 1)); });
                delta.forEach((d, id) => { if (d) batch.update(doc(db, 'products', id), { stock: increment(d) }); });
            }
        }
        const btn = el.querySelector('#no-save'); btn.disabled = true;
        try { await batch.commit(); toast(isNew ? `Order saved for ${data.clientName}, stock updated` : 'Order updated'); close(); await ctx.reload(); }
        catch (x) { btn.disabled = false; fail(`Couldn't save: ${x.message}`); }
    });
}
