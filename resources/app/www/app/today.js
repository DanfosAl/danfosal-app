// Today: the one home screen. It answers "what needs me now" before showing any totals, and every
// figure on it is computed - nothing is decoration (the old dashboard had four hardcoded values).
import { esc, eur, int, pct, icon, plural, ago, clock, sparkline } from './ui.js';
import { RESTOCK_DAYS, SALES_WINDOW_DAYS, WALKIN } from './data.js';

const GOAL_KEY = 'dailyRevenueGoal';   // same setting the retired Smart Dashboard used, so the goal carries over

export function readGoal() {
    try { return Number(localStorage.getItem(GOAL_KEY)) || 500; } catch { return 500; }
}
function writeGoal(value) {
    try { localStorage.setItem(GOAL_KEY, String(value)); } catch { /* storage unavailable: goal just won't persist */ }
}

function greeting(now) {
    const h = new Date(now).getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// Each item: severity, headline, one line of why, and at most one action.
function needsYou(a) {
    const items = [];
    if (a.reorder.length) {
        const names = a.reorder.slice(0, 3).map(r => r.product.name).join(', ');
        items.push({ sev: 'crit', title: `${plural(a.reorder.length, 'product runs', 'products run')} out before a restock could arrive`,
            why: `Based on the last ${SALES_WINDOW_DAYS} days of sales and a ${RESTOCK_DAYS / 7}-week restock: ${names}${a.reorder.length > 3 ? '…' : ''}.`,
            action: ['Reorder', 'stock.html#reorder'] });
    }
    const quietHours = a.lastEasypos ? (a.now - a.lastEasypos) / 3600000 : Infinity;
    if (quietHours >= 96) {
        items.push({ sev: 'crit', title: `No EasyPOS receipt for ${ago(a.lastEasypos, a.now).replace(' ago', '')}`,
            why: 'If you have sold in the shop since then, the receipt pipeline has stopped. The watchdog restarts it every 30 minutes, so if this stays, the print-capture service needs a look.' });
    }
    if (a.needsCount.length) {
        items.push({ sev: 'warn', title: `${plural(a.needsCount.length, 'product needs', 'products need')} a physical count`,
            why: `More were sold than the system ever held, so the stock figure is wrong: ${a.needsCount.slice(0, 3).map(n => n.name).join(', ')}${a.needsCount.length > 3 ? '…' : ''}.`,
            action: ['Fix stock', 'fix-stock.html'] });
    }
    if (a.soldWithoutCost.length) {
        items.push({ sev: 'warn', title: `${plural(a.soldWithoutCost.length, 'product you sold has', 'products you sold have')} no cost price`,
            why: `Profit on those sales can't be worked out until a cost is entered: ${a.soldWithoutCost.slice(0, 3).map(s => s.product.name).join(', ')}${a.soldWithoutCost.length > 3 ? '…' : ''}.`,
            action: ['Enter costs', 'stock.html?filter=nocost#catalogue'] });
    }
    if (a.unmatched.length) {
        const units = a.unmatched.reduce((s, [, q]) => s + q, 0);
        items.push({ sev: 'warn', title: `${plural(a.unmatched.length, 'receipt item isn’t', 'receipt items aren’t')} linked to a product`,
            why: `${plural(units, 'unit', 'units')} sold in the last ${SALES_WINDOW_DAYS} days didn't reduce stock or count toward profit. Link each name once and future receipts match by themselves.`,
            action: ['Link', 'stock.html#link'] });
    }
    if (a.openTickets.length) {
        const oldest = a.openTickets[0];
        const status = String(oldest.ticket.status || '').replace(/_/g, ' ');
        items.push({ sev: 'info', title: `${plural(a.openTickets.length, 'repair ticket', 'repair tickets')} open`,
            why: `Oldest is ${plural(oldest.ageDays, 'day', 'days')} old (${status}${oldest.ticket.promisedBy ? `, promised ${oldest.ticket.promisedBy}` : ', no promised date'}).`,
            action: ['Open', 'service.html#tickets'] });
    }
    if (a.openOrders.length) {
        const oldest = a.openOrders[0];
        const who = oldest.order.clientName || oldest.order.customerName || 'unnamed';
        items.push({ sev: 'info', title: `${plural(a.openOrders.length, 'online order', 'online orders')} not marked paid`,
            why: `Oldest: ${who}, ${plural(oldest.ageDays, 'day', 'days')} waiting.`,
            action: ['Online orders', 'online-orders.html'] });
    }
    return items;
}

function renderNeeds(items) {
    if (!items.length) {
        return `<div class="all-clear">${icon('check_circle')}<div><b>Nothing needs you right now.</b><br><span>Stock, receipts, repairs and orders are all in order.</span></div></div>`;
    }
    const word = { crit: 'Now', warn: 'Soon', info: 'FYI' };
    return `<div class="todo">${items.map((it, i) => `
        <div class="todo-item ${it.sev}"><i></i>
            <div><b><span class="sev">${word[it.sev]}</span>${esc(it.title)}</b><p>${esc(it.why)}</p></div>
            ${it.action ? `<a class="btn small" href="${esc(it.action[1])}">${esc(it.action[0])}</a>`
              : it.more ? `<button class="btn small" type="button" data-toggle="more-${i}" aria-expanded="false">Show</button>` : '<span></span>'}
            ${it.more ? `<div class="todo-more" id="more-${i}" hidden>${it.more.map(m => `<span class="chip">${esc(m)}</span>`).join('')}</div>` : ''}
        </div>`).join('')}</div>`;
}

function renderActivity(a) {
    if (!a.activity.length) {
        const last = a.lastSale;
        const lastLine = last ? ` The last sale was <b>${esc(ago(Number(last._t), a.now))}</b>.` : '';
        return `<p class="empty">No sales yet today. Receipts from EasyPOS appear here by themselves.${lastLine}</p>`;
    }
    return `<div class="feed">${a.activity.slice(0, 8).map(ev => `
        <div class="feed-row"><span class="t">${clock(ev.t)}</span>
            <span class="what">${esc(ev.what)}<span class="chip">${esc(ev.chip)}</span></span>
            <span class="amt">${ev.amount === null ? '–' : eur(ev.amount, 2)}</span></div>`).join('')}</div>`;
}

function renderHealth(a) {
    const quiet = a.lastEasypos ? (a.now - a.lastEasypos) / 3600000 : Infinity;
    const pipeDot = quiet < 48 ? 'ok' : quiet < 96 ? 'warn' : 'bad';
    const costShare = a.count30 ? a.costedCount30 / a.count30 : 1;
    return `
        <div class="status-row"><span class="dot ${pipeDot}"></span>Last EasyPOS receipt<b>${esc(ago(a.lastEasypos, a.now))}</b></div>
        <div class="status-row"><span class="dot ${costShare >= .95 ? 'ok' : 'warn'}"></span>Sales with a cost (30 days)<b>${pct(a.costedCount30, a.count30)}</b></div>
        <div class="status-row"><span class="dot ${a.polluted ? 'warn' : 'ok'}"></span>Customer addresses to clean<b>${int(a.polluted)}</b></div>`;
}

function renderStock(a) {
    const share = a.stockValue > 0 ? a.unsoldValue / a.stockValue : 0;
    const top = a.unsold.slice(0, 3).map(u => `${u.product.name} (${eur(u.value)})`).join(', ');
    return `
        <div class="stat-grid">
            <div><small>Stock at cost</small><b>${eur(a.stockValue)}</b></div>
            <div><small>Not sold in ${SALES_WINDOW_DAYS} days</small><b>${eur(a.unsoldValue)}</b></div>
            <div><small>Products selling</small><b>${int(a.productsSold)}</b></div>
        </div>
        <p class="empty" style="margin-top:10px">${pct(share, 1)} of your stock hasn't moved in ${SALES_WINDOW_DAYS} days. Biggest: ${esc(top)}.</p>`;
}

function renderKpis(a) {
    const goal = readGoal();
    const goalShare = Math.min(1, a.todayRevenue / goal);
    const vsLast = a.prevMonthToDate > 0 ? (a.monthRevenue - a.prevMonthToDate) / a.prevMonthToDate : null;
    const marginNote = a.margin30 === null ? '<span class="d miss">No costed sales yet</span>'
        : `<span class="d">${eur(a.costedNet30 - a.cost30)} profit on ${eur(a.costedNet30)} net · ${pct(a.costedCount30, a.count30)} of sales costed</span>`;
    return `
        <div class="kpi"><small>Today</small><span class="v">${eur(a.todayRevenue)}</span>
            <span class="d ${goalShare >= 1 ? 'up' : ''}">${goalShare >= 1 ? `${eur(goal)} goal reached` : `${pct(a.todayRevenue, goal)} of your ${eur(goal)} goal`} · <button class="link" type="button" id="edit-goal">change goal</button></span>
            <div class="goal" role="img" aria-label="${pct(a.todayRevenue, goal)} of daily goal"><i class="${goalShare >= 1 ? 'done' : ''}" style="width:${(goalShare * 100).toFixed(1)}%"></i></div></div>
        <div class="kpi"><small>This month</small><span class="v">${eur(a.monthRevenue)}</span>
            <span class="d ${vsLast === null ? '' : vsLast >= 0 ? 'up' : 'down'}">${plural(a.monthSalesCount, 'sale', 'sales')}${vsLast === null ? '' : ` · ${vsLast >= 0 ? '+' : ''}${Math.round(vsLast * 100)}% vs same days last month`}</span>
            ${sparkline(a.dailySeries)}</div>
        <div class="kpi"><small>Gross margin · 30 days</small><span class="v">${a.margin30 === null ? '–' : Math.round(a.margin30 * 100) + '%'}</span>${marginNote}</div>
        <div class="kpi"><small>Owed to you</small><span class="v">${eur(a.owedTotal)}</span>
            <span class="d">${plural(a.owed.length, 'unpaid invoice', 'unpaid invoices')} · <a href="debts.html" style="color:var(--violet-2)">Debts</a></span></div>`;
}

export function renderToday(el, a, { onGoalChange } = {}) {
    const needs = needsYou(a);
    const urgent = needs.filter(n => n.sev !== 'info').length;
    el.innerHTML = `
        <div class="page-head">
            <div><h1>${greeting(a.now)}, Kushtrim</h1>
                <p>${needs.length ? `${plural(needs.length, 'thing needs', 'things need')} you${urgent ? `, ${int(urgent)} soon` : ''}.` : 'All clear today.'}</p></div>
            <a class="btn primary" href="sell.html#new">${icon('add')}New sale</a>
        </div>
        <div class="kpis">${renderKpis(a)}</div>
        <div class="cols">
            <section class="panel" aria-labelledby="needs-h"><h2 class="panel-title" id="needs-h">Needs you<span>${int(needs.length)}</span></h2>${renderNeeds(needs)}</section>
            <div class="stack">
                <section class="panel" aria-labelledby="act-h"><h2 class="panel-title" id="act-h">Today's activity</h2>${renderActivity(a)}</section>
                <section class="panel" aria-labelledby="stock-h"><h2 class="panel-title" id="stock-h">Stock</h2>${renderStock(a)}</section>
                <section class="panel" aria-labelledby="health-h"><h2 class="panel-title" id="health-h">Data health</h2>${renderHealth(a)}</section>
            </div>
        </div>`;

    el.querySelectorAll('[data-toggle]').forEach(btn => btn.addEventListener('click', () => {
        const target = el.querySelector('#' + btn.dataset.toggle);
        const open = target.hidden;
        target.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
        btn.textContent = open ? 'Hide' : 'Show';
    }));
    const goalBtn = el.querySelector('#edit-goal');
    if (goalBtn) goalBtn.addEventListener('click', () => {
        const input = window.prompt('Daily sales goal in euro', String(readGoal()));
        if (input === null) return;
        const value = Math.round(Number(String(input).replace(/[^\d.]/g, '')));
        if (value > 0) { writeGoal(value); if (onGoalChange) onGoalChange(); }
    });
}

export function renderLoading(el) {
    el.innerHTML = `
        <div class="page-head"><div><h1>Loading…</h1><p>Reading sales, stock and customers.</p></div></div>
        <div class="kpis">${'<div class="kpi skeleton" style="height:112px"></div>'.repeat(4)}</div>
        <div class="cols"><div class="skeleton" style="height:320px"></div><div class="skeleton" style="height:320px"></div></div>`;
}

export function renderError(el, error, retry) {
    el.innerHTML = `<div class="error-box">${icon('error')}<div><b>Couldn't load your data.</b><br><span>${esc(error && error.message || error)}. Check the internet connection, then try again.</span></div>
        <button class="btn small" type="button" id="retry" style="margin-left:auto">Try again</button></div>`;
    el.querySelector('#retry').addEventListener('click', retry);
}

export function walkinLabel(name) { return !name || WALKIN.test(name) ? 'walk-in' : name; }
