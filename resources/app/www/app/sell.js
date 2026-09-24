// Sell workspace: All sales, New sale (the till), Online orders and Import invoice.
//
// The till writes the same record as the classic Store Sales screen - items {name, price, cost,
// quantity, productId, image}, total, paymentMethod, notes, timestamp, type 'store', clientName -
// and decrements stock with increment(-qty). The difference: the sale and its stock changes go in
// one batch, so a sale can never be saved without its stock movement (or the other way round).
import { bootWorkspace } from './workspace.js';
import { warrantyDialog } from './warranty.js';
import { warrantyRemoveDialog } from './warrantyreturn.js';
import { renderOnline, orderDetail } from './online.js';
import { renderLeads } from './leads.js';
import { renderImport } from './importpdf.js';
import { db, collection, doc, writeBatch, increment, Timestamp, addDoc, updateDoc } from './firebase.js';
import { esc, eur, int, pct, icon, plural, day, fold, money2, dateTime, toast, openDrawer, openModal } from './ui.js';
import {
    VAT, WALKIN, saleTime, orderTime, orderTotal, saleSource, saleInvoiceNumber, shortInvoice,
    netRevenue, saleNetCost, lineNetCost, productNetCost, productIdOfLine, rankProducts, productNameIndex, returnTime, returnTotal, returnLines, customerDirectory, customerKey, realSerial, cardsForSale
} from './data.js';

const r2 = n => Math.round(n * 100) / 100;

// ================================================================== all sales

const PERIODS = [['today', 'Today'], ['7', '7 days'], ['30', '30 days'], ['month', 'This month'], ['all', 'All time']];
const SOURCES = ['EasyPOS', 'PDF', 'Till', 'Online', 'Import', 'Refund'];
const salesState = { period: '30', source: 'all', q: null };

function allRecords(model) {
    const sales = model.sales.map(s => {
        const cost = saleNetCost(s);
        const net = netRevenue(s);
        const inv = saleInvoiceNumber(s);
        const src = saleSource(s);
        return {
            kind: 'sale', id: s._id, rec: s, t: saleTime(s), src, total: Number(s.total) || 0,
            doc: inv ? `${s.type === 'easypos' ? 'Receipt' : 'Invoice'} ${shortInvoice(inv)}` : src === 'Till' ? 'Till sale' : src === 'Import' ? 'Imported sale' : 'Sale',
            who: s.clientName || s.customerName || '', items: s.items || [],
            margin: cost === null || !net ? null : (net - cost) / net, isReturn: !!s.isReturn
        };
    });
    const orders = model.orders.map(o => ({
        kind: 'order', id: o._id, rec: o, t: orderTime(o), src: 'Online', total: orderTotal(o),
        doc: 'Online order', who: o.clientName || o.customerName || '', items: o.items || [], margin: null, status: o.status
    }));
    // Money handed back. The till bridge writes these when it reads a credit note; the original
    // sale stays in the list as it was, so the refund is a row of its own, for a negative amount.
    const byName = productNameIndex(model.products);
    const refunds = (model.returns || []).map(r => ({
        kind: 'refund', id: r._id, rec: r, t: returnTime(r), src: 'Refund', total: -returnTotal(r),
        doc: r.type === 'cancellation' ? 'Cancelled sale' : 'Refund', who: r.customerName || '', margin: null,
        items: returnLines(r, byName).map(l => ({ name: l.product ? l.product.name : l.name, quantity: l.units, price: l.net * VAT / (l.units || 1) }))
    }));
    return sales.concat(orders, refunds).filter(r => !isNaN(r.t)).sort((a, b) => b.t - a.t);
}

function inPeriod(t, period, now) {
    if (period === 'all') return true;
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    if (period === 'today') return t >= start.getTime();
    if (period === 'month') return t >= new Date(start.getFullYear(), start.getMonth(), 1).getTime();
    return t >= now - Number(period) * 86400000;
}

function renderSales(ctx) {
    if (salesState.q === null) salesState.q = ctx.params.get('q') || '';
    if (salesState.q && !ctx._widened) { ctx._widened = true; salesState.period = 'all'; }   // opened from search: look everywhere
    const records = allRecords(ctx.model);
    ctx.setActions(`<a class="btn primary" href="#new">${icon('add')}New sale</a>`);
    ctx.body.innerHTML = `
        <div class="toolbar">
            <label class="field-search">${icon('search')}<input id="s-q" type="search" placeholder="Invoice number, customer or product" value="${esc(salesState.q)}" aria-label="Search sales"></label>
            <div class="seg" role="group" aria-label="Period" id="s-period">${PERIODS.map(([id, label]) => `<button type="button" data-p="${id}" aria-pressed="${id === salesState.period}">${label}</button>`).join('')}</div>
        </div>
        <div class="filters" id="s-src" role="group" aria-label="Source"></div>
        <div class="summary" id="s-sum"></div>
        <div class="table-wrap" style="max-height:calc(100vh - 340px)"><table class="dt"><thead><tr>
            <th>When</th><th>Document</th><th>Customer</th><th>Items</th><th>Source</th><th class="n">Total</th><th class="n">Margin</th></tr></thead>
            <tbody id="s-body"></tbody></table><div class="table-foot" id="s-foot"></div></div>`;

    const draw = () => {
        const now = Date.now();
        const terms = fold(salesState.q).trim().split(/\s+/).filter(Boolean);
        const base = records.filter(r => inPeriod(r.t, salesState.period, now)).filter(r => {
            if (!terms.length) return true;
            const hay = fold(`${r.doc} ${saleInvoiceNumber(r.rec)} ${r.who} ${r.items.map(i => i.name).join(' ')}`);
            return terms.every(t => hay.includes(t));
        });
        ctx.body.querySelector('#s-src').innerHTML = [['all', 'All']].concat(SOURCES.map(s => [s, s])).map(([id, label]) => {
            const n = id === 'all' ? base.length : base.filter(r => r.src === id).length;
            return (id === 'all' || n) ? `<button class="filter" type="button" data-s="${id}" aria-pressed="${id === salesState.source}">${label}<span class="n">${int(n)}</span></button>` : '';
        }).join('');
        const list = base.filter(r => salesState.source === 'all' || r.src === salesState.source);
        const revenue = list.reduce((a, r) => a + r.total, 0);
        const refunded = list.filter(r => r.kind === 'refund');
        const costed = list.filter(r => r.margin !== null && r.kind === 'sale');
        const costedNet = costed.reduce((a, r) => a + netRevenue(r.rec), 0);
        const costedCost = costed.reduce((a, r) => a + saleNetCost(r.rec), 0);
        ctx.setSub(`${plural(list.length - refunded.length, 'sale', 'sales')}${refunded.length ? ` · ${plural(refunded.length, 'refund', 'refunds')}` : ''} · ${eur(revenue)}`);
        ctx.body.querySelector('#s-sum').innerHTML = `<span>Revenue <b>${eur(revenue, 2)}</b>${refunded.length && refunded.length < list.length ? ` <small class="muted">after ${eur(-refunded.reduce((a, r) => a + r.total, 0))} refunded</small>` : ''}</span>
            <span>Gross margin <b>${costedNet ? Math.round(100 * (costedNet - costedCost) / costedNet) + '%' : '–'}</b></span>
            <span>Profit <b>${eur(costedNet - costedCost)}</b> on ${pct(costed.length, list.filter(r => r.kind === 'sale').length)} of sales with a known cost</span>`;
        const shown = list.slice(0, 400);
        ctx.body.querySelector('#s-body').innerHTML = shown.map(r => {
            const first = r.items[0];
            const more = r.items.length > 1 ? ` +${r.items.length - 1}` : '';
            return `<tr data-kind="${r.kind}" data-id="${esc(r.id)}" tabindex="0">
                <td class="muted" style="white-space:nowrap">${esc(dateTime(r.t))}</td>
                <td>${esc(r.doc)}${r.isReturn ? ' <span class="chip bad">return</span>' : ''}${r.kind === 'refund' ? ' <span class="chip bad">money back</span>' : ''}</td>
                <td>${r.who && !WALKIN.test(r.who) ? esc(r.who) : '<span class="muted">walk-in</span>'}</td>
                <td class="muted" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${first ? esc(`${Number(first.quantity) || 1} × ${first.name || '?'}`) + more : '–'}</td>
                <td><span class="chip">${esc(r.src)}</span></td>
                <td class="n"${r.total < 0 ? ' style="color:var(--bad)"' : ''}>${money2(r.total)}</td>
                <td class="n">${r.margin === null ? '<span class="muted">–</span>' : Math.round(r.margin * 100) + '%'}</td></tr>`;
        }).join('') || `<tr><td colspan="7" class="muted" style="padding:18px">No sales match.</td></tr>`;
        ctx.body.querySelector('#s-foot').textContent = list.length > shown.length ? `Showing the latest ${shown.length} of ${list.length}. Narrow the period or search to see older ones.` : 'Totals include VAT. Margin is net of VAT, on sales whose cost is known.';
    };
    draw();
    ctx.body.querySelector('#s-q').addEventListener('input', e => { salesState.q = e.target.value; draw(); });
    ctx.body.querySelector('#s-period').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; salesState.period = b.dataset.p; ctx.body.querySelectorAll('#s-period button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); });
    ctx.body.querySelector('#s-src').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) { salesState.source = b.dataset.s; draw(); } });
    const open = e => { const tr = e.target.closest('tr[data-id]'); if (tr) saleDrawer(ctx, records.find(r => r.id === tr.dataset.id && r.kind === tr.dataset.kind)); };
    ctx.body.querySelector('#s-body').addEventListener('click', open);
    ctx.body.querySelector('#s-body').addEventListener('keydown', e => { if (e.key === 'Enter') open(e); });
    if (salesState.q && !ctx._openedFromQuery) {       // opened from Ctrl K on one invoice: show it
        ctx._openedFromQuery = true;
        const hits = records.filter(r => fold(r.doc).includes(fold(salesState.q)));
        if (hits.length === 1) saleDrawer(ctx, hits[0]);
    }
}

function saleDrawer(ctx, r) {
    if (!r) return;
    if (r.kind === 'order') {
        orderDetail(ctx, r.rec);
        return;
    }
    if (r.kind === 'refund') { refundDrawer(ctx, r); return; }
    const s = r.rec;
    const net = netRevenue(s), cost = saleNetCost(s);
    const nipt = s.customerNipt || (s.easypos && s.easypos.customerNIPT) || '';
    const { el, close } = openDrawer({
        title: esc(r.doc), sub: esc(`${dateTime(r.t)} · ${r.src}${s.paymentMethod && s.paymentMethod !== 'unknown' ? ' · ' + s.paymentMethod : ''}`),
        body: `
            <div class="kv"><div><small>Total incl. VAT</small><b>€${money2(r.total)}</b></div>
                <div><small>Net</small><b>€${money2(net)}</b></div>
                <div><small>Margin</small><b>${cost === null ? 'unknown' : `€${money2(net - cost)} · ${Math.round(100 * (net - cost) / (net || 1))}%`}</b></div></div>
            <section><h3>Customer</h3><p style="margin:0">${r.who && !WALKIN.test(r.who) ? esc(r.who) : 'Walk-in'}${nipt ? ` <span class="chip">NIPT ${esc(nipt)}</span>` : ''}</p>
                ${s.customerAddress ? `<p class="empty" style="margin:4px 0 0">${esc(s.customerAddress)}</p>` : ''}</section>
            <section><h3>Items</h3><div class="lines">${r.items.map(i => {
                const c = lineNetCost(i); const q = Number(i.quantity) || 1;
                return `<div class="line"><div><b>${esc(i.name || '?')}</b><span>${int(q)} × €${money2(i.price)} · cost ${c === null ? '<span style="color:var(--warn)">unknown</span>' : i.isService ? 'service' : '€' + money2(c) + ' net'}${realSerial(i.serialNumber) ? ` · S/N ${esc(realSerial(i.serialNumber))}` : ''}</span></div>
                    <span class="n">€${money2((Number(i.price) || 0) * q)}</span></div>`;
            }).join('')}</div></section>`,
        foot: `<button class="btn" type="button" id="sd-warranty">${icon('verified')}Warranty card</button>
               <button class="btn ghost" type="button" id="sd-delete" style="margin-left:auto;color:var(--bad)">${icon('delete')}Delete sale</button>`
    });
    el.querySelector('#sd-warranty').addEventListener('click', () => warrantyDialog(ctx, s));
    el.querySelector('#sd-delete').addEventListener('click', async () => {
        const knownIds = new Set(ctx.model.products.map(p => p._id));
        const restock = r.items.map(i => ({ pid: productIdOfLine(i, knownIds), q: Number(i.quantity) || 1, name: i.name })).filter(x => x.pid);
        const ok = await openModal({
            title: `Delete ${r.doc}?`, confirmLabel: 'Delete sale', confirmClass: 'money',
            body: `<p>${restock.length ? `Stock goes back up: ${esc(restock.map(x => `${x.name} +${x.q}`).join(', '))}.` : 'No stock changes: none of its lines are linked to a product.'}${s.type === 'easypos' ? ' This is an EasyPOS receipt: the fiscal receipt itself is not affected.' : ''} This can't be undone.</p>`
        });
        if (!ok) return;
        const batch = writeBatch(db);
        restock.forEach(x => batch.update(doc(db, 'products', x.pid), { stock: increment(x.q) }));
        batch.delete(doc(db, 'storeSales', s._id));
        try { await batch.commit(); toast(`${r.doc} deleted${restock.length ? ', stock restored' : ''}`); close(); await ctx.reload(); }
        catch (e) { toast(`Couldn't delete: ${e.message}`, { bad: true }); }
    });
}

// A refund read off a credit note. Nothing to edit here: the till recorded it, the bridge put
// the goods back on the shelf, and every total on this screen already has the money taken off.
function refundDrawer(ctx, r) {
    const rec = r.rec, back = -r.total;
    // The sale this refund reverses may have been sold with a certificate; if so, say so here too.
    const sale = rec.linkedSaleId ? ctx.model.sales.find(s => s._id === rec.linkedSaleId) : null;
    const cards = sale ? cardsForSale(ctx.model, sale) : [];
    const { el } = openDrawer({
        title: esc(r.doc), sub: esc(`${dateTime(r.t)} · ${rec.reason || 'credit note'}`),
        body: `
            <div class="kv"><div><small>Given back</small><b style="color:var(--bad)">− €${money2(back)}</b></div>
                <div><small>Net</small><b>€${money2(back / VAT)}</b></div>
                <div><small>Customer</small><b>${rec.customerName && !WALKIN.test(rec.customerName) ? esc(rec.customerName) : 'Walk-in'}</b></div></div>
            <section><h3>Came back</h3>${r.items.length
                ? `<div class="lines">${r.items.map(i => `<div class="line"><div><b>${esc(i.name || '?')}</b><span>${int(i.quantity)} × €${money2(i.price)}</span></div><span class="n">− €${money2((Number(i.price) || 0) * (Number(i.quantity) || 1))}</span></div>`).join('')}</div>`
                : '<p class="empty">The credit note was read without item lines – only the amount is known.</p>'}</section>
            <p class="empty">Stock was put back when this was read. Revenue, profit and the yearly plan all have it taken off already.</p>
            ${cards.length ? `<section><h3>Warranty</h3><p class="empty" style="margin:0">${esc(cards[0].certNo || 'A certificate')} covers ${esc((cards[0].items || []).map(i => i.name).join(', '))}. If one of those came back, take it off – what stays keeps the date it was issued.</p></section>` : ''}`,
        foot: cards.length ? `<button class="btn" type="button" id="rd-warranty">${icon('rule')}Take a machine off ${esc(cards[0].certNo || 'the certificate')}</button>` : ''
    });
    const wb = el.querySelector('#rd-warranty');
    if (wb) wb.addEventListener('click', () => warrantyRemoveDialog(ctx, { card: cards[0], refund: rec }));
}

// ================================================================== new sale (till)

const till = { cart: [], payment: 'cash', customer: '', phone: '', known: null, q: '', sel: 0, done: null };

function renderTill(ctx) {
    ctx.setSub('Keyboard: F2 search · ↑ ↓ choose · Enter add · F9 charge');
    const products = ctx.model.products;
    const customerNames = [...new Set(ctx.a.customerNames)].sort((a, b) => a.localeCompare(b));
    ctx.body.innerHTML = `
        <div class="pos">
            <section class="panel" aria-label="Find products">
                <label class="field-search">${icon('search')}<input id="t-q" type="search" placeholder="Type a product name or code" value="${esc(till.q)}" autocomplete="off" aria-controls="t-res"></label>
                <div class="results" id="t-res" role="listbox"></div>
            </section>
            <section class="panel" aria-labelledby="cart-h">
                <h2 class="panel-title" id="cart-h">Sale<button class="btn small ghost" type="button" id="t-clear">Clear</button></h2>
                <div id="t-done"></div>
                <div id="t-cart"></div>
                <label class="fld" style="margin-top:12px">Customer (optional)<input id="t-cust" list="t-custlist" value="${esc(till.customer)}" placeholder="Walk-in"></label>
                <datalist id="t-custlist">${customerNames.slice(0, 800).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
                <label class="fld" id="t-phone-fld" hidden style="margin-top:8px">Phone <span class="hint" id="t-phone-why"></span><input id="t-phone" type="tel" placeholder="+355 6…" autocomplete="off"></label>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px">
                    <span class="muted">Payment</span>
                    <div class="seg" role="group" aria-label="Payment" id="t-pay">
                        <button type="button" data-pay="cash" aria-pressed="${till.payment === 'cash'}">${icon('payments')}Cash</button>
                        <button type="button" data-pay="card" aria-pressed="${till.payment === 'card'}">${icon('credit_card')}Card</button></div>
                </div>
                <div class="totals" id="t-totals"></div>
                <button class="btn money" type="button" id="t-charge" style="width:100%;justify-content:center;margin-top:14px;padding:12px">Charge</button>
                <p class="err" id="t-err" hidden></p>
            </section>
        </div>`;

    const q = ctx.body.querySelector('#t-q');
    let results = [];
    const drawResults = () => {
        results = till.q.trim() ? rankProducts(products, till.q, ctx.a.soldUnits, 12) : [];
        till.sel = Math.min(till.sel, Math.max(results.length - 1, 0));
        ctx.body.querySelector('#t-res').innerHTML = results.map((p, i) => {
            const stock = Number(p.stock) || 0;
            return `<div class="res" role="option" data-i="${i}" aria-selected="${i === till.sel}">
                <div><b>${esc(p.name)}</b><span class="sub">${esc(p.code || '')}</span></div>
                <span class="stk ${stock <= 0 ? 'zero' : ''}">${int(stock)} in stock</span><span class="pr">€${money2(p.price)}</span></div>`;
        }).join('') || `<p class="empty" style="padding:8px 4px">${till.q.trim() ? 'No product matches.' : 'Start typing to find a product.'}</p>`;
    };
    const drawCart = () => {
        const cart = ctx.body.querySelector('#t-cart');
        cart.innerHTML = till.cart.length ? till.cart.map((l, i) => {
            const p = products.find(x => x._id === l.productId); const stock = p ? Number(p.stock) || 0 : 0;
            return `<div class="cart-line"><div><b>${esc(l.name)}</b><span class="sub">€${money2(l.price)} each${l.quantity > stock ? ` · <span style="color:var(--warn)">only ${int(stock)} in stock</span>` : ''}</span></div>
                <span class="qty"><button type="button" data-q="${i}" data-d="-1" aria-label="One less">−</button><span>${int(l.quantity)}</span><button type="button" data-q="${i}" data-d="1" aria-label="One more">+</button></span>
                <b class="num">€${money2(l.price * l.quantity)}</b></div>`;
        }).join('') : '<p class="empty">No items yet. Find a product on the left and press Enter.</p>';
        const total = till.cart.reduce((a, l) => a + l.price * l.quantity, 0);
        const net = total / VAT;
        const costKnown = till.cart.every(l => l.netCost > 0);
        const cost = till.cart.reduce((a, l) => a + (l.netCost || 0) * l.quantity, 0);
        ctx.body.querySelector('#t-totals').innerHTML = `
            <div>Without VAT<b>€${money2(net)}</b></div><div>VAT 20%<b>€${money2(total - net)}</b></div>
            <div>Margin<b style="color:${costKnown ? 'var(--ok)' : 'var(--warn)'}">${till.cart.length ? (costKnown ? `€${money2(net - cost)} · ${Math.round(100 * (net - cost) / (net || 1))}%` : 'cost missing on an item') : '–'}</b></div>
            <div class="grand">Total<b>€${money2(total)}</b></div>`;
        const charge = ctx.body.querySelector('#t-charge');
        charge.textContent = till.cart.length ? `Charge €${money2(total)}` : 'Charge';
        charge.disabled = !till.cart.length;
    };
    const add = p => {
        if (!p) return;
        const line = till.cart.find(l => l.productId === p._id);
        if (line) line.quantity += 1;
        else till.cart.push({ productId: p._id, name: p.name, price: Number(p.price) || 0, cost: Number(p.cost) || 0, netCost: productNetCost(p) || 0, image: p.image || null, quantity: 1 });
        till.q = ''; q.value = ''; till.sel = 0; till.done = null;
        ctx.body.querySelector('#t-done').innerHTML = '';
        drawResults(); drawCart(); q.focus();
    };
    drawResults(); drawCart();
    if (till.done) showDone(ctx, till.done);

    q.addEventListener('input', () => { till.q = q.value; till.sel = 0; drawResults(); });
    q.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); till.sel = Math.min(till.sel + 1, results.length - 1); drawResults(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); till.sel = Math.max(till.sel - 1, 0); drawResults(); }
        else if (e.key === 'Enter') { e.preventDefault(); add(results[till.sel]); }
    });
    ctx.body.querySelector('#t-res').addEventListener('click', e => { const o = e.target.closest('[data-i]'); if (o) add(results[Number(o.dataset.i)]); });
    ctx.body.querySelector('#t-cart').addEventListener('click', e => {
        const b = e.target.closest('[data-q]'); if (!b) return;
        const line = till.cart[Number(b.dataset.q)]; line.quantity += Number(b.dataset.d);
        if (line.quantity <= 0) till.cart.splice(Number(b.dataset.q), 1);
        drawCart();
    });
    ctx.body.querySelector('#t-clear').addEventListener('click', () => { till.cart = []; till.customer = ''; till.phone = ''; ctx.body.querySelector('#t-cust').value = ''; askPhone(); drawCart(); q.focus(); });
    // Ask for a number only when it's new information: a known customer with a phone is left alone.
    const dir = () => ctx.model._directory || (ctx.model._directory = customerDirectory(ctx.model));
    const phoneFld = ctx.body.querySelector('#t-phone-fld'), phoneInput = ctx.body.querySelector('#t-phone'), phoneWhy = ctx.body.querySelector('#t-phone-why');
    const askPhone = () => {
        const name = till.customer.trim();
        const known = name ? dir().find(x => x.keys.has(customerKey(name))) : null;
        till.known = known || null;
        if (!name || WALKIN.test(name) || (known && known.phoneDigits)) { phoneFld.hidden = true; return; }
        phoneWhy.textContent = known ? `${known.name} has no number yet` : 'new customer';
        phoneFld.hidden = false;
    };
    askPhone();
    ctx.body.querySelector('#t-cust').addEventListener('input', e => { till.customer = e.target.value; till.phone = ''; phoneInput.value = ''; askPhone(); });
    phoneInput.addEventListener('input', e => { till.phone = e.target.value; });
    ctx.body.querySelector('#t-pay').addEventListener('click', e => {
        const b = e.target.closest('[data-pay]'); if (!b) return; till.payment = b.dataset.pay;
        ctx.body.querySelectorAll('#t-pay button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    });
    ctx.body.querySelector('#t-charge').addEventListener('click', () => charge(ctx));
    if (!ctx._tillKeys) {
        ctx._tillKeys = true;
        document.addEventListener('keydown', e => {
            if (ctx.tab !== 'new') return;
            if (e.key === 'F2') { e.preventDefault(); ctx.body.querySelector('#t-q')?.focus(); }
            if (e.key === 'F9') { e.preventDefault(); charge(ctx); }
        });
    }
    q.focus();
}

async function charge(ctx) {
    if (!till.cart.length || till.busy) return;
    const products = ctx.model.products;
    const short = till.cart.filter(l => { const p = products.find(x => x._id === l.productId); return !p || l.quantity > (Number(p.stock) || 0); });
    if (short.length) {
        const ok = await openModal({
            title: 'Sell more than the system holds?', confirmLabel: 'Sell anyway', confirmClass: 'money',
            body: `<p>The system shows less stock than you're selling: ${esc(short.map(l => { const p = products.find(x => x._id === l.productId); return `${l.name} (${int(p ? Number(p.stock) || 0 : 0)} in stock, selling ${int(l.quantity)})`; }).join(', '))}. If it's on the shelf, the stock figure is wrong. Selling will take it below zero, and it will show up as needing a count.</p>`
        });
        if (!ok) return;
    }
    const total = r2(till.cart.reduce((a, l) => a + l.price * l.quantity, 0));
    const customer = till.customer.trim();
    const saleData = {
        items: till.cart.map(l => ({ name: l.name || 'Unknown Product', price: Number(l.price) || 0, cost: Number(l.cost) || 0, netCost: r2(l.netCost || 0), quantity: Number(l.quantity) || 1, productId: l.productId, image: l.image || null })),
        total, paymentMethod: till.payment, notes: '', timestamp: Timestamp.now(), type: 'store'
    };
    if (customer) saleData.clientName = customer;
    const phone = String(till.phone || '').trim();
    if (customer && phone) saleData.customerPhone = phone;
    const btn = ctx.body.querySelector('#t-charge'); till.busy = true; btn.disabled = true; btn.textContent = 'Saving…';
    const saleRef = doc(collection(db, 'storeSales'));
    const batch = writeBatch(db);
    batch.set(saleRef, saleData);
    till.cart.forEach(l => batch.update(doc(db, 'products', l.productId), { stock: increment(-l.quantity) }));
    try {
        await batch.commit();
        till.done = { sale: { _id: saleRef.id, ...saleData }, total, customer };
        // The number is saved after the sale, on its own: if this fails, the sale still stands.
        if (customer && phone) {
            try {
                const known = till.known;
                if (known && known.profile) await updateDoc(doc(db, 'customers', known.profile._id), { phone });
                else await addDoc(collection(db, 'customers'), { name: customer, phone, email: '', address: '', nipt: '', status: 'Active', image: '', source: 'till', createdAt: Timestamp.now() });
            } catch (e) { toast(`Sale saved, but the phone number didn't save: ${e.message}`, { bad: true }); }
        }
        till.cart = []; till.customer = ''; till.phone = ''; till.known = null;
        toast(`Sale saved · €${money2(total)}${customer && phone ? ' · number saved' : ''}`);
        await ctx.reload();
    } catch (e) {
        btn.disabled = false; btn.textContent = `Charge €${money2(total)}`;
        const err = ctx.body.querySelector('#t-err'); err.textContent = `Couldn't save the sale: ${e.message}. Nothing was changed.`; err.hidden = false;
    } finally { till.busy = false; }
}

function showDone(ctx, done) {
    const box = ctx.body.querySelector('#t-done');
    box.innerHTML = `<div class="all-clear" style="margin-bottom:10px">${icon('check_circle')}<div style="flex:1"><b>Sale saved · €${money2(done.total)}</b><br><span>${done.customer ? esc(done.customer) : 'Walk-in'} · stock updated</span></div>
        <button class="btn small" type="button" id="t-wc">${icon('verified')}Warranty card</button></div>`;
    box.querySelector('#t-wc').addEventListener('click', () => warrantyDialog(ctx, done.sale, { customer: done.customer }));
}

// ================================================================== boot

bootWorkspace({
    active: 'sell', title: 'Sell', defaultTab: 'sales',
    tabs: [
        { id: 'sales', label: 'All sales', icon: 'receipt_long', render: renderSales },
        { id: 'new', label: 'New sale', icon: 'point_of_sale', render: renderTill },
        { id: 'online', label: 'Online orders', icon: 'shopping_bag', render: renderOnline, count: a => a.openOrders.length },
        { id: 'leads', label: 'Instagram', icon: 'forum', render: renderLeads },
        { id: 'import', label: 'Import invoice', icon: 'document_scanner', render: renderImport }
    ]
});
