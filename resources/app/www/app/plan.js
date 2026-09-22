// Stock > Yearly plan: make next year's purchase plan, then watch it against real sales.
//
// Numbers live in planmodel.js. A plan is saved as predictions/{year}-plan (version 2) next to the
// classic plans, which stay readable. During the year each product shows planned vs actual sales
// to date, the pace, and what the rest of the year needs at that pace - so "selling faster than
// planned, order more" (or slower, order less) shows up here and on Today, without opening the plan.
import { db, doc, setDoc } from './firebase.js';
import { esc, eur, int, icon, plural, fold, money2, toast, openDrawer, openModal } from './ui.js';
import { buildPlan, mergePlan, trackPlan, planFor, waitingByProduct, basisMonths, basisFromYears, salesYears, netOrders, monthName, PACE_FAST, PACE_SLOW } from './planmodel.js';

const STATUS = {
    out: ['Out of stock', 'bad'], low: ['Will run short', 'bad'], faster: ['Selling faster', 'warn'],
    slower: ['Selling slower', 'vio'], on: ['On plan', 'ok'], future: ['Not started', ''], done: ['Year ended', '']
};
const pl = { year: null, filter: 'attention', q: '', sel: new Set() };
const sum = a => a.reduce((x, y) => x + y, 0);

function advice(r) {
    const more = r.diff > 0, n = Math.abs(r.diff);
    if (r.status === 'out') return `Out of stock and still selling: order ${int(Math.max(1, r.needNow))} now.`;
    if (r.status === 'low') return `Stock won't last until a restock arrives (~6 weeks): order ${int(Math.max(1, r.needNow))} now.`;
    if (r.status === 'faster') return `Selling ${Math.round((r.pace - 1) * 100)}% faster than planned: at this pace the rest of the year needs ${int(r.needNow)} more, ${more ? `${int(n)} above` : 'within'} what the plan still orders (${int(r.plannedOrdersLeft)}).`;
    if (r.status === 'slower') return `Selling ${Math.round((1 - r.pace) * 100)}% slower than planned: the rest of the year needs ${int(r.needNow)}, ${!more ? `${int(n)} fewer than` : 'about'} the ${int(r.plannedOrdersLeft)} the plan still orders. Cut or delay the next order.`;
    return '';
}

export function renderPlan(ctx) {
    const m = ctx.model, now = ctx.a.now, thisYear = new Date(now).getFullYear();
    const plans = (m.predictions || []).filter(p => p.version === 2).sort((a, b) => b.year - a.year);
    const legacy = (m.predictions || []).filter(p => p.version !== 2);
    if (pl.year === null) pl.year = planFor(m, thisYear) ? thisYear : plans[0]?.year ?? thisYear;
    const plan = planFor(m, pl.year);
    const years = [...new Set([thisYear, thisYear + 1, ...plans.map(p => p.year)])].sort();

    const actions = ctx.setActions(`<div class="seg" role="group" aria-label="Plan year">${years.map(y => `<button type="button" data-y="${y}" aria-pressed="${y === pl.year}">${y}${planFor(m, y) ? '' : ' ·'}</button>`).join('')}</div>
        ${plan ? `<button class="btn" type="button" id="pl-copy">${icon('content_copy')}Copy order plan</button>` : ''}
        <button class="btn ${plan ? '' : 'primary'}" type="button" id="pl-make">${icon(plan ? 'refresh' : 'add')}${plan ? 'Remake plan' : `Make the ${pl.year} plan`}</button>`);
    actions.querySelectorAll('[data-y]').forEach(b => b.addEventListener('click', () => { pl.year = Number(b.dataset.y); renderPlan(ctx); }));
    actions.querySelector('#pl-make').addEventListener('click', () => makePlanDialog(ctx, pl.year, plan, null));
    if (plan) actions.querySelector('#pl-copy').addEventListener('click', () => copyPlan(plan));

    if (!plan) {
        ctx.setSub(`No ${pl.year} plan yet`);
        const basis = basisMonths(m, pl.year);
        ctx.body.innerHTML = `
            <div class="panel" style="display:grid;gap:10px;max-width:760px">
                <h2 class="panel-title" style="margin:0">Plan ${pl.year}: what to buy, month by month</h2>
                <p class="empty" style="margin:0">The plan takes what each product sold in the same month a year earlier (${esc(basis.filter(b => b.kind !== 'none').map(b => b.label).slice(0, 3).join(', '))}…), adds your growth, and works out the deliveries needed on top of your stock and what's already on the order list, keeping half a month of sales as a buffer.</p>
                <p class="empty" style="margin:0">Then, all year, it compares real sales with the plan. When a product sells faster or slower than planned, it tells you to order more or less, here and on Today.</p>
                ${basis.some(b => b.kind === 'gap') ? `<p class="empty" style="margin:0;color:var(--warn)">${icon('info')} ${basis.filter(b => b.kind === 'gap').map(b => b.label).join(', ')} only has till sales (incomplete), so those months will be planned low. You can raise individual products after making the plan.</p>` : ''}
                <div><button class="btn primary" type="button" id="pl-make2">${icon('add')}Make the ${pl.year} plan</button></div>
            </div>
            ${legacy.length ? `<section class="panel"><h2 class="panel-title">Plans made with the classic page</h2><div class="lines">${legacy.map(p => `<div class="line"><div><b>${esc(String(p.year))} · ${esc(p.supplier || 'All')}</b><span>${plural((p.products || []).length, 'product', 'products')} · made ${p.generatedDate ? esc(new Date(p.generatedDate).toLocaleDateString('en-GB')) : '–'} · ${Math.round((p.growthRate || 0) * 100)}% growth</span></div><span class="n">${eur(sum((p.products || []).map(x => Number(x.totalCost) || 0)))}</span></div>`).join('')}</div>
                <p class="chart-note" style="margin-top:8px">They stored order quantities only (and costs including VAT), so they can't be tracked against sales. Make a plan above to get tracking.</p></section>` : ''}`;
        ctx.body.querySelector('#pl-make2').addEventListener('click', () => makePlanDialog(ctx, pl.year, null, null));
        return;
    }

    const t = trackPlan(m, plan, { now, waitingByProduct: waitingByProduct(m) });
    const rows = t.rows;
    const value = sum(plan.products.map(r => r.totalCost));
    const paceAll = t.plannedToDate >= 1 ? t.actualToDate / t.plannedToDate : null;
    ctx.setSub(`${plural(plan.products.length, 'product', 'products')} · ${eur(value)} planned purchases (net) · from ${esc((plan.basisYears || []).length ? plan.basisYears.join(' + ') : 'the year before')} ${plan.growthRate ? `${plan.growthRate > 0 ? '+' : ''}${Math.round(plan.growthRate * 100)}%` : ''} · made ${new Date(plan.generatedAt).toLocaleDateString('en-GB')}`);
    const decide = new Set(t.attention.map(r => r.id));   // same rule as Today's alert: the order really changes
    const FILTERS = [['attention', 'Needs a decision', r => decide.has(r.id)], ['faster', 'Selling faster', r => r.status === 'faster'],
        ['slower', 'Selling slower', r => r.status === 'slower'], ['short', 'Short of stock', r => ['out', 'low'].includes(r.status)], ['on', 'On plan', r => r.status === 'on'], ['all', 'All', () => true]];
    const order = { out: 0, low: 1, faster: 2, slower: 3, on: 4, future: 5, done: 6 };

    ctx.body.innerHTML = `
        <div class="kpis">
            <div class="kpi"><small>Sales vs plan, ${esc(String(plan.year))} to date</small><span class="v" style="${paceAll !== null && paceAll < PACE_SLOW ? 'color:var(--warn)' : ''}">${paceAll === null ? '–' : Math.round(paceAll * 100) + '%'}</span><span class="d">${int(Math.round(t.actualToDate))} units sold of ${int(Math.round(t.plannedToDate))} planned so far</span></div>
            <div class="kpi"><small>Selling faster</small><span class="v">${int(rows.filter(r => r.status === 'faster').length)}</span><span class="d">products ${Math.round((PACE_FAST - 1) * 100)}%+ ahead of plan</span></div>
            <div class="kpi"><small>Selling slower</small><span class="v">${int(rows.filter(r => r.status === 'slower').length)}</span><span class="d">products ${Math.round((1 - PACE_SLOW) * 100)}%+ behind plan</span></div>
            <div class="kpi"><small>Short of stock</small><span class="v" style="${rows.some(r => ['out', 'low'].includes(r.status)) ? 'color:var(--bad)' : ''}">${int(rows.filter(r => ['out', 'low'].includes(r.status)).length)}</span><span class="d">won't last until a restock</span></div>
        </div>
        ${plan.basis && plan.basis.some(b => b.kind === 'gap') ? `<p class="empty" style="margin:0">${icon('info')} Planned from ${esc(plan.basis.map(b => b.label).filter((l, i, a) => a.indexOf(l) === i && l !== '–').join(', '))}. ${esc(plan.basis.filter(b => b.kind === 'gap').map(b => b.label).join(', '))} had only till sales, so those months are planned low.</p>` : ''}
        ${t.unplanned.length ? `<div class="panel" style="padding:12px 16px"><b style="font-weight:500">${t.unplanned.length === 1 ? '1 product sells this year but isn’t' : `${int(t.unplanned.length)} products sell this year but aren’t`} in the plan:</b> <span class="muted">${t.unplanned.slice(0, 6).map(u => `${esc(u.product.name)} (${int(u.sold)})`).join(', ')}${t.unplanned.length > 6 ? '…' : ''}. Remake the plan to include them.</span></div>` : ''}
        <div class="toolbar">
            <label class="field-search">${icon('search')}<input id="pl-q" type="search" placeholder="Product or code" value="${esc(pl.q)}" aria-label="Search the plan"></label>
            <div class="filters" id="pl-f"></div>
        </div>
        <div id="pl-bulk"></div>
        <div class="table-wrap" style="max-height:calc(100vh - 360px)"><table class="dt"><thead><tr><th class="tick"><input type="checkbox" id="pl-all" aria-label="Select every product shown"></th><th>Product</th><th class="n">Planned ${esc(String(plan.year))}</th><th class="n">Sold so far</th><th>Pace vs plan</th><th class="n">Stock + on order</th><th class="n">Plan still orders</th><th class="n">Needed at this pace</th><th>Status</th></tr></thead><tbody id="pl-body"></tbody></table></div>`;

    const draw = () => {
        const terms = fold(pl.q).trim().split(/\s+/).filter(Boolean);
        const searched = rows.filter(r => { const hay = fold(`${r.name} ${r.code}`); return terms.every(x => hay.includes(x)); });
        drawBulk();
        ctx.body.querySelector('#pl-f').innerHTML = FILTERS.map(([id, label, f]) => `<button class="filter${id === 'attention' || id === 'short' ? ' alert' : ''}" type="button" data-f="${id}" aria-pressed="${id === pl.filter}">${esc(label)}<span class="n">${int(searched.filter(f).length)}</span></button>`).join('');
        const f = FILTERS.find(x => x[0] === pl.filter) || FILTERS[0];
        const list = searched.filter(f[2]).sort((a, b) => order[a.status] - order[b.status] || Math.abs(b.diff * b.unitCost) - Math.abs(a.diff * a.unitCost));
        shown = list;
        ctx.body.querySelector('#pl-body').innerHTML = list.map(r => {
            const w = r.pace === null ? 0 : Math.min(100, r.pace / 2 * 100), col = r.pace === null ? 'var(--faint)' : r.pace >= PACE_FAST ? 'var(--warn)' : r.pace <= PACE_SLOW ? 'var(--violet-2)' : 'var(--ok)';
            return `<tr data-id="${esc(r.id)}" tabindex="0"${pl.sel.has(r.id) ? ' class="sel"' : ''}>
                <td class="tick"><input type="checkbox" data-tick="${esc(r.id)}"${pl.sel.has(r.id) ? ' checked' : ''} aria-label="Select ${esc(r.name)}"></td>
                <td class="name"><b>${esc(r.name)}</b><span>${esc(r.code)}</span></td>
                <td class="n">${int(r.plannedYear)}</td>
                <td class="n">${int(r.actualToDate)} <span class="muted">/ ${int(Math.round(r.plannedToDate))}</span></td>
                <td><span class="cover"><span class="bar"><i style="width:${w.toFixed(1)}%;background:${col}"></i><u style="left:50%"></u></span><span class="muted">${r.pace === null ? '–' : Math.round(r.pace * 100) + '%'}</span></span></td>
                <td class="n ${r.stock <= 0 ? 'zero' : ''}">${int(r.stock)}${r.waiting ? ` <span class="muted">+${int(r.waiting)}</span>` : ''}</td>
                <td class="n muted">${int(r.plannedOrdersLeft)}</td>
                <td class="n">${int(r.needNow)}${Math.abs(r.diff) >= 1 && r.status !== 'on' ? ` <span class="chip ${r.diff > 0 ? 'warn' : 'vio'}">${r.diff > 0 ? '+' : '−'}${int(Math.abs(r.diff))}</span>` : ''}</td>
                <td><span class="chip ${STATUS[r.status][1]}">${STATUS[r.status][0]}</span></td></tr>`;
        }).join('') || `<tr><td colspan="9" class="muted" style="padding:18px">${pl.filter === 'attention' ? 'Nothing needs a decision: every product is selling roughly as planned.' : 'No products here.'}</td></tr>`;
        const all = ctx.body.querySelector('#pl-all');
        if (all) all.checked = list.length > 0 && list.every(r => pl.sel.has(r.id));
    };
    let shown = [];
    function drawBulk() {
        const bar = ctx.body.querySelector('#pl-bulk');
        const n = pl.sel.size;
        bar.innerHTML = n ? `<div class="panel" style="padding:10px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <b style="font-weight:500">${plural(n, 'product', 'products')} ticked</b>
            <span class="muted" style="font-size:12.5px">${esc([...pl.sel].map(id => (rows.find(r => r.id === id) || {}).name).filter(Boolean).slice(0, 4).join(', '))}${n > 4 ? '…' : ''}</span>
            <button class="btn small primary" type="button" id="pl-sel-make" style="margin-left:auto">${icon('event_note')}Plan these products…</button>
            <button class="btn small ghost" type="button" id="pl-sel-clear">Clear</button></div>` : '';
        if (!n) return;
        bar.querySelector('#pl-sel-make').addEventListener('click', () => makePlanDialog(ctx, pl.year, plan, [...pl.sel]));
        bar.querySelector('#pl-sel-clear').addEventListener('click', () => { pl.sel.clear(); draw(); });
    }
    draw();
    ctx.body.querySelector('#pl-q').addEventListener('input', e => { pl.q = e.target.value; draw(); });
    ctx.body.querySelector('#pl-f').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { pl.filter = b.dataset.f; draw(); } });
    const open = e => {
        if (e.target.closest('.tick')) return;                       // ticking a box must not open the panel
        const tr = e.target.closest('tr[data-id]'); if (tr) productPlanDrawer(ctx, plan, rows.find(r => r.id === tr.dataset.id));
    };
    ctx.body.querySelector('#pl-body').addEventListener('change', e => {
        const t = e.target.closest('[data-tick]'); if (!t) return;
        if (t.checked) pl.sel.add(t.dataset.tick); else pl.sel.delete(t.dataset.tick);
        t.closest('tr').classList.toggle('sel', t.checked);
        drawBulk();
        const all = ctx.body.querySelector('#pl-all');
        all.checked = shown.length > 0 && shown.every(r => pl.sel.has(r.id));
    });
    ctx.body.querySelector('#pl-all').addEventListener('change', e => {
        shown.forEach(r => (e.target.checked ? pl.sel.add(r.id) : pl.sel.delete(r.id)));
        draw();
    });
    ctx.body.querySelector('#pl-body').addEventListener('click', open);
    ctx.body.querySelector('#pl-body').addEventListener('keydown', e => { if (e.key === 'Enter') open(e); });
}

// Planned vs actual month by month, and changing the plan for one product.
function productPlanDrawer(ctx, plan, r) {
    const max = Math.max(1, ...r.demand, ...r.actual);
    const W = 460, H = 150, bw = W / 12;
    const bars = r.demand.map((d, i) => {
        const x = i * bw, hp = d / max * (H - 30), ha = r.actual[i] / max * (H - 30), past = i < t0(plan);
        return `<rect x="${x + 4}" y="${H - 18 - hp}" width="${bw / 2 - 5}" height="${hp}" fill="#3b3f6e" rx="2"><title>${monthName(i)}: planned ${d}</title></rect>
            ${past || i === t0(plan) ? `<rect x="${x + bw / 2}" y="${H - 18 - ha}" width="${bw / 2 - 5}" height="${ha}" fill="${r.actual[i] >= d ? '#8b5cf6' : '#b4a3ff'}" rx="2"><title>${monthName(i)}: sold ${r.actual[i]}</title></rect>` : ''}
            <text x="${x + bw / 2}" y="${H - 4}" text-anchor="middle" class="ax">${monthName(i)}</text>`;
    }).join('');
    const { el, close } = openDrawer({
        title: esc(r.name), sub: `${esc(r.code)} · plan ${plan.year} · ${esc(STATUS[r.status][0])}`,
        body: `
            <div class="kv"><div><small>Planned for the year</small><b>${int(r.plannedYear)}</b></div><div><small>Sold so far</small><b>${int(r.actualToDate)} of ${int(Math.round(r.plannedToDate))}</b></div><div><small>At this pace, year end</small><b>${int(r.projectedYear)}</b></div></div>
            ${advice(r) ? `<p style="margin:0">${esc(advice(r))}</p>` : ''}
            <section><h3>Planned (dark) and sold (violet), per month</h3><div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Planned and actual sales per month">${bars}</svg></div></section>
            ${(r.basisYears || []).length ? `<section><h3>Worked out from</h3><p class="empty" style="margin:0">${esc(r.basisYears.join(' and '))}, averaged per month${r.growth ? `, then ${r.growth > 0 ? '+' : ''}${Math.round(r.growth * 100)}%` : ''}: ${r.demand.map((d, i) => `${monthName(i)} ${(r.basisText && r.basisText[i]) || '?'} → ${d}`).slice(0, 12).join(' · ')}</p></section>` : ''}
            <section><h3>Deliveries the plan puts in each month</h3><p class="empty" style="margin:0">${r.orders.map((o, i) => o ? `${monthName(i)} ${o}` : '').filter(Boolean).join(' · ') || 'None: stock covers the year.'}. Order about 6 weeks before.</p></section>
            <form class="form-grid" novalidate><label class="fld">Planned sales for the year<input id="pp-year" type="number" min="0" step="1" value="${r.plannedYear}"><span class="hint">Months keep their shape; deliveries are recalculated.</span></label>
                <label class="fld">Cost each (net)<input value="€${money2(r.unitCost)}" disabled></label></form>`,
        foot: `<button class="btn primary" type="button" id="pp-save">${icon('check')}Save to the plan</button>
            <button class="btn" type="button" id="pp-rebuild">${icon('refresh')}Re-plan this product…</button>
            <button class="btn ghost" type="button" id="pp-remove" style="margin-left:auto">Remove from plan</button>`
    });
    el.querySelector('#pp-save').addEventListener('click', async () => {
        const target = Math.max(0, Math.round(Number(el.querySelector('#pp-year').value) || 0));
        if (target === r.plannedYear) return close();
        const scale = r.plannedYear ? target / r.plannedYear : 0;
        let demand = r.demand.map(d => Math.round(d * scale));
        if (!r.plannedYear && target) demand = Array(12).fill(0).map((_, i) => Math.floor(target / 12) + (i < target % 12 ? 1 : 0));
        const diff = target - sum(demand); if (diff) { const i = demand.indexOf(Math.max(...demand)); demand[i] = Math.max(0, demand[i] + diff); }
        await savePlanRow(ctx, plan, r.id, row => {
            const { orders, safety } = netOrders(demand, row.openingStock, plan.startMonth || 0);
            const totalToOrder = sum(orders);
            return { ...row, demand, orders, safety, totalToOrder, totalCost: Math.round(totalToOrder * row.unitCost * 100) / 100 };
        }, `${r.name}: ${target} planned for ${plan.year}`, close);
    });
    el.querySelector('#pp-rebuild').addEventListener('click', () => { close(); makePlanDialog(ctx, plan.year, plan, [r.id]); });
    el.querySelector('#pp-remove').addEventListener('click', async () => {
        if (!await openModal({ title: `Remove ${r.name} from the plan?`, confirmLabel: 'Remove', body: '<p>It will no longer be tracked or counted in the planned purchases.</p>' })) return;
        await savePlanRow(ctx, plan, r.id, () => null, `${r.name} removed from the plan`, close);
    });
}
const t0 = plan => { const d = new Date(); return d.getFullYear() === plan.year ? d.getMonth() : d.getFullYear() > plan.year ? 12 : -1; };

async function savePlanRow(ctx, plan, id, change, message, close) {
    const products = plan.products.map(row => (row.id === id ? change(row) : row)).filter(Boolean);
    try {
        await setDoc(doc(db, 'predictions', `${plan.year}-plan`), { ...stripLocal(plan), products, editedAt: Date.now() });
        toast(message); close(); await ctx.reload();
    } catch (e) { toast(`Couldn't save: ${e.message}`, { bad: true }); }
}
const stripLocal = p => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith('_')));

const yearState = { years: null, ignorePartial: true };

async function makePlanDialog(ctx, year, existing, ids) {
    const m = ctx.model;
    const available = salesYears(m).filter(y => y.year < year);
    if (!available.length) { toast('No past sales to plan from.', { bad: true }); return; }
    if (!yearState.years) yearState.years = (existing && existing.basisYears && existing.basisYears.length ? existing.basisYears : [available[0].year]).filter(y => available.some(a => a.year === y));
    if (!yearState.years.length) yearState.years = [available[0].year];
    const producers = [...new Set(m.products.map(p => p.producer).filter(Boolean).map(x => x.trim()))].sort();
    // Which products to plan: the ticked ones, or everything that sold in the chosen years.
    let picked = ids ? new Set(ids) : null;
    const nameOf = id => (m.products.find(p => p._id === id) || {}).name || id;

    const modalPromise = openModal({
        title: picked ? `Plan ${plural(picked.size, 'product', 'products')} for ${year}` : `Make the ${year} plan`,
        confirmLabel: picked ? 'Plan these products' : existing ? 'Remake plan' : 'Make plan',
        body: `${existing && !picked ? '<p>This replaces the whole plan, including changes you made to it. To redo only some products, tick them in the table first.</p>' : ''}
            ${picked ? `<p>Only these products change; the rest of the plan stays as it is.<br><span class="muted">${esc([...picked].map(nameOf).slice(0, 8).join(', '))}${picked.size > 8 ? '…' : ''}</span></p>` : ''}
            <div><b style="font-weight:500">Take last year's sales from</b>
                <p class="empty" style="margin:2px 0 6px">Tick one or more years. With several, each month is the average of those years.</p>
                <div class="filters" id="mp-years">${available.map(y => `<button class="filter" type="button" data-y="${y.year}" aria-pressed="${yearState.years.includes(y.year)}">${y.year}<span class="n">${y.recorded}/12 months</span></button>`).join('')}</div>
                <p class="empty" id="mp-note" style="margin:6px 0 0"></p></div>
            <div class="form-grid">
                <label class="fld">Growth on that (%)<input id="mp-g" type="number" step="1" value="${existing ? Math.round((existing.growthRate || 0) * 100) : 10}"><span class="hint">10 means 10% more than the years above.</span></label>
                ${picked ? '' : `<label class="fld">Products from<select id="mp-s"><option>All</option>${producers.map(x => `<option${existing && existing.supplier === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`}
            </div>
            ${picked ? '' : `<label class="check"><input type="checkbox" id="mp-choose"><span><b style="font-weight:500">Choose the products myself</b><br><span class="empty" style="padding:0">Otherwise every product that sold in those years is planned.</span></span></label>
            <div id="mp-picker" hidden>
                <label class="field-search" style="max-width:none">${icon('search')}<input id="mp-q" type="search" placeholder="Search products" aria-label="Search products"></label>
                <div class="results" id="mp-list" style="max-height:220px;overflow:auto"></div>
                <p class="empty" id="mp-count" style="margin:4px 0 0"></p></div>`}
            <label class="check"><input type="checkbox" id="mp-partial" ${yearState.ignorePartial ? 'checked' : ''}><span><b style="font-weight:500">Skip months that were only partly recorded</b><br><span class="empty" style="padding:0">Dec 2025 and Jan 2026 only have till sales; using them would plan those months too low.</span></span></label>
            <p class="empty" id="mp-preview" style="margin:0"></p>`,
        validate: () => !yearState.years.length ? 'Tick at least one year.' : (picked && !picked.size) ? 'Tick at least one product.' : ''
    });
    const w = [...document.querySelectorAll('.modal-backdrop')].pop();
    const $ = sel => w.querySelector(sel);
    const growth = () => (Number($('#mp-g').value) || 0) / 100;

    // Live preview: the first ticked product, month by month, exactly as it will be planned.
    const refresh = () => {
        $('#mp-years').querySelectorAll('[data-y]').forEach(b => b.setAttribute('aria-pressed', yearState.years.includes(Number(b.dataset.y))));
        const basis = basisFromYears(m, yearState.years, { ignorePartial: yearState.ignorePartial });
        const gaps = basis.filter(b => b.kind !== 'ok');
        $('#mp-note').innerHTML = yearState.years.length ? `Months come from: ${esc(basis.map(b => b.label).join(', '))}.${gaps.length ? ` <span style="color:var(--warn)">${esc(gaps.map(b => b.label).join(', '))} ${gaps.length === 1 ? 'was' : 'were'} only partly recorded.</span>` : ''}` : '';
        const sample = picked ? [...picked][0] : null;
        const prev = $('#mp-preview');
        if (sample && yearState.years.length) {
            const one = buildPlan(m, { year, growth: growth(), years: yearState.years, productIds: [sample], ignorePartial: yearState.ignorePartial, waitingByProduct: waitingByProduct(m) }).products[0];
            prev.innerHTML = one ? `<b style="color:var(--ink);font-weight:500">${esc(one.name)}</b>: ${one.demand.map((d, i) => `${monthName(i)} ${one.basisText[i]}→${d}`).join(' · ')}<br>Planned sales ${int(one.demand.reduce((a, b) => a + b, 0))}, deliveries ${int(one.totalToOrder)} (${eur(one.totalCost)}).` : '';
        } else prev.textContent = '';
    };
    $('#mp-years').addEventListener('click', e => {
        const b = e.target.closest('[data-y]'); if (!b) return;
        const y = Number(b.dataset.y);
        if (yearState.years.includes(y)) yearState.years = yearState.years.filter(x => x !== y); else yearState.years.push(y);
        refresh();
    });
    $('#mp-g').addEventListener('input', refresh);
    $('#mp-partial').addEventListener('change', e => { yearState.ignorePartial = e.target.checked; refresh(); });
    if ($('#mp-choose')) {
        const box = $('#mp-picker'), list = $('#mp-list'), count = $('#mp-count');
        const candidates = () => {
            const q = fold($('#mp-q').value).trim();
            return m.products.filter(p => !q || fold(`${p.name} ${p.code || ''}`).includes(q)).slice(0, 200);
        };
        const drawList = () => {
            list.innerHTML = candidates().map(p => `<label class="res" style="grid-template-columns:auto minmax(0,1fr) 90px;cursor:pointer"><input type="checkbox" data-p="${esc(p._id)}"${picked && picked.has(p._id) ? ' checked' : ''}><div><b>${esc(p.name)}</b><span class="sub">${esc(p.code || '')}</span></div><span class="stk">${int(Number(p.stock) || 0)} in stock</span></label>`).join('') || '<p class="empty">No product matches.</p>';
            count.textContent = picked ? `${picked.size} ticked` : '';
        };
        $('#mp-choose').addEventListener('change', e => {
            box.hidden = !e.target.checked;
            picked = e.target.checked ? new Set() : null;
            if (e.target.checked) drawList();
            refresh();
        });
        $('#mp-q').addEventListener('input', drawList);
        list.addEventListener('change', e => {
            const t = e.target.closest('[data-p]'); if (!t || !picked) return;
            if (t.checked) picked.add(t.dataset.p); else picked.delete(t.dataset.p);
            count.textContent = `${picked.size} ticked`;
            refresh();
        });
    }
    refresh();

    const ok = await modalPromise;
    if (!ok) return;
    const g = growth(), supplier = $('#mp-s') ? $('#mp-s').value : (existing ? existing.supplier : 'All');
    const fresh = buildPlan(m, { year, growth: g, supplier, years: yearState.years, productIds: picked ? [...picked] : null,
        ignorePartial: yearState.ignorePartial, waitingByProduct: waitingByProduct(m) });
    if (!fresh.products.length) { toast('None of those products sold in the years you picked.', { bad: true }); return; }
    const doc2 = picked && existing ? mergePlan(existing, fresh) : fresh;
    try {
        await setDoc(doc(db, 'predictions', `${year}-plan`), stripLocal(doc2));
        toast(picked ? `${plural(fresh.products.length, 'product', 'products')} planned for ${year}` : `${year} plan made: ${plural(fresh.products.length, 'product', 'products')}, ${eur(sum(fresh.products.map(r => r.totalCost)))} of purchases`);
        pl.year = year; pl.sel.clear(); if (!picked) pl.filter = 'all';
        await ctx.reload();
    } catch (e) { toast(`Couldn't save the plan: ${e.message}`, { bad: true }); }
}

// Month-by-month order plan as text, for the supplier or a spreadsheet.
async function copyPlan(plan) {
    const lines = [];
    for (let i = 0; i < 12; i++) {
        const items = plan.products.filter(r => r.orders[i] > 0);
        if (!items.length) continue;
        lines.push(`${monthName(i)} ${plan.year} (order ~6 weeks before)`);
        items.forEach(r => lines.push(`  ${r.code ? r.code + '  ' : ''}${r.name}  x ${r.orders[i]}`));
        lines.push('');
    }
    try { await navigator.clipboard.writeText(lines.join('\n') || 'Nothing to order.'); toast('Order plan copied'); }
    catch { toast('Couldn’t reach the clipboard.', { bad: true }); }
}
