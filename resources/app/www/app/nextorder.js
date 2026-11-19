// Stock › Next order: one proposal for the next order to a supplier (Kärcher first), and the order
// ready for Kärcher's portal. Replaces the Reorder tab (same address, stock.html#reorder).
//
// What goes into the proposal, and how many, is decided in proposal.js. Here the owner ticks and
// changes quantities, sees the total and the cash it takes, and puts it on the order list in one
// click. Lines planned here and not ordered yet are listed with their material numbers, to paste
// into the portal or to upload as an Excel file. When Kärcher's order arrives in the archive (the
// portal's summary or Zagreb's confirmation), the Paper Autopilot gives those same lines the order
// number - no second line - and the confirmation's delivery dates show on them (Order list, Today).
//
// Writes: toOrder lines {name, code, quantity, supplier, quantityReceived 0, smartSuggestion,
// urgency, daysUntilStockout, reason, estimatedCost, addedAt, productId, plannedAt, plannedIn
// 'next-order'}, the shape the Order list and Receive delivery already read; `sentAt` when the
// owner says the order went to Kärcher.
import { db, collection, doc, getDocs, writeBatch } from './firebase.js';
import { esc, eur, int, icon, plural, day, money2, toast, openModal } from './ui.js';
import { RESTOCK_DAYS, SALES_WINDOW_DAYS, MIN_UNITS_FOR_TREND, productNetCost, rankProducts } from './data.js';
import { trackPlan, planFor, waitingByProduct } from './planmodel.js';
import { loadExtras, askedByProduct } from './dashboard-data.js';
import { buildPurchasing, deliveryDates, arrivalOf } from './purchasing.js';
import { COVER_DAYS, assess, proposeOrder, supplierPrices, customsShare, waitingByProductId, materialNo, portalText, supplierKey, codeKey } from './proposal.js';
import { checkButton, wireCheckButton } from './autopilot-run.js';
import { allAsks, askedCounts, askedReport, aliasMap, demandTrend, sameTimeLastYear } from './iginsights.js';

const TAB = 'reorder';
const KARCHER = 'karcher';
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const r2 = n => Math.round(n * 100) / 100;
const left = l => Math.max(0, (Number(l.quantity) || 0) - (Number(l.quantityReceived) || 0));
const isPhone = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const longDay = iso => iso ? new Date(iso + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

// The owner's choices while the page is open: quantities changed, lines unticked, products added.
const st = { supplier: null, qty: new Map(), off: new Set(), extra: new Set() };

function loadScript(src, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.onload = () => resolve(window[globalName]);
        s.onerror = () => reject(new Error(`Couldn't load ${src.split('/').pop()}. Check the internet connection.`));
        document.head.appendChild(s);
    });
}

// Suppliers as the catalogue names them ("Karcher"), Kärcher first, then by how many products.
function suppliersOf(products) {
    const map = new Map();
    products.forEach(p => {
        const k = supplierKey(p.producer); if (!k) return;
        const s = map.get(k) || { key: k, label: k === KARCHER ? 'Kärcher' : String(p.producer).trim(), n: 0 };
        s.n++; map.set(k, s);
    });
    return [...map.values()].sort((a, b) => (b.key === KARCHER) - (a.key === KARCHER) || b.n - a.n);
}

function productForLine(products, l) {
    return (l.productId && products.find(p => p._id === l.productId))
        || (codeKey(l.code) && products.find(p => codeKey(p.code) === codeKey(l.code)))
        || products.find(p => String(p.name || '').trim().toLowerCase() === String(l.name || '').trim().toLowerCase()) || null;
}

// The figures the proposal needs (proposal.js): sales from analyze(), the order list, the year
// plans at their real pace, and - when loaded - Kärcher's prices and the chatbot's questions.
function figuresFor(m, a, { docs = [], events = [], chats = [], aliases = new Map() } = {}) {
    const year = new Date(a.now).getFullYear();
    const plans = [year, year + 1].map(y => planFor(m, y)).filter(Boolean);
    const demandByYear = plans.length ? new Map(plans.map(pl => [Number(pl.year), new Map((pl.products || []).map(r => [r.id, r.demand || []]))])) : null;
    const tracked = planFor(m, year) ? trackPlan(m, planFor(m, year), { now: a.now, waitingByProduct: waitingByProduct(m) }) : null;
    const pace = new Map((tracked?.rows || []).map(r => [r.id, r.pace === null ? 1 : Math.min(3, Math.max(0.25, r.pace))]));
    return {
        soldUnits: a.soldUnits, soldUnits12: a.soldUnits12, lastSoldAt: a.lastSoldAt,
        waiting: waitingByProductId(m.products, m.orderLines || []),
        asked: askedFor(m.products, events, chats, a.now, aliases),
        prices: docs.length ? supplierPrices(docs) : new Map(),
        demandByYear, paceOf: id => pace.get(id) ?? 1, now: a.now,
        windowDays: SALES_WINDOW_DAYS, restockDays: RESTOCK_DAYS, minUnits: MIN_UNITS_FOR_TREND
    };
}

// What people asked the Instagram bot for, per catalogue product, in 6 months. Machines count by
// model (all the SC 3s together, askedByProduct); everything else - detergents, accessories - by the
// exact product the question named (Finding #81: the bot's memory, and the old log matched by name).
function askedFor(products, events, chats, now, aliases = new Map()) {
    const out = events.length ? askedByProduct(products, events, now) : new Map();
    if (!events.length && !chats.length) return out;
    askedCounts(allAsks({ chats, events, products, aliases }), now).forEach((x, id) => {
        if (!out.has(id)) out.set(id, { questions: x.questions_6m, questions_6m: x.questions_6m });
    });
    return out;
}

// The tab's count: the Kärcher proposal from what is already loaded (the chatbot's questions,
// read when the tab opens, can add a line or two).
export function nextOrderCount(a, m) {
    if (!m || !m.products) return a.reorder.length;
    if (m._nextOrderCount && m._nextOrderCount.at === a.now) return m._nextOrderCount.n;
    const n = proposeOrder(m.products, KARCHER, figuresFor(m, a)).length;
    m._nextOrderCount = { at: a.now, n };
    return n;
}

export async function renderNextOrder(ctx) {
    const m = ctx.model, a = ctx.a, products = m.products;
    const suppliers = suppliersOf(products);
    if (!st.supplier || !suppliers.some(s => s.key === st.supplier)) st.supplier = (suppliers[0] || {}).key || KARCHER;
    const sup = suppliers.find(s => s.key === st.supplier) || { key: st.supplier, label: st.supplier };
    const isK = sup.key === KARCHER;

    ctx.setSub(`What to order next from ${esc(sup.label)}`);
    const actions = ctx.setActions(`<div class="seg" role="group" aria-label="Supplier" id="no-sup">${suppliers.map(s =>
        `<button type="button" data-s="${esc(s.key)}" aria-pressed="${s.key === st.supplier}">${esc(s.label)}</button>`).join('')}</div>`);
    actions.querySelector('#no-sup').addEventListener('click', e => {
        const b = e.target.closest('[data-s]'); if (!b || b.dataset.s === st.supplier) return;
        st.supplier = b.dataset.s; st.qty.clear(); st.off.clear(); st.extra.clear();
        renderNextOrder(ctx);
    });
    ctx.body.innerHTML = `<div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:320px"></div>`;

    // The purchase papers (prices, customs, delivery dates) and what people ask the chatbot. The
    // proposal still works without either; it just knows less.
    let docs = [], events = [], chats = [], aliasDocs = [], missing = [];
    await Promise.all([
        getDocs(collection(db, 'purchaseDocs')).then(s => { docs = s.docs.map(d => ({ id: d.id, ...d.data() })); }).catch(() => missing.push('the purchase papers')),
        loadExtras(['events', 'igChats']).then(x => { events = x.events || []; chats = x.igChats || []; }).catch(() => missing.push('the chatbot questions')),
        getDocs(collection(db, 'productAliases')).then(s => { aliasDocs = s.docs.map(d => d.data()); }).catch(() => {})
    ]);
    if (ctx.tab !== TAB) return;   // the owner moved on while it loaded

    const aliases = aliasMap(aliasDocs);
    const f = figuresFor(m, a, { docs: isK ? docs : [], events, chats, aliases });
    // Asked for on Instagram in the last 6 months, but not in the catalogue at all (Finding #82),
    // and what is asked about more than usual lately - order it earlier (Finding #84).
    const asks = allAsks({ chats, events, products, aliases });
    const notSold = askedReport(asks, products, a.now, { days: 183 }).filter(r => r.status === 'none' && r.people >= 2).slice(0, 8);
    const rising = demandTrend(asks, products, a.now).slice(0, 6);
    const lastYear = sameTimeLastYear(asks, products, a.now).slice(0, 6);   // Finding #85
    const customs = isK && docs.length ? customsShare(buildPurchasing(docs, { products }).customs, a.now) : null;
    const dates = deliveryDates(docs);

    const proposed = proposeOrder(products, sup.key, f);
    const extraRows = [...st.extra].filter(id => !proposed.some(r => r.id === id))
        .map(id => products.find(p => p._id === id)).filter(Boolean).map(p => assess(p, f, { extra: true }));
    const rows = [...proposed, ...extraRows];
    const unitOf = r => r.price ? { v: r.price.unit, kind: 'supplier' } : productNetCost(r.p) ? { v: productNetCost(r.p), kind: 'cost' } : null;
    const qtyOf = r => st.qty.has(r.id) ? st.qty.get(r.id) : r.suggested;
    const chosen = () => rows.filter(r => !st.off.has(r.id) && qtyOf(r) > 0);

    // ---- what is already on the order list for this supplier
    const mine = (m.orderLines || []).filter(l => left(l) > 0 && supplierKey(l.supplier || productForLine(products, l)?.producer) === sup.key);
    const planned = mine.filter(l => !l.orderNo).map(l => {
        const p = productForLine(products, l);
        const material = materialNo(l.code) || materialNo(p?.code);
        return { l, p, name: l.name || p?.name || '', material, sku: material || String(l.code || p?.code || '').trim(), qty: left(l) };
    });
    const ordered = mine.filter(l => l.orderNo);
    const slowHere = a.unsold.filter(u => supplierKey(u.product.producer) === sup.key);

    const chip = (r) => r.reasons.map(x => `<span class="chip ${x.k === 'short' || x.k === 'out' ? 'bad' : x.k === 'asked' ? 'vio' : x.k === 'plan' ? 'ok' : ''}">${esc(x.text)}</span>`).join(' ')
        + (r.slow ? ` <span class="chip warn" title="Already on the shelf and not selling">sitting: ${int(r.slow.stock)} in stock, ${r.slow.lastSold ? 'last sold ' + esc(day(r.slow.lastSold)) + ' ' + new Date(r.slow.lastSold).getFullYear() : 'never sold'}</span>` : '')
        + (isK && !r.material ? ' <span class="chip warn">no material number</span>' : '');
    const lastsCell = r => r.stock + r.onList <= 0 ? '<span class="zero">out</span>' : r.rate <= 0 ? '<span class="muted">–</span>' : r.lasts > 365 ? 'over a year' : `${int(Math.round(r.lasts))} days`;

    function totals() {
        const list = chosen();
        let value = 0, noPrice = 0, units = 0;
        list.forEach(r => { const u = unitOf(r); units += qtyOf(r); if (u) value += u.v * qtyOf(r); else noPrice++; });
        return { list, value: r2(value), noPrice, units };
    }
    function summaryHTML() {
        const t = totals();
        const duty = customs ? t.value * customs.dutyFees : 0, vat = customs ? t.value * customs.vat : 0;
        return `
            <div class="kpi"><small>To order</small><span class="v">${int(t.list.length)}</span><span class="d">${plural(t.units, 'unit', 'units')}${rows.length > t.list.length ? ` · ${rows.length - t.list.length} left out` : ''}</span></div>
            <div class="kpi"><small>${isK ? 'At Kärcher’s prices' : 'At cost'}</small><span class="v">${eur(t.value)}</span><span class="d">${t.noPrice ? `<span style="color:var(--warn)">${plural(t.noPrice, 'line has', 'lines have')} no price</span>` : 'net, without VAT'}</span></div>
            <div class="kpi"><small>Cash it takes</small><span class="v">${customs ? '≈ ' + eur(t.value + duty + vat) : eur(t.value)}</span><span class="d">${customs
                ? `+ ${eur(duty)} duty and fees, + ${eur(vat)} import VAT (reclaimed) · from ${plural(customs.declarations, 'declaration', 'declarations')} this year`
                : isK ? 'customs not known yet' : 'what the supplier charges'}</span></div>
            <div class="kpi"><small>On the order list</small><span class="v">${int(mine.length)}</span><span class="d">${plural(ordered.length, 'line', 'lines')} ordered · ${int(planned.length)} not ordered yet</span></div>`;
    }

    ctx.setSub(`What to order next from ${esc(sup.label)}: what runs out within the ${RESTOCK_DAYS / 7}-week restock, the yearly plan, what customers ask for, less what's already on the order list`);
    ctx.body.innerHTML = `
        ${missing.length ? `<div class="panel" style="padding:10px 14px"><span class="muted">Couldn't read ${esc(missing.join(' or '))}; the proposal leaves ${missing.length > 1 ? 'them' : 'it'} out.</span></div>` : ''}
        <div class="kpis" id="no-sum">${summaryHTML()}</div>

        <section class="panel" aria-labelledby="no-h">
            <h2 class="panel-title" id="no-h">Proposal<span>${int(rows.length)}</span></h2>
            <p class="empty" style="margin:-4px 0 10px">Each quantity lasts the ${RESTOCK_DAYS / 7}-week restock plus a month, at the faster of the last ${SALES_WINDOW_DAYS} days' and the last 12 months' selling rate (or the yearly plan's, if higher), less what's on the shelf and on the order list. Change any quantity; untick what you don't want.</p>
            ${rows.length ? `<div class="table-wrap"><table class="dt"><thead><tr><th style="width:32px"></th><th>Product</th><th class="n">In stock</th><th class="n">On the list</th><th class="n">Sold ${SALES_WINDOW_DAYS}d · 12m</th><th class="n">Lasts</th><th class="n">Order</th><th class="n">${isK ? 'Kärcher price' : 'Unit cost'}</th><th class="n">Total</th></tr></thead>
                <tbody id="no-body">${rows.map(r => { const u = unitOf(r), q = qtyOf(r), on = !st.off.has(r.id); return `
                    <tr data-id="${esc(r.id)}" style="cursor:default${on ? '' : ';opacity:.55'}">
                        <td><input type="checkbox" data-on="${esc(r.id)}" ${on ? 'checked' : ''} aria-label="Order ${esc(r.p.name)}"></td>
                        <td class="name"><b>${esc(r.p.name)}</b><span>${esc(r.material || r.p.code || '')}</span><span style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${chip(r)}</span></td>
                        <td class="n ${r.stock <= 0 ? 'zero' : ''}">${int(r.stock)}</td>
                        <td class="n">${r.onList ? int(r.onList) : '<span class="muted">–</span>'}</td>
                        <td class="n">${int(r.units90)} <span class="muted">· ${int(r.units12)}</span></td>
                        <td class="n">${lastsCell(r)}</td>
                        <td class="n"><input class="inp" type="number" min="0" step="1" data-q="${esc(r.id)}" value="${q}" style="width:70px;text-align:right" aria-label="Units to order"><span class="muted" style="display:block;font-size:11px">${r.suggested !== q ? 'suggested ' + int(r.suggested) : ''}</span></td>
                        <td class="n">${u ? `€${money2(u.v)}${u.kind === 'cost' && isK ? ' <span class="muted" title="No Kärcher price on file: your landed cost">est.</span>' : ''}` : '<span class="chip warn">no price</span>'}</td>
                        <td class="n" data-t="${esc(r.id)}">${u && on ? eur(u.v * q) : '–'}</td></tr>`; }).join('')}</tbody></table>
                <div class="table-foot" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                    <button class="btn" type="button" id="no-add">${icon('add')}Add a product</button>
                    <span class="muted" style="flex:1">${slowHere.length ? `Never proposed: ${plural(slowHere.length, 'product', 'products')} on the shelf that sold nothing in ${SALES_WINDOW_DAYS} days (${eur(slowHere.reduce((s, u) => s + u.value, 0))} at cost). <a href="stock.html?filter=unsold#catalogue" style="color:var(--violet-2)">See them</a>` : ''}</span>
                    <button class="btn primary" type="button" id="no-put">${icon('playlist_add')}Put on the order list</button>
                </div></div>`
            : `<div class="all-clear">${icon('check_circle')}<div><b>Nothing to order from ${esc(sup.label)} right now.</b><br><span>Everything that sells lasts the ${RESTOCK_DAYS / 7}-week restock with what's on the shelf and on the order list, and nothing out of stock is in demand.</span></div></div>
               <div style="margin-top:10px"><button class="btn" type="button" id="no-add">${icon('add')}Add a product</button></div>`}
        </section>

        ${planned.length ? `<section class="panel" aria-labelledby="pt-h">
            <h2 class="panel-title" id="pt-h">${isK ? 'Ready for Kärcher’s order page' : `Ready to order from ${esc(sup.label)}`}<span>${int(planned.length)}</span></h2>
            ${(() => { const sent = planned.filter(x => x.l.sentAt); const when = sent.length ? Math.max(...sent.map(x => Number(x.l.sentAt))) : 0;
                return sent.length === planned.length
                    ? `<p class="empty" style="margin:-4px 0 10px">You placed this order on ${esc(day(when))}. ${isK ? 'When Kärcher’s confirmation (or the portal’s order summary) is in Downloads, “Check Downloads now” files it: these lines then get the order number and the delivery dates.' : ''}</p>`
                    : `<p class="empty" style="margin:-4px 0 10px">On the order list, not ordered yet. ${isPhone() ? 'Copy the list, ' : 'Download the Excel file (name, SKU, quantity), '}then type the lines into ${isK ? 'Kärcher’s order page. When Kärcher’s confirmation is filed, these same lines get the order number and the delivery dates.' : 'the supplier’s order form or an email.'}</p>`; })()}
            <div class="table-wrap" style="max-height:360px"><table class="dt"><thead><tr><th>Name</th><th>SKU</th><th class="n">Quantity</th><th class="n">On the list since</th></tr></thead>
                <tbody>${planned.map(x => `<tr style="cursor:default"><td>${esc(x.name)}</td>
                    <td style="font-family:var(--mono)">${x.sku ? esc(x.sku) : '<span class="chip warn">no code</span>'}${isK && x.sku && !x.material ? ' <span class="chip warn" title="Not a Kärcher material number: check it on Kärcher’s page">check</span>' : ''}</td>
                    <td class="n">${int(x.qty)}</td><td class="n muted">${x.l.addedAt ? esc(day(Number(x.l.addedAt))) : '–'}${x.l.sentAt ? ' · placed' : ''}</td></tr>`).join('')}</tbody></table></div>
            <div class="toolbar" style="margin-top:10px;flex-wrap:wrap;gap:8px">
                ${isPhone() ? '' : `<button class="btn primary" type="button" id="pt-xlsx">${icon('download')}Excel file</button>`}
                <button class="btn${isPhone() ? ' primary' : ''}" type="button" id="pt-names">${icon('content_copy')}Copy the list</button>
                ${isK ? `<button class="btn" type="button" id="pt-copy">${icon('content_copy')}Copy SKUs and quantities</button>` : ''}
                ${planned.some(x => !x.l.sentAt) ? `<button class="btn" type="button" id="pt-sent">${icon('send')}I’ve placed the order</button>` : ''}
                ${isK ? checkButton() : ''}
            </div>
            ${isK && planned.some(x => !x.material) ? `<p class="empty" style="margin:8px 0 0">${plural(planned.filter(x => !x.material).length, 'line has', 'lines have')} no Kärcher material number in the catalogue: the SKU is the catalogue’s own code, or empty. Look ${planned.filter(x => !x.material).length === 1 ? 'it' : 'them'} up on Kärcher’s page, and add the number in Catalogue for next time.</p>` : ''}
        </section>` : ''}

        ${ordered.length ? `<section class="panel" aria-labelledby="ow-h">
            <h2 class="panel-title" id="ow-h">Ordered, on the way<span>${int(ordered.length)}</span></h2>
            ${onTheWay(ordered, products, dates)}
        </section>` : ''}

        ${rising.length ? `<section class="panel" aria-labelledby="ri-h">
            <h2 class="panel-title" id="ri-h">Asked about more than usual on Instagram<span>${int(rising.length)}</span></h2>
            <div class="lines">${rising.map(r => `<div class="line"><div><b>${esc(r.name)}</b><span>${r.product ? `${int(Number(r.product.stock) || 0)} in stock` : 'not in your catalogue'} · usually ${r.usual} ${r.usual === 1 ? 'person' : 'people'} a month</span></div><span class="n">${plural(r.recent, 'person', 'people')} in 30 days</span></div>`).join('')}</div>
            <p class="chart-note">Questions on Instagram come weeks before the sales. When a product is asked about twice as often as usual, it may be worth ordering earlier or more.</p>
        </section>` : ''}

        ${lastYear.length ? `<section class="panel" aria-labelledby="ly-h">
            <h2 class="panel-title" id="ly-h">Same time last year on Instagram<span>${int(lastYear.length)}</span></h2>
            <div class="lines">${lastYear.map(r => `<div class="line"><div><b>${esc(r.name)}</b><span>${r.product ? `${int(Number(r.product.stock) || 0)} in stock now` : 'not in your catalogue'} · usually ${r.usual} ${r.usual === 1 ? 'person' : 'people'} a month last year</span></div><span class="n">${plural(r.lastYear, 'person', 'people')} in the next 30 days, a year ago</span></div>`).join('')}</div>
            <p class="chart-note">What people asked about in the coming month a year ago, more than in an average month of that year. If it’s seasonal, it may be worth having stock before the questions start.</p>
        </section>` : ''}

        ${notSold.length ? `<section class="panel" aria-labelledby="ns-h">
            <h2 class="panel-title" id="ns-h">Asked for on Instagram, not in your catalogue<span>${int(notSold.length)}</span></h2>
            <div class="lines">${notSold.map(r => `<div class="line"><div><b>${esc(r.name)}</b><span>last asked ${esc(day(r.last))}</span></div><span class="n">${plural(r.people, 'person', 'people')}</span></div>`).join('')}</div>
            <p class="chart-note">Two or more people in 6 months asked for these and you don’t list them. Add one in Catalogue to order it. The full list is in Sell › Instagram › Asked for.</p>
        </section>` : ''}`;

    // ---- the proposal: ticks and quantities update the totals in place (no redraw, so the cursor stays)
    const body = ctx.body.querySelector('#no-body');
    if (body) {
        const redrawTotals = id => {
            const r = rows.find(x => x.id === id), u = unitOf(r), cell = ctx.body.querySelector(`[data-t="${CSS.escape(id)}"]`);
            if (cell) cell.textContent = u && !st.off.has(id) ? eur(u.v * qtyOf(r)) : '–';
            ctx.body.querySelector('#no-sum').innerHTML = summaryHTML();
        };
        body.addEventListener('input', e => {
            const q = e.target.closest('[data-q]'); if (!q) return;
            const n = Math.max(0, Math.round(Number(q.value) || 0));
            st.qty.set(q.dataset.q, n);
            redrawTotals(q.dataset.q);
        });
        body.addEventListener('change', e => {
            const c = e.target.closest('[data-on]'); if (!c) return;
            if (c.checked) st.off.delete(c.dataset.on); else st.off.add(c.dataset.on);
            c.closest('tr').style.opacity = c.checked ? '' : '.55';
            redrawTotals(c.dataset.on);
        });
    }
    ctx.body.querySelector('#no-add').addEventListener('click', () => addProduct(ctx, sup, f));
    const put = ctx.body.querySelector('#no-put');
    if (put) put.addEventListener('click', () => putOnList(ctx, sup, totals().list, unitOf, qtyOf, planned));

    // ---- ready for the portal
    const portalLines = planned.map(x => ({ material: x.material, qty: x.qty, name: x.name, sku: x.sku }));
    const copy = async (text, what) => {
        try { await navigator.clipboard.writeText(text); toast(what); }
        catch { toast('Couldn’t reach the clipboard.', { bad: true }); }
    };
    ctx.body.querySelector('#pt-copy')?.addEventListener('click', () => {
        const text = portalText(portalLines);
        if (!text) { toast('No line has a material number yet.', { bad: true }); return; }
        copy(text, `Copied ${plural(portalLines.filter(l => l.material).length, 'line', 'lines')}: material number and quantity`);
    });
    ctx.body.querySelector('#pt-names')?.addEventListener('click', () =>
        copy(portalLines.map(l => `${l.name}\t${l.sku}\t${l.qty}`).join('\n'), `Copied ${plural(portalLines.length, 'line', 'lines')}: name, SKU, quantity`));
    ctx.body.querySelector('#pt-xlsx')?.addEventListener('click', async e => {
        const btn = e.currentTarget; btn.disabled = true;
        try {
            const XLSX = await loadScript(XLSX_URL, 'XLSX');
            // What the owner types into Kärcher's order page by hand (18 Nov 2026): name, SKU (the
            // material number, kept as text so Excel doesn't turn it into a number), quantity.
            const rowsX = [['Name', 'SKU', 'Quantity'], ...portalLines.map(l => [l.name, l.sku, l.qty])];
            const ws = XLSX.utils.aoa_to_sheet(rowsX);
            ws['!cols'] = [{ wch: 44 }, { wch: 16 }, { wch: 10 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Order');
            XLSX.writeFile(wb, `Karcher order ${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (x) { toast(`Couldn't make the Excel file: ${x.message}`, { bad: true }); }
        btn.disabled = false;
    });
    ctx.body.querySelector('#pt-sent')?.addEventListener('click', async () => {
        const open = planned.filter(x => !x.l.sentAt);
        const ok = await openModal({ title: 'Placed with the supplier?', confirmLabel: 'Yes, placed',
            body: `<p>${plural(open.length, 'line stays', 'lines stay')} on the order list, marked as placed today, so the same order isn't placed twice. ${isK ? 'Kärcher’s confirmation, once filed, gives them the order number and the delivery dates.' : ''}</p>` });
        if (!ok) return;
        const batch = writeBatch(db), now = Date.now();
        open.forEach(x => batch.update(doc(db, 'toOrder', x.l._id), { sentAt: now }));
        try { await batch.commit(); toast('Marked as placed'); await ctx.reload(); }
        catch (x) { toast(`Couldn't save: ${x.message}`, { bad: true }); }
    });
    wireCheckButton(ctx.body, () => ctx.reload());
}

// Ordered lines by order, with Kärcher's confirmed delivery dates where a confirmation was read.
function onTheWay(lines, products, dates) {
    const byOrder = new Map();
    lines.forEach(l => { if (!byOrder.has(l.orderNo)) byOrder.set(l.orderNo, []); byOrder.get(l.orderNo).push(l); });
    const today = new Date().toISOString().slice(0, 10);
    return [...byOrder].map(([no, list]) => {
        const states = list.map(l => ({ l, s: arrivalOf(dates, l) }));
        const ds = [...new Set(states.filter(x => x.s?.status === 'confirmed').map(x => x.s.date))].sort();
        const head = ds.length ? `due ${ds.length > 1 ? `${longDay(ds[0])} – ${longDay(ds[ds.length - 1])}` : longDay(ds[0])}` : states.some(x => x.s) ? 'not confirmed yet' : 'no confirmation read';
        return `<details class="table-wrap" style="padding:0"><summary style="padding:10px 12px;cursor:pointer"><b style="font-weight:500">${list[0].orderSource === 'warranty' ? 'Warranty claim' : 'Order'} ${esc(no)}</b> · ${plural(list.length, 'line', 'lines')} · <span class="muted">${esc(head)}</span></summary>
            <table class="dt"><tbody>${states.map(({ l, s }) => `<tr style="cursor:default"><td class="name"><b>${esc(l.name)}</b><span>${esc(l.code || '')}</span></td><td class="n">${int(left(l))}</td>
                <td class="n">${!s ? '<span class="muted">–</span>' : s.status === 'confirmed' ? `<span class="chip ${s.date < today ? 'warn' : 'ok'}">${s.date < today ? 'was due' : 'due'} ${esc(longDay(s.date))}</span>` : '<span class="chip">not confirmed yet</span>'}</td></tr>`).join('')}</tbody></table></details>`;
    }).join('');
}

async function addProduct(ctx, sup, f) {
    let chosen = null;
    const pool = ctx.model.products.filter(p => supplierKey(p.producer) === sup.key);
    const modalPromise = openModal({
        title: `Add to the ${sup.label} order`, confirmLabel: 'Add',
        body: `<label class="field-search" style="max-width:none">${icon('search')}<input id="np-q" type="search" placeholder="Search ${esc(sup.label)} products" aria-label="Search products"></label>
            <div class="results" id="np-res" role="listbox" style="max-height:280px;overflow:auto"></div>`,
        validate: () => chosen ? '' : 'Pick a product from the list.'
    });
    const el = [...document.querySelectorAll('.modal-backdrop')].pop();
    const res = el.querySelector('#np-res'), q = el.querySelector('#np-q');
    const draw = list => {
        res.innerHTML = list.map(p => {
            const r = assess(p, f);
            return `<div class="res" role="option" data-id="${esc(p._id)}" aria-selected="${chosen && chosen._id === p._id}"><div><b>${esc(p.name)}</b><span class="sub">${esc(p.code || '')}${r.slow ? ` · <span style="color:var(--warn)">sitting: ${int(r.slow.stock)} in stock, ${r.slow.lastSold ? 'last sold ' + esc(day(r.slow.lastSold)) + ' ' + new Date(r.slow.lastSold).getFullYear() : 'never sold'}</span>` : ''}</span></div>
                <span class="stk ${Number(p.stock) > 0 ? '' : 'zero'}">${int(Number(p.stock) || 0)} in stock</span><span class="pr">${int(r.units12)} sold 12m</span></div>`;
        }).join('') || '<p class="empty">Type to search.</p>';
    };
    let shown = [];
    q.addEventListener('input', () => { shown = rankProducts(pool, q.value, ctx.a.soldUnits, 8); draw(shown); });
    res.addEventListener('click', e => { const o = e.target.closest('[data-id]'); if (o) { chosen = pool.find(p => p._id === o.dataset.id); draw(shown); } });
    draw([]);
    q.focus();
    const ok = await modalPromise;
    if (!ok || !chosen) return;
    st.extra.add(chosen._id); st.off.delete(chosen._id);
    renderNextOrder(ctx);
}

// One batch: a new line per product, or more on a line already planned for it and not ordered yet.
async function putOnList(ctx, sup, list, unitOf, qtyOf, planned) {
    if (!list.length) { toast('Tick at least one line with a quantity.', { bad: true }); return; }
    const sitting = list.filter(r => r.slow);
    const ok = await openModal({
        title: `Put ${plural(list.length, 'line', 'lines')} on the order list?`, confirmLabel: 'Put on the list',
        body: `<p>${plural(list.reduce((s, r) => s + qtyOf(r), 0), 'unit', 'units')} from ${esc(sup.label)}. They wait on the order list as “not ordered yet” until ${sup.key === KARCHER ? 'Kärcher’s confirmation is filed' : 'they arrive'}; stock changes only when the delivery is received.</p>
            ${sitting.length ? `<p style="color:var(--warn)">${plural(sitting.length, 'product is', 'products are')} already sitting on the shelf unsold: ${esc(sitting.map(r => r.p.name).join(', '))}.</p>` : ''}`
    });
    if (!ok) return;
    const now = Date.now(), batch = writeBatch(db);
    list.forEach(r => {
        const qty = qtyOf(r), u = unitOf(r);
        const same = planned.find(x => x.p && x.p._id === r.id);
        if (same) { batch.update(doc(db, 'toOrder', same.l._id), { quantity: (Number(same.l.quantity) || 0) + qty, estimatedCost: r2((Number(same.l.estimatedCost) || 0) + qty * (u ? u.v : 0)) }); return; }
        batch.set(doc(collection(db, 'toOrder')), {
            name: r.p.name, code: r.material || r.p.code || '', quantity: qty, supplier: r.p.producer || sup.label, quantityReceived: 0,
            smartSuggestion: !r.extra, urgency: r.stock <= 0 || r.lasts < RESTOCK_DAYS / 2 ? 'high' : 'medium',
            daysUntilStockout: Number.isFinite(r.lasts) ? Math.round(r.lasts) : null,
            reason: r.reasons.map(x => x.text).join('; '), estimatedCost: r2(qty * (u ? u.v : 0)),
            addedAt: now, productId: r.id, plannedAt: now, plannedIn: 'next-order'
        });
    });
    try {
        await batch.commit();
        st.qty.clear(); st.off.clear(); st.extra.clear();
        toast(`${plural(list.length, 'line', 'lines')} on the order list`);
        await ctx.reload();
    } catch (x) { toast(`Couldn't save: ${x.message}`, { bad: true }); }
}
