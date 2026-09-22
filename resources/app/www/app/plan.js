// Stock > Yearly plan: make next year's purchase plan, then watch it against real sales.
//
// Numbers live in planmodel.js. A plan is saved as predictions/{year}-plan (version 2) next to the
// classic plans, which stay readable. During the year each product shows planned vs actual sales
// to date, the pace, and what the rest of the year needs at that pace - so "selling faster than
// planned, order more" (or slower, order less) shows up here and on Today, without opening the plan.
import { db, doc, setDoc } from './firebase.js';
import { esc, eur, int, icon, plural, fold, money2, toast, openDrawer, openModal } from './ui.js';
import { buildPlan, trackPlan, planFor, waitingByProduct, basisMonths, netOrders, monthName, PACE_FAST, PACE_SLOW } from './planmodel.js';

const STATUS = {
    out: ['Out of stock', 'bad'], low: ['Will run short', 'bad'], faster: ['Selling faster', 'warn'],
    slower: ['Selling slower', 'vio'], on: ['On plan', 'ok'], future: ['Not started', ''], done: ['Year ended', '']
};
const pl = { year: null, filter: 'attention', q: '' };
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
    actions.querySelector('#pl-make').addEventListener('click', () => makePlanDialog(ctx, pl.year, plan));
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
        ctx.body.querySelector('#pl-make2').addEventListener('click', () => makePlanDialog(ctx, pl.year, null));
        return;
    }

    const t = trackPlan(m, plan, { now, waitingByProduct: waitingByProduct(m) });
    const rows = t.rows;
    const value = sum(plan.products.map(r => r.totalCost));
    const paceAll = t.plannedToDate >= 1 ? t.actualToDate / t.plannedToDate : null;
    ctx.setSub(`${plural(plan.products.length, 'product', 'products')} · ${eur(value)} planned purchases (net) · made ${new Date(plan.generatedAt).toLocaleDateString('en-GB')} with ${Math.round(plan.growthRate * 100)}% growth`);
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
        <div class="table-wrap" style="max-height:calc(100vh - 360px)"><table class="dt"><thead><tr><th>Product</th><th class="n">Planned ${esc(String(plan.year))}</th><th class="n">Sold so far</th><th>Pace vs plan</th><th class="n">Stock + on order</th><th class="n">Plan still orders</th><th class="n">Needed at this pace</th><th>Status</th></tr></thead><tbody id="pl-body"></tbody></table></div>`;

    const draw = () => {
        const terms = fold(pl.q).trim().split(/\s+/).filter(Boolean);
        const searched = rows.filter(r => { const hay = fold(`${r.name} ${r.code}`); return terms.every(x => hay.includes(x)); });
        ctx.body.querySelector('#pl-f').innerHTML = FILTERS.map(([id, label, f]) => `<button class="filter${id === 'attention' || id === 'short' ? ' alert' : ''}" type="button" data-f="${id}" aria-pressed="${id === pl.filter}">${esc(label)}<span class="n">${int(searched.filter(f).length)}</span></button>`).join('');
        const f = FILTERS.find(x => x[0] === pl.filter) || FILTERS[0];
        const list = searched.filter(f[2]).sort((a, b) => order[a.status] - order[b.status] || Math.abs(b.diff * b.unitCost) - Math.abs(a.diff * a.unitCost));
        ctx.body.querySelector('#pl-body').innerHTML = list.map(r => {
            const w = r.pace === null ? 0 : Math.min(100, r.pace / 2 * 100), col = r.pace === null ? 'var(--faint)' : r.pace >= PACE_FAST ? 'var(--warn)' : r.pace <= PACE_SLOW ? 'var(--violet-2)' : 'var(--ok)';
            return `<tr data-id="${esc(r.id)}" tabindex="0">
                <td class="name"><b>${esc(r.name)}</b><span>${esc(r.code)}</span></td>
                <td class="n">${int(r.plannedYear)}</td>
                <td class="n">${int(r.actualToDate)} <span class="muted">/ ${int(Math.round(r.plannedToDate))}</span></td>
                <td><span class="cover"><span class="bar"><i style="width:${w.toFixed(1)}%;background:${col}"></i><u style="left:50%"></u></span><span class="muted">${r.pace === null ? '–' : Math.round(r.pace * 100) + '%'}</span></span></td>
                <td class="n ${r.stock <= 0 ? 'zero' : ''}">${int(r.stock)}${r.waiting ? ` <span class="muted">+${int(r.waiting)}</span>` : ''}</td>
                <td class="n muted">${int(r.plannedOrdersLeft)}</td>
                <td class="n">${int(r.needNow)}${Math.abs(r.diff) >= 1 && r.status !== 'on' ? ` <span class="chip ${r.diff > 0 ? 'warn' : 'vio'}">${r.diff > 0 ? '+' : '−'}${int(Math.abs(r.diff))}</span>` : ''}</td>
                <td><span class="chip ${STATUS[r.status][1]}">${STATUS[r.status][0]}</span></td></tr>`;
        }).join('') || `<tr><td colspan="8" class="muted" style="padding:18px">${pl.filter === 'attention' ? 'Nothing needs a decision: every product is selling roughly as planned.' : 'No products here.'}</td></tr>`;
    };
    draw();
    ctx.body.querySelector('#pl-q').addEventListener('input', e => { pl.q = e.target.value; draw(); });
    ctx.body.querySelector('#pl-f').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { pl.filter = b.dataset.f; draw(); } });
    const open = e => { const tr = e.target.closest('tr[data-id]'); if (tr) productPlanDrawer(ctx, plan, rows.find(r => r.id === tr.dataset.id)); };
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
            <section><h3>Deliveries the plan puts in each month</h3><p class="empty" style="margin:0">${r.orders.map((o, i) => o ? `${monthName(i)} ${o}` : '').filter(Boolean).join(' · ') || 'None: stock covers the year.'}. Order about 6 weeks before.</p></section>
            <form class="form-grid" novalidate><label class="fld">Planned sales for the year<input id="pp-year" type="number" min="0" step="1" value="${r.plannedYear}"><span class="hint">Months keep their shape; deliveries are recalculated.</span></label>
                <label class="fld">Cost each (net)<input value="€${money2(r.unitCost)}" disabled></label></form>`,
        foot: `<button class="btn primary" type="button" id="pp-save">${icon('check')}Save to the plan</button>
            <a class="btn" href="#orders">${icon('list_alt')}Order list</a>
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

async function makePlanDialog(ctx, year, existing) {
    const producers = [...new Set(ctx.model.products.map(p => p.producer).filter(Boolean).map(p => p.trim()))].sort();
    const ok = await openModal({
        title: existing ? `Remake the ${year} plan?` : `Make the ${year} plan`, confirmLabel: existing ? 'Remake plan' : 'Make plan',
        body: `${existing ? '<p>This replaces the current plan and any changes you made to it.</p>' : ''}
            <div class="form-grid"><label class="fld">Growth on last year<input id="mp-g" type="number" step="1" value="${existing ? Math.round(existing.growthRate * 100) : 10}"><span class="hint">% more (or fewer, negative) than the same month a year earlier.</span></label>
            <label class="fld">Products from<select id="mp-s"><option>All</option>${producers.map(p => `<option${existing && existing.supplier === p ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></label></div>
            ${year === new Date().getFullYear() ? `<p class="empty" style="margin:0">It's already ${new Date().toLocaleDateString('en-GB', { month: 'long' })}: the plan covers the whole year for tracking, but only plans deliveries from this month on.</p>` : ''}`,
        validate: w => Number.isFinite(Number(w.querySelector('#mp-g').value)) ? '' : 'Enter a growth percentage.'
    });
    if (!ok) return;
    const plan = buildPlan(ctx.model, { year, growth: Number(ok.querySelector('#mp-g').value) / 100, supplier: ok.querySelector('#mp-s').value, waitingByProduct: waitingByProduct(ctx.model) });
    if (!plan.products.length) { toast('No product sold in the months this plan is based on.', { bad: true }); return; }
    try {
        await setDoc(doc(db, 'predictions', `${year}-plan`), plan);
        toast(`${year} plan made: ${plural(plan.products.length, 'product', 'products')}, ${eur(sum(plan.products.map(r => r.totalCost)))} of purchases`);
        pl.year = year; pl.filter = 'all'; await ctx.reload();
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
