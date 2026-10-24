// Stock > Prices: what each product's price should be - from its cost, what the shop costs to run,
// how it has sold and how often people ask for it (pricing.js) - and the price changes made so
// far, with how the product sold before and after. Nothing changes a price without "Use".
//
// Writes: products/{id} {price, priceHistory: +{price, was, at, why}} on Use, and
// settings/pricing {kept: {id: suggested price}} on Keep (asked again once the suggestion changes).
import { db, doc, updateDoc, setDoc, writeBatch, arrayUnion } from './firebase.js';
import { esc, eur, int, icon, plural, day, fold, money2, toast, openModal } from './ui.js';
import { pricingBasis, priceReview, priceChanges, REASONS, historyEntry } from './pricing.js';
import { loadExtras, askedByProduct } from './dashboard-data.js';
import { easyposChanges, easyposDoneAt, printPriceList, markEntered } from './pricelist.js';

const pc = v => v === null || v === undefined || isNaN(v) ? '–' : `${Math.round(v * 100)}%`;
const signed = v => `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`;
// Whole-euro prices without cents: €1,850 reads faster than €1,850.00.
export const euro = v => Number.isInteger(Math.round(v * 100) / 100) ? `€${int(v)}` : `€${money2(v)}`;
const view = { filter: 'all', q: '', asked: null, loading: false };
const FILTERS = [['all', 'All'], ['floor'], ['check'], ['cost'], ['thin'], ['demand'], ['slow'], ['kept', 'Kept as they are']];

// What every suggestion stands on, in figures the owner can check (and change in Settings).
export function basisFacts(basis) {
    return `<div class="stat-grid six">
        <div><small>Running costs a month</small><b>${eur(basis.runningMonthly)}</b><span class="muted" style="display:block;font-size:11.5px">${basis.oneOffs ? `${eur(basis.repeating)} repeating + one-offs` : 'repeating costs'} · <a href="money.html#expenses" style="color:var(--violet-2)">Expenses</a></span></div>
        <div><small>Sales a month, net</small><b>${eur(basis.revenueMonthly)}</b><span class="muted" style="display:block;font-size:11.5px">${basis.months === 12 ? 'last 12 months' : `${new Date(basis.now).getFullYear()}, ${basis.months} whole months`}</span></div>
        <div><small>Running costs per € sold</small><b>${pc(basis.overhead)}</b><span class="muted" style="display:block;font-size:11.5px">below this, a sale loses money</span></div>
        <div><small>Profit asked</small><b>${pc(basis.minProfit)}</b><span class="muted" style="display:block;font-size:11.5px"><a href="settings.html#general" style="color:var(--violet-2)">Settings</a></span></div>
        <div><small>A sale should keep</small><b>${pc(basis.floorMargin)}</b><span class="muted" style="display:block;font-size:11.5px">of its net price, after the goods</span></div>
        <div><small>Shop's margin, 12 months</small><b>${pc(basis.shopMargin)}</b><span class="muted" style="display:block;font-size:11.5px">what sales really kept</span></div></div>`;
}

// The steps behind one suggestion, for "Why?" here, in Receive delivery and the product drawer.
export function explainPrice(sug, name, basis) {
    return openModal({
        title: sug.kind === 'keep' ? `${name}: keep ${euro(sug.price)}` : `${name}: ${euro(sug.price)}`, confirmLabel: 'OK', cancelLabel: 'Close',
        body: `<ol class="why-steps">${sug.steps.map(x => `<li>${esc(x.text)}</li>`).join('')}${sug.kind === 'keep' ? '<li>Within 2% of today\'s price, or no reason to change it: keep it.</li>' : ''}</ol>
            <div class="stat-grid" style="margin-bottom:10px"><div><small>Margin at ${euro(sug.price)}</small><b>${pc(sug.margin)}</b></div>
                <div><small>Lowest price that pays everything</small><b>${euro(sug.breakEven)}</b></div><div><small>With ${pc(basis.minProfit)} profit</small><b>${euro(sug.floor)}</b></div></div>
            <p class="empty" style="margin:0">Running costs are ${eur(basis.runningMonthly)} a month, ${pc(basis.overhead)} of the ${eur(basis.revenueMonthly)} the shop sells in a month. Prices include VAT; costs and margins are net of VAT.</p>`
    });
}

export function renderPrices(ctx) {
    const basis = pricingBasis(ctx.model, ctx.a);
    const { rows, noCost } = priceReview(basis, ctx.model.products, view.asked || new Map());
    const changes = priceChanges(basis, ctx.model.products);
    const open = rows.filter(r => !r.hidden);
    const losing = open.filter(r => r.reason === 'floor').length;
    ctx.setSub(open.length ? `${plural(open.length, 'price to look at', 'prices to look at')}${losing ? ` · <span style="color:var(--bad)">${int(losing)} lose${losing === 1 ? 's' : ''} money</span>` : ''}` : 'Every price covers its costs');
    const actions = ctx.setActions(`<span id="pr-all-slot"></span><button class="btn" type="button" id="pr-easypos">${icon('print')}EasyPOS price list</button>`);
    actions.querySelector('#pr-easypos').addEventListener('click', () => printPriceList(ctx.model));
    // Prices changed here that EasyPOS (the till) still has to get: it is never changed from here.
    const toType = easyposChanges(ctx.model), since = easyposDoneAt(ctx.model);
    const seen = toType.filter(c => c.seen).length;

    // The chatbot's questions say which models people want: read once per session (15 minutes).
    if (!view.asked && !view.loading) {
        view.loading = true;
        loadExtras(['events']).then(x => { view.asked = askedByProduct(ctx.model.products, x.events, ctx.a.now); })
            .catch(() => { view.asked = new Map(); })
            .finally(() => { view.loading = false; if (ctx.tab === 'prices') renderPrices(ctx); });
    }

    ctx.body.innerHTML = `
        ${toType.length ? `<div class="panel easypos-due">${icon('point_of_sale')}
            <div style="flex:1;min-width:240px"><b style="font-weight:500">${plural(toType.length, 'price', 'prices')} changed here${since ? ` since ${esc(day(since))}` : ''}: type ${toType.length === 1 ? 'it' : 'them'} into EasyPOS</b><br>
                <span class="muted">${seen ? `${int(seen)} already charged at the new price in EasyPOS. ` : ''}Print the list, enter the prices at the till, then mark them entered.</span></div>
            <button class="btn" type="button" id="pr-print">${icon('print')}Print the list</button>
            <button class="btn ghost" type="button" id="pr-entered">${icon('done_all')}They're in EasyPOS</button></div>` : ''}
        <section class="panel" style="display:grid;gap:12px">
            <h2 class="panel-title" style="margin:0">How prices are worked out</h2>
            ${basisFacts(basis)}
            <p class="empty" style="margin:0">Each suggestion starts from today's price (or, for a product without one, the margin similar products carry), adds up to 5% for what sells well at full price or is asked for on Instagram, takes a little off what is priced above its peers and has stood still for half a year, and never goes below the price that pays the cost, the running costs and the profit asked - after the discount the product usually gets.${view.loading ? ' <span class="muted">Reading the chatbot\'s questions…</span>' : ''}</p>
        </section>
        <div class="toolbar">
            <label class="field-search">${icon('search')}<input id="pr-q" type="search" placeholder="Product or code" value="${esc(view.q)}" aria-label="Search products"></label>
            <div class="filters" id="pr-filters" role="group" aria-label="Show"></div>
        </div>
        <div class="table-wrap" style="max-height:calc(100vh - 330px)"><table class="dt"><thead><tr><th>Product</th><th class="n">In stock</th><th class="n">Sold 12 m · 90 d</th><th class="n">Usual discount</th><th class="n">Now</th><th class="n">Suggested</th><th>Why</th><th></th></tr></thead>
            <tbody id="pr-body"></tbody></table>
            <div class="table-foot">Prices include VAT; costs and margins are net of VAT.${noCost ? ` ${plural(noCost, 'product has', 'products have')} no cost price, so no suggestion: <a href="stock.html?filter=nocost#catalogue" style="color:var(--violet-2)">enter them in the catalogue</a>.` : ''}
                A new price here doesn't change danfosal.com: after the next morning's sync, AI Commerce › Produktet shows the difference to fix there.</div></div>
        ${changes.length ? `<section class="table-wrap"><table class="dt ro"><thead><tr><th>Price changed here</th><th class="n">When</th><th class="n">Was</th><th class="n">Now</th><th>Why</th><th class="n">Sold before → since</th></tr></thead>
            <tbody>${changes.map(c => `<tr><td class="name"><b>${esc(c.p.name)}</b><span>${esc(c.p.code || '')}</span></td><td class="n muted">${esc(day(c.at))}</td>
                <td class="n muted">${c.was ? euro(c.was) : '–'}</td><td class="n">${euro(c.price)}</td><td class="muted" style="font-size:12.5px">${esc(c.why)}</td>
                <td class="n">${c.days < 14 ? '<span class="muted">too soon to tell</span>' : `${int(c.before)} → <b>${int(c.after)}</b> <span class="muted">in ${int(c.days)} days</span>${c.before >= 2 && c.after < c.before / 2 ? ' <span class="chip warn">selling less</span>' : ''}`}</td></tr>`).join('')}</tbody></table></section>` : ''}`;

    const $ = s => ctx.body.querySelector(s);
    const shown = () => {
        const terms = fold(view.q).trim().split(/\s+/).filter(Boolean);
        const hit = r => terms.every(t => fold(`${r.p.name} ${r.p.code || ''}`).includes(t));
        const list = rows.filter(hit);
        return { list, pick: list.filter(r => view.filter === 'kept' ? r.hidden : !r.hidden && (view.filter === 'all' || r.reason === view.filter)) };
    };
    const draw = () => {
        const { list, pick } = shown();
        $('#pr-filters').innerHTML = FILTERS.map(([id, label]) => {
            const n = id === 'kept' ? list.filter(r => r.hidden).length : list.filter(r => !r.hidden && (id === 'all' || r.reason === id)).length;
            if (!n && id !== 'all' && id !== view.filter) return '';
            return `<button class="filter${id === 'floor' || id === 'check' ? ' alert' : ''}" type="button" data-f="${id}" aria-pressed="${id === view.filter}">${esc(label || REASONS[id][0])}<span class="n">${int(n)}</span></button>`;
        }).join('');
        $('#pr-body').innerHTML = pick.map(r => {
            const [label, chip] = REASONS[r.reason] || ['', ''];
            const decisive = r.steps.filter(x => x.key !== 'start').pop() || r.steps[0];
            return `<tr data-id="${esc(r.p._id)}" style="cursor:default">
                <td class="name"><b>${esc(r.p.name)}</b><span>${esc([r.p.code, r.family].filter(Boolean).join(' · '))}</span></td>
                <td class="n ${Number(r.p.stock) > 0 ? '' : 'zero'}">${int(Number(r.p.stock) || 0)}</td>
                <td class="n">${r.units12 ? int(r.units12) : '<span class="muted">0</span>'} <span class="muted">· ${int(r.units90)}</span>${r.asked ? `<span class="sub-n">${plural(r.asked, 'chatbot question', 'chatbot questions')}</span>` : ''}</td>
                <td class="n ${r.discount >= 0.1 ? 'zero' : 'muted'}">${r.discount ? '−' + pc(r.discount) : '–'}</td>
                <td class="n">${euro(r.current)}<span class="sub-n">${pc(r.currentMargin)} margin</span></td>
                <td class="n"><b>${euro(r.price)}</b><span class="sub-n">${pc(r.margin)} · <span class="${r.change > 0 ? '' : 'ok-t'}">${signed(r.change)}</span></span></td>
                <td class="why"><span class="chip ${chip}">${esc(label)}</span> <button class="btn ghost small" type="button" data-why="${esc(r.p._id)}">Why?</button><span class="t">${esc(decisive.text)}</span></td>
                <td class="n"><div class="row-acts">${r.reason === 'check'
                    ? `<a class="btn small" href="stock.html?q=${encodeURIComponent(r.p.name)}#catalogue">${icon('edit')}Check cost</a>`
                    : `<button class="btn ${r.hidden ? '' : 'money '}small" type="button" data-use="${esc(r.p._id)}">Use ${euro(r.price)}</button>`}
                    ${r.hidden ? '' : `<button class="btn ghost small" type="button" data-keep="${esc(r.p._id)}" title="Keep ${euro(r.current)}; asked again only if the suggestion changes">Keep</button>`}</div></td></tr>`;
        }).join('') || `<tr><td colspan="8" style="padding:0"><div class="all-clear" style="border-radius:0">${icon('check_circle')}<div><b>${view.filter === 'kept' ? 'No suggestion kept as it was.' : 'Nothing to change here.'}</b><br><span>${view.filter === 'all' ? 'Every price covers its cost, the running costs and the profit asked.' : 'Pick another filter above.'}</span></div></div></td></tr>`;
        const many = view.filter !== 'all' && view.filter !== 'kept' && view.filter !== 'check' ? pick : [];
        actions.querySelector('#pr-all-slot').innerHTML = many.length > 1 ? `<button class="btn money" type="button" id="pr-all">${icon('done_all')}Use all ${int(many.length)} shown</button>` : '';
        const all = actions.querySelector('#pr-all');
        if (all) all.addEventListener('click', () => useAll(ctx, many));
    };
    draw();

    $('#pr-print')?.addEventListener('click', () => printPriceList(ctx.model));
    $('#pr-entered')?.addEventListener('click', () => markEntered(ctx, toType.length));
    $('#pr-q').addEventListener('input', e => { view.q = e.target.value; draw(); });
    $('#pr-filters').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { view.filter = b.dataset.f; draw(); } });
    $('#pr-body').addEventListener('click', async e => {
        const why = e.target.closest('[data-why]'), use = e.target.closest('[data-use]'), keep = e.target.closest('[data-keep]');
        const r = rows.find(x => x.p._id === (why || use || keep || {}).dataset?.[why ? 'why' : use ? 'use' : 'keep']);
        if (!r) return;
        if (why) return explainPrice(r, r.p.name, basis);
        const b = use || keep; b.disabled = true;
        try {
            if (use) {
                await updateDoc(doc(db, 'products', r.p._id), { price: r.price, priceHistory: arrayUnion(historyEntry(r.price, r.current, `Stock › Prices: ${REASONS[r.reason][0].toLowerCase()}`)) });
                toast(`${r.p.name}: ${euro(r.current)} → ${euro(r.price)}. It's on the EasyPOS list.`);
            } else {
                await setDoc(doc(db, 'settings', 'pricing'), { kept: { [r.p._id]: r.price } }, { merge: true });
                toast(`${r.p.name} keeps ${euro(r.current)}. Asked again only if the suggestion changes.`);
            }
            await ctx.reload();
        } catch (err) { b.disabled = false; toast(`Couldn't save: ${err.message}`, { bad: true }); }
    });
}

async function useAll(ctx, list) {
    const ok = await openModal({
        title: `Change ${plural(list.length, 'price', 'prices')}?`, confirmLabel: 'Change them', confirmClass: 'money',
        body: `<div class="lines" style="max-height:300px;overflow:auto">${list.map(r => `<div class="line"><div><b>${esc(r.p.name)}</b><span>${esc(REASONS[r.reason][0])}</span></div><span class="n">${euro(r.current)} → <b>${euro(r.price)}</b></span></div>`).join('')}</div>
            <p class="empty" style="margin:8px 0 0">Each one is kept in the product's price history. You can change any of them again in the catalogue.</p>`
    });
    if (!ok) return;
    try {
        // A batch holds 500 writes; this list is never near that.
        const batch = writeBatch(db);
        list.forEach(r => batch.update(doc(db, 'products', r.p._id), { price: r.price, priceHistory: arrayUnion(historyEntry(r.price, r.current, `Stock › Prices: ${REASONS[r.reason][0].toLowerCase()}`)) }));
        await batch.commit();
        toast(`${plural(list.length, 'price', 'prices')} changed. They're on the EasyPOS list.`);
        await ctx.reload();
    } catch (err) { toast(`Couldn't save: ${err.message}`, { bad: true }); }
}

// Products that lose money at today's price, for the Stock tab's count.
export function losingCount(a, m) {
    try { return priceReview(pricingBasis(m, a), m.products).rows.filter(r => r.reason === 'floor' && !r.hidden).length; }
    catch { return 0; }
}
