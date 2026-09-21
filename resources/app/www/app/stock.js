// Stock workspace: Catalogue, Reorder, Link receipt items.
//
// Writes use exactly the shapes the classic screens use, so the bridge, Danfos Garanci and the
// classic pages keep reading them: products {name, code, producer, price, baseCost, cost = baseCost
// x 1.2, stock}, order-list rows {name, quantity, supplier, quantityReceived, smartSuggestion, ...}.
import { bootWorkspace } from './workspace.js';
import { db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, increment, arrayUnion, arrayRemove, writeBatch } from './firebase.js';
import { esc, eur, int, pct, icon, plural, day, fold, money2, toast, openDrawer, openModal } from './ui.js';
import {
    VAT, RESTOCK_DAYS, SALES_WINDOW_DAYS, MIN_UNITS_FOR_TREND,
    productNetCost, productMargin, productIdOfLine, saleTime, saleSource, unlinkedReceiptLines, rankProducts, suggestProducts
} from './data.js';

const r2 = n => Math.round(n * 100) / 100;

// ================================================================== catalogue

const FILTERS = [
    ['all', 'All', () => true],
    ['instock', 'In stock', r => r.stock > 0],
    ['out', 'Out of stock', r => r.stock <= 0],
    ['nocost', 'No cost price', r => !r.netCost],
    ['unsold', `Not sold in ${SALES_WINDOW_DAYS} days`, r => r.stock > 0 && !r.sold],
    ['count', 'Needs a count', r => r.needsCount]
];
const COLUMNS = [
    ['name', 'Product', r => fold(r.p.name)],
    ['stock', 'In stock', r => r.stock, 'n'],
    ['price', 'Price', r => Number(r.p.price) || 0, 'n'],
    ['netCost', 'Net cost', r => r.netCost || 0, 'n'],
    ['margin', 'Margin', r => r.margin ?? -1, 'n'],
    ['sold', `Sold ${SALES_WINDOW_DAYS}d`, r => r.sold, 'n'],
    ['last', 'Last sold', r => r.last || 0, 'n'],
    ['value', 'Value at cost', r => r.value, 'n']
];
const cat = { q: null, filter: 'all', sort: 'name', dir: 1 };

function catalogueRows(ctx) {
    const counted = new Set(ctx.a.needsCount.map(n => n.id));
    return ctx.model.products.map(p => {
        const netCost = productNetCost(p), stock = Number(p.stock) || 0;
        return { p, stock, netCost, margin: productMargin(p), sold: ctx.a.soldUnits[p._id] || 0,
            last: ctx.a.lastSoldAt[p._id] || 0, value: stock > 0 && netCost ? stock * netCost : 0, needsCount: counted.has(p._id) };
    });
}

function renderCatalogue(ctx) {
    if (cat.q === null) {
        cat.q = ctx.params.get('q') || '';
        if (ctx.params.get('filter')) cat.filter = ctx.params.get('filter');
    }
    const rows = catalogueRows(ctx);
    ctx.setSub(`${int(rows.length)} products · ${eur(ctx.a.stockValue)} of stock at cost`);
    const actions = ctx.setActions(`<button class="btn primary" type="button" id="new-product">${icon('add')}New product</button>`);
    actions.querySelector('#new-product').addEventListener('click', () => productDrawer(ctx, null));

    ctx.body.innerHTML = `
        <div class="toolbar">
            <label class="field-search">${icon('search')}<input id="cat-q" type="search" placeholder="Name, code or producer" value="${esc(cat.q)}" aria-label="Search products"></label>
            <div class="filters" id="cat-filters" role="group" aria-label="Filter products"></div>
        </div>
        <div class="table-wrap" style="max-height:calc(100vh - 290px)"><table class="dt"><thead><tr id="cat-head"></tr></thead><tbody id="cat-body"></tbody></table>
            <div class="table-foot" id="cat-foot"></div></div>`;

    const draw = () => {
        const f = FILTERS.find(x => x[0] === cat.filter) || FILTERS[0];
        const terms = fold(cat.q).trim().split(/\s+/).filter(Boolean);
        const searched = rows.filter(r => { const hay = fold(`${r.p.name} ${r.p.code || ''} ${r.p.producer || ''}`); return terms.every(t => hay.includes(t)); });
        ctx.body.querySelector('#cat-filters').innerHTML = FILTERS.map(([id, label, test]) =>
            `<button class="filter${id === 'count' || id === 'nocost' ? ' alert' : ''}" type="button" data-f="${id}" aria-pressed="${id === cat.filter}">${esc(label)}<span class="n">${int(searched.filter(test).length)}</span></button>`).join('');
        const col = COLUMNS.find(c => c[0] === cat.sort) || COLUMNS[0];
        const list = searched.filter(f[2]).sort((a, b) => { const x = col[2](a), y = col[2](b); return (x > y ? 1 : x < y ? -1 : 0) * cat.dir; });
        ctx.body.querySelector('#cat-head').innerHTML = COLUMNS.map(([id, label, , cls]) =>
            `<th class="${cls || ''}" aria-sort="${id === cat.sort ? (cat.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${id}">${esc(label)}</button></th>`).join('');
        ctx.body.querySelector('#cat-body').innerHTML = list.map(r => `
            <tr data-id="${esc(r.p._id)}" tabindex="0">
                <td class="name"><b>${esc(r.p.name)}</b><span>${esc([r.p.code, r.p.producer].filter(Boolean).join(' · '))}</span></td>
                <td class="n ${r.stock <= 0 ? 'zero' : ''}">${int(r.stock)}${r.needsCount ? ' <span class="chip warn">count</span>' : ''}</td>
                <td class="n">${Number(r.p.price) ? money2(r.p.price) : '–'}</td>
                <td class="n">${r.netCost ? money2(r.netCost) : '<span class="chip warn">missing</span>'}</td>
                <td class="n">${r.margin === null ? '–' : Math.round(r.margin * 100) + '%'}</td>
                <td class="n ${r.sold ? '' : 'muted'}">${int(r.sold)}</td>
                <td class="n muted">${r.last ? day(r.last) : 'never'}</td>
                <td class="n">${r.value ? eur(r.value) : '–'}</td>
            </tr>`).join('') || `<tr><td colspan="8" class="muted" style="padding:18px">No products match.</td></tr>`;
        ctx.body.querySelector('#cat-foot').textContent = `${plural(list.length, 'product', 'products')} shown. Prices include VAT; costs and margins are net of VAT.`;
    };
    draw();
    ctx.body.querySelector('#cat-q').addEventListener('input', e => { cat.q = e.target.value; draw(); });
    ctx.body.querySelector('#cat-filters').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { cat.filter = b.dataset.f; draw(); } });
    ctx.body.querySelector('#cat-head').addEventListener('click', e => {
        const b = e.target.closest('[data-sort]'); if (!b) return;
        if (cat.sort === b.dataset.sort) cat.dir = -cat.dir; else { cat.sort = b.dataset.sort; cat.dir = b.dataset.sort === 'name' ? 1 : -1; }
        draw();
    });
    const open = e => { const tr = e.target.closest('tr[data-id]'); if (tr) productDrawer(ctx, ctx.model.products.find(p => p._id === tr.dataset.id)); };
    ctx.body.querySelector('#cat-body').addEventListener('click', open);
    ctx.body.querySelector('#cat-body').addEventListener('keydown', e => { if (e.key === 'Enter') open(e); });
    // Opening from search (Ctrl K) with an exact match goes straight to that product.
    if (cat.q && !ctx._openedFromQuery) {
        ctx._openedFromQuery = true;
        const exact = rows.find(r => fold(r.p.name) === fold(cat.q));
        if (exact) productDrawer(ctx, exact.p);
    }
}

function productDrawer(ctx, p) {
    const isNew = !p;
    p = p || { name: '', code: '', producer: 'Karcher', price: 0, baseCost: 0, stock: 0 };
    const netCost = productNetCost(p);
    const sold = isNew ? 0 : (ctx.a.soldUnits[p._id] || 0);
    const knownIds = new Set(ctx.model.products.map(x => x._id));
    const history = [];
    if (!isNew) ctx.model.sales.forEach(s => (s.items || []).forEach(it => {
        if (productIdOfLine(it, knownIds) === p._id) history.push({ t: saleTime(s), qty: Number(it.quantity) || 1, price: Number(it.price) || 0, src: saleSource(s), who: s.clientName || '' });
    }));
    history.sort((a, b) => b.t - a.t);
    const names = Array.isArray(p.receiptNames) ? p.receiptNames : [];
    const batches = (p.batches || []).slice().sort((a, b) => Number(b.date) - Number(a.date));

    const { el, close } = openDrawer({
        title: isNew ? 'New product' : esc(p.name),
        sub: isNew ? 'Name and producer are required.' : esc([p.code, p.producer].filter(Boolean).join(' · ')),
        body: `
            ${isNew ? '' : `<div class="kv">
                <div><small>In stock</small><b>${int(Number(p.stock) || 0)}</b></div>
                <div><small>Sold ${SALES_WINDOW_DAYS} days</small><b>${int(sold)}</b></div>
                <div><small>Margin at list price</small><b>${productMargin(p) === null ? '–' : Math.round(productMargin(p) * 100) + '%'}</b></div></div>`}
            <form class="form-grid" id="pf" novalidate>
                <label class="fld wide">Name<input id="pf-name" value="${esc(p.name)}" required></label>
                <label class="fld">Producer<input id="pf-producer" value="${esc(p.producer || '')}" required></label>
                <label class="fld">Code<input id="pf-code" value="${esc(p.code || '')}"></label>
                <label class="fld">Price, incl. VAT (€)<input id="pf-price" type="number" min="0" step="0.01" value="${Number(p.price) || ''}"></label>
                <label class="fld">Net cost, excl. VAT (€)<input id="pf-cost" type="number" min="0" step="0.01" value="${netCost ? r2(netCost) : ''}">
                    <span class="hint" id="pf-cost-hint">${netCost ? `Cost incl. VAT: €${money2(netCost * VAT)}` : 'Missing: profit on this product is unknown until you enter it.'}</span></label>
                <label class="fld wide">In stock
                    <span class="stepper"><button type="button" data-step="-1" aria-label="One less">−</button><input id="pf-stock" type="number" step="1" value="${Number(p.stock) || 0}" aria-label="In stock"><button type="button" data-step="1" aria-label="One more">+</button></span>
                    <span class="hint">${isNew ? 'Units you have now.' : 'Changing this corrects the count. For a delivery, use Receive delivery so it is recorded.'}</span></label>
                <p class="err wide" id="pf-err" hidden></p>
            </form>
            ${isNew ? '' : `<section><h3>Receipt names linked to this product</h3>${names.length
                ? `<div class="filters">${names.map(n => `<span class="chip vio">${esc(n)} <button type="button" class="btn ghost small" data-unlink="${esc(n)}" aria-label="Unlink ${esc(n)}" style="padding:0 2px">${icon('close')}</button></span>`).join('')}</div>`
                : '<p class="empty">None. Link one from Link receipt items when EasyPOS prints a different name.</p>'}</section>
            <section><h3>Recent sales</h3>${history.length ? `<div class="lines">${history.slice(0, 8).map(h => `
                <div class="line"><div><b>${int(h.qty)} × €${money2(h.price)}</b><span>${esc(day(h.t))} · ${esc(h.src)}${h.who ? ' · ' + esc(h.who) : ''}</span></div><span class="n">€${money2(h.qty * h.price)}</span></div>`).join('')}</div>`
                : '<p class="empty">No sales recorded.</p>'}</section>
            ${batches.length ? `<section><h3>Purchases</h3><div class="lines">${batches.slice(0, 6).map(b => `
                <div class="line"><div><b>${int(b.quantity)} × €${money2(b.cost)}</b><span>${b.date ? esc(day(Number(b.date))) : ''}${b.supplier ? ' · ' + esc(b.supplier) : ''}${b.invoice ? ' · inv. ' + esc(b.invoice) : ''}</span></div><span class="n">€${money2(Number(b.cost) * Number(b.quantity || 0))}</span></div>`).join('')}</div></section>` : ''}`}`,
        foot: `<button class="btn primary" type="button" id="pf-save">${icon('check')}${isNew ? 'Create product' : 'Save changes'}</button>
               ${isNew ? '' : `<button class="btn ghost" type="button" id="pf-delete" style="margin-left:auto;color:var(--bad)">${icon('delete')}Delete</button>`}`
    });

    const costInput = el.querySelector('#pf-cost');
    costInput.addEventListener('input', () => {
        const v = Number(costInput.value);
        el.querySelector('#pf-cost-hint').textContent = v > 0 ? `Cost incl. VAT: €${money2(v * VAT)}` : 'Missing: profit on this product is unknown until you enter it.';
    });
    el.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
        const s = el.querySelector('#pf-stock'); s.value = (Number(s.value) || 0) + Number(b.dataset.step);
    }));
    el.querySelectorAll('[data-unlink]').forEach(b => b.addEventListener('click', async () => {
        await updateDoc(doc(db, 'products', p._id), { receiptNames: arrayRemove(b.dataset.unlink) });
        toast(`"${b.dataset.unlink}" unlinked`); close(); await ctx.reload();
    }));

    el.querySelector('#pf-save').addEventListener('click', async () => {
        const v = id => el.querySelector(id).value.trim();
        const err = el.querySelector('#pf-err');
        const name = v('#pf-name'), producer = v('#pf-producer');
        const price = Number(v('#pf-price')) || 0, baseCost = Number(v('#pf-cost')) || 0, stock = Math.round(Number(v('#pf-stock')) || 0);
        const problem = !name ? 'Enter a product name.' : !producer ? 'Enter the producer (e.g. Karcher).' : price < 0 || baseCost < 0 ? 'Price and cost can’t be negative.' : '';
        if (problem) { err.textContent = problem; err.hidden = false; return; }
        const data = { name, code: v('#pf-code'), producer, price, baseCost, cost: r2(baseCost * VAT), stock };
        const btn = el.querySelector('#pf-save'); btn.disabled = true;
        try {
            if (isNew) await addDoc(collection(db, 'products'), { ...data, image: '', createdAt: Date.now() });
            else await updateDoc(doc(db, 'products', p._id), data);
            toast(isNew ? `${name} created` : `${name} saved`);
            close(); await ctx.reload();
        } catch (e) { btn.disabled = false; err.textContent = `Couldn't save: ${e.message}`; err.hidden = false; }
    });

    const del = el.querySelector('#pf-delete');
    if (del) del.addEventListener('click', async () => {
        const ok = await openModal({
            title: `Delete ${p.name}?`, confirmLabel: 'Delete product', confirmClass: 'money',
            body: `<p>${history.length ? `It appears on ${plural(history.length, 'sale line', 'sale lines')}. Those sales keep their figures, but will no longer link to a product.` : 'It has no recorded sales.'} This can't be undone.</p>`
        });
        if (!ok) return;
        await deleteDoc(doc(db, 'products', p._id));
        toast(`${p.name} deleted`); close(); await ctx.reload();
    });
}

// ================================================================== reorder

async function renderReorder(ctx) {
    const a = ctx.a;
    const selling = Object.entries(a.soldUnits).filter(([, u]) => u >= MIN_UNITS_FOR_TREND)
        .map(([id, units]) => { const p = ctx.model.products.find(x => x._id === id); if (!p) return null; const stock = Number(p.stock) || 0; return { p, units, stock, daysLeft: stock / (units / SALES_WINDOW_DAYS) }; })
        .filter(Boolean).sort((x, y) => x.daysLeft - y.daysLeft);
    ctx.setSub(`Based on the last ${SALES_WINDOW_DAYS} days of sales and a ${RESTOCK_DAYS / 7}-week restock`);
    ctx.setActions(`<a class="btn" href="to_order.html">${icon('list_alt')}Open order list</a>`);
    ctx.body.innerHTML = `<div class="skeleton" style="height:200px"></div>`;
    let onList = new Set();
    try { onList = new Set((await getDocs(collection(db, 'toOrder'))).docs.map(d => d.data()).filter(o => (Number(o.quantityReceived) || 0) < (Number(o.quantity) || 0)).map(o => fold(o.name))); }
    catch { /* list unavailable: every row just offers "Add" */ }

    const suggest = r => Math.max(1, Math.ceil((r.units / SALES_WINDOW_DAYS) * (RESTOCK_DAYS + 30) - r.stock));
    const coverCell = r => {
        const scale = RESTOCK_DAYS * 3, w = Math.min(100, (r.daysLeft / scale) * 100);
        const color = r.daysLeft < RESTOCK_DAYS ? 'var(--bad)' : r.daysLeft < RESTOCK_DAYS * 2 ? 'var(--warn)' : 'var(--violet)';
        const label = r.daysLeft === Infinity ? '–' : r.daysLeft > 365 ? 'over a year' : `${Math.round(r.daysLeft)} days`;
        return `<span class="cover"><span class="bar"><i style="width:${w.toFixed(1)}%;background:${color}"></i><u style="left:${(100 / 3).toFixed(1)}%"></u></span><span class="muted">${label}</span></span>`;
    };
    const urgent = selling.filter(r => r.daysLeft < RESTOCK_DAYS);
    const unsoldTotal = a.unsoldValue;

    ctx.body.innerHTML = `
        <div class="cols" style="grid-template-columns:minmax(0,1.35fr) minmax(0,1fr)">
            <section class="panel" aria-labelledby="sell-h">
                <h2 class="panel-title" id="sell-h">Products that sell, by stock left<span>${int(selling.length)}</span></h2>
                ${urgent.length ? '' : `<div class="all-clear" style="margin-bottom:12px">${icon('check_circle')}<div><b>Nothing runs out before a restock can arrive.</b><br><span>Every product selling ${MIN_UNITS_FOR_TREND}+ units in ${SALES_WINDOW_DAYS} days has more than ${RESTOCK_DAYS / 7} weeks of stock.</span></div></div>`}
                <div class="table-wrap"><table class="dt"><thead><tr><th>Product</th><th class="n">In stock</th><th class="n">Sold ${SALES_WINDOW_DAYS}d</th><th>Stock left · tick = ${RESTOCK_DAYS / 7}-week restock</th><th class="n">Order</th></tr></thead>
                <tbody id="sell-body">${selling.map(r => `
                    <tr data-id="${esc(r.p._id)}"><td class="name"><b>${esc(r.p.name)}</b><span>${esc(r.p.code || '')}</span></td>
                        <td class="n ${r.stock <= 0 ? 'zero' : ''}">${int(r.stock)}</td><td class="n">${int(r.units)}</td><td>${coverCell(r)}</td>
                        <td class="n">${onList.has(fold(r.p.name)) ? '<span class="chip vio">on list</span>' : `<button class="btn small" type="button" data-add="${esc(r.p._id)}" data-qty="${suggest(r)}">Add ${suggest(r)}</button>`}</td></tr>`).join('')
                    || `<tr><td colspan="5" class="muted" style="padding:16px">No product sold ${MIN_UNITS_FOR_TREND}+ units in the last ${SALES_WINDOW_DAYS} days.</td></tr>`}</tbody></table></div>
            </section>
            <section class="panel" aria-labelledby="dead-h">
                <h2 class="panel-title" id="dead-h">Not sold in ${SALES_WINDOW_DAYS} days<span>${eur(unsoldTotal)}</span></h2>
                <p class="empty" style="margin:-4px 0 10px">${pct(unsoldTotal, a.stockValue)} of your stock value (${plural(a.unsold.length, 'product', 'products')}) hasn't sold a unit in ${SALES_WINDOW_DAYS} days. Worth a discount, a bundle, or no reorder.</p>
                <div class="table-wrap" style="max-height:560px"><table class="dt"><thead><tr><th>Product</th><th class="n">In stock</th><th class="n">At cost</th><th class="n">Last sold</th></tr></thead>
                <tbody id="dead-body">${a.unsold.map(u => `
                    <tr data-id="${esc(u.product._id)}"><td class="name"><b>${esc(u.product.name)}</b><span>${esc(u.product.code || '')}</span></td>
                        <td class="n">${int(u.stock)}</td><td class="n">${u.value ? eur(u.value) : '<span class="chip warn">no cost</span>'}</td>
                        <td class="n muted">${a.lastSoldAt[u.product._id] ? day(a.lastSoldAt[u.product._id]) : 'never'}</td></tr>`).join('')}</tbody></table></div>
            </section>
        </div>`;

    ctx.body.querySelectorAll('tbody').forEach(tb => tb.addEventListener('click', async e => {
        const add = e.target.closest('[data-add]');
        if (add) {
            e.stopPropagation();
            const r = selling.find(x => x.p._id === add.dataset.add); const qty = Number(add.dataset.qty);
            add.disabled = true;
            try {
                await addDoc(collection(db, 'toOrder'), {
                    name: r.p.name, quantity: qty, supplier: r.p.producer || '', quantityReceived: 0, smartSuggestion: true,
                    urgency: r.daysLeft < RESTOCK_DAYS ? 'high' : 'medium', daysUntilStockout: Math.round(r.daysLeft),
                    reason: `Sold ${r.units} in ${SALES_WINDOW_DAYS} days; ${Math.round(r.daysLeft)} days of stock left against a ${RESTOCK_DAYS}-day restock.`,
                    estimatedCost: r2(qty * (productNetCost(r.p) || 0)), addedAt: Date.now()
                });
                toast(`${qty} × ${r.p.name} added to the order list`);
                add.outerHTML = '<span class="chip vio">on list</span>';
            } catch (err) { add.disabled = false; toast(`Couldn't add: ${err.message}`, { bad: true }); }
            return;
        }
        const tr = e.target.closest('tr[data-id]');
        if (tr) productDrawer(ctx, ctx.model.products.find(p => p._id === tr.dataset.id));
    }));
}

// ================================================================== link receipt items

function renderLink(ctx) {
    const groups = unlinkedReceiptLines(ctx.model);
    ctx.setSub('EasyPOS items that never matched a product: they didn’t reduce stock, and their profit is unknown');
    ctx.body.innerHTML = `
        <div class="panel" style="padding:14px 16px"><p class="empty" style="margin:0">Link a name once and every future receipt with that name matches the product by itself. If a line is labour or a service, mark it as a service: it then counts as having no stock cost.</p></div>
        ${groups.length ? `<div class="table-wrap"><table class="dt"><thead><tr><th>Name on the receipt</th><th class="n">Sold</th><th class="n">Units</th><th class="n">Revenue</th><th class="n">Last sold</th><th></th></tr></thead>
        <tbody id="link-body">${groups.map(g => `
            <tr data-key="${esc(g.key)}"><td class="name"><b>${esc(g.name)}</b></td>
                <td class="n">${plural(g.lines.length, 'time', 'times')}</td><td class="n">${int(g.units)}</td><td class="n">${eur(g.revenue, 2)}</td>
                <td class="n muted">${g.last ? day(g.last) : '–'}</td>
                <td class="n" style="white-space:nowrap"><button class="btn small primary" type="button" data-link="${esc(g.key)}">${icon('link')}Link to product</button>
                    <button class="btn small ghost" type="button" data-service="${esc(g.key)}">It’s a service</button></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="all-clear">${icon('check_circle')}<div><b>Every EasyPOS item is linked.</b><br><span>New names appear here when a receipt prints something the catalogue doesn't know.</span></div></div>`}`;
    const tb = ctx.body.querySelector('#link-body');
    if (!tb) return;
    tb.addEventListener('click', e => {
        const l = e.target.closest('[data-link]'), s = e.target.closest('[data-service]');
        if (l) linkGroup(ctx, groups.find(g => g.key === l.dataset.link));
        if (s) markService(ctx, groups.find(g => g.key === s.dataset.service));
    });
}

// Rewrite the affected sale lines in one batch. Firestore can't update one array element, so each
// sale's items array is rewritten with only the matching lines changed.
function stageLineUpdates(batch, ctx, group, change) {
    const bySale = new Map();
    group.lines.forEach(l => { if (!bySale.has(l.saleId)) bySale.set(l.saleId, new Set()); bySale.get(l.saleId).add(l.index); });
    bySale.forEach((indexes, saleId) => {
        const sale = ctx.model.sales.find(s => s._id === saleId);
        if (!sale) return;
        const items = sale.items.map((it, i) => indexes.has(i) ? change(it) : it);
        batch.update(doc(db, 'storeSales', saleId), { items });
    });
}

async function linkGroup(ctx, group) {
    let chosen = null;
    const soldUnits = ctx.a.soldUnits;
    const initial = suggestProducts(ctx.model.products, group.name, 6);
    // Typed search: exact words first; if nothing has every word, fall back to close spellings.
    const searchFor = text => { const exact = rankProducts(ctx.model.products, text, soldUnits, 8); return exact.length ? exact : suggestProducts(ctx.model.products, text, 8); };
    const modalPromise = openModal({
        title: `Link "${group.name}"`,
        confirmLabel: 'Link',
        body: `<p>Choose the catalogue product this receipt name means.</p>
            <label class="field-search" style="max-width:none">${icon('search')}<input id="lk-q" type="search" placeholder="Search the catalogue" aria-label="Search products"></label>
            <p class="empty" style="margin:-6px 0 0">Closest matches to the receipt name:</p>
            <div class="results" id="lk-res" role="listbox" style="max-height:260px;overflow:auto"></div>
            <label class="check"><input type="checkbox" id="lk-stock" checked><span><b style="font-weight:500">Take ${plural(group.units, 'unit', 'units')} off stock</b><br><span class="empty" style="padding:0">They were sold but never deducted, so the stock figure is ${int(group.units)} too high.</span></span></label>`,
        validate: () => chosen ? '' : 'Pick a product from the list first.'
    });
    const modalEl = [...document.querySelectorAll('.modal-backdrop')].pop();   // the dialog just opened
    const res = modalEl.querySelector('#lk-res'), q = modalEl.querySelector('#lk-q');
    const draw = list => {
        res.innerHTML = list.map(p => `<div class="res" role="option" data-id="${esc(p._id)}" aria-selected="${chosen && chosen._id === p._id}">
            <div><b>${esc(p.name)}</b><span class="sub">${esc(p.code || '')}</span></div><span class="stk ${Number(p.stock) > 0 ? '' : 'zero'}">${int(Number(p.stock) || 0)} in stock</span><span class="pr">${Number(p.price) ? '€' + money2(p.price) : ''}</span></div>`).join('')
            || '<p class="empty">No product matches. Try fewer words.</p>';
    };
    draw(initial);
    let shown = initial;
    q.addEventListener('input', () => { shown = q.value.trim() ? searchFor(q.value) : initial; draw(shown); });
    res.addEventListener('click', e => { const o = e.target.closest('[data-id]'); if (!o) return; chosen = ctx.model.products.find(p => p._id === o.dataset.id); draw(shown); });

    const ok = await modalPromise;
    if (!ok || !chosen) return;
    const deduct = ok.querySelector('#lk-stock').checked;
    const net = productNetCost(chosen);
    const batch = writeBatch(db);
    stageLineUpdates(batch, ctx, group, it => {
        const next = { ...it, costProductId: chosen._id, costSource: 'linked:owner' };
        if (!(Number(it.cost) > 0) && net) { next.cost = r2(net * VAT); next.netCost = r2(net); }
        return next;
    });
    const productUpdate = { receiptNames: arrayUnion(group.name) };
    if (deduct) productUpdate.stock = increment(-group.units);
    batch.update(doc(db, 'products', chosen._id), productUpdate);
    try {
        await batch.commit();
        toast(`"${group.name}" linked to ${chosen.name}${deduct ? `, stock −${group.units}` : ''}`);
        await ctx.reload();
    } catch (e) { toast(`Couldn't link: ${e.message}`, { bad: true }); }
}

async function markService(ctx, group) {
    const ok = await openModal({
        title: `Mark "${group.name}" as a service?`, confirmLabel: 'Mark as service',
        body: `<p>Services (labour, repairs, delivery) have no stock. Its ${plural(group.lines.length, 'sale line', 'sale lines')} will count as having no stock cost, and future receipts with this name won't show up here.</p>`
    });
    if (!ok) return;
    const batch = writeBatch(db);
    stageLineUpdates(batch, ctx, group, it => ({ ...it, isService: true, costSource: 'service:owner' }));
    batch.set(doc(db, 'settings', 'receiptNames'), { services: arrayUnion(group.name) }, { merge: true });
    try { await batch.commit(); toast(`"${group.name}" marked as a service`); await ctx.reload(); }
    catch (e) { toast(`Couldn't save: ${e.message}`, { bad: true }); }
}

// ================================================================== boot

bootWorkspace({
    active: 'stock', title: 'Stock', defaultTab: 'catalogue',
    tabs: [
        { id: 'catalogue', label: 'Catalogue', icon: 'inventory_2', render: renderCatalogue },
        { id: 'reorder', label: 'Reorder', icon: 'local_shipping', render: ctx => { renderReorder(ctx); }, count: a => a.reorder.length },
        { id: 'link', label: 'Link receipt items', icon: 'link', render: renderLink, count: (a, m) => unlinkedReceiptLines(m).length },
        { label: 'Order list', icon: 'list_alt', href: 'to_order.html' },
        { label: 'Receive delivery', icon: 'move_to_inbox', href: 'smart-inventory-scanner.html' }
    ]
});
