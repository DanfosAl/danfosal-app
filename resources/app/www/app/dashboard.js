// Insights' dashboard pages: Money, Stock, Customers, Instagram, Purchasing and Your apps.
//
// Built from the "Danfosal overview" dashboard made with Claude (23 Oct 2026), card for card, in the
// app's own look. Every figure comes from dashboard-data.js, which reads Firestore when Insights
// opens and defines nothing that data.js already defines. These pages only read: nothing on them
// writes to the database. Names (products, customers) are shown with esc() - never raw.
import { esc, eur, int, icon, plural, clock } from './ui.js';
import { SERIES, MUTED, INK, legend, timeBars, hBars, heat, seasonGrid, paceBullet, discountChart, table, wireTooltip } from './charts.js';
import {
    loadExtras, forgetExtras, dashboardFor, pace, thisMonthCosts, topAsk, botTrend, botOrdersSince, funnelRates, postTimes,
    purchaseTotals, mtdChange, slowShare
} from './dashboard-data.js';

// ------------------------------------------------------------------ formats

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const money = v => (v == null || Number.isNaN(v) ? '–' : eur(v));
const money0 = v => (v == null ? '' : eur(v));
const money2 = v => (v == null ? '' : eur(v, 2));
// Compact euro for axes: €850, €3.4k, €12k.
export const eurK = n => { const a = Math.abs(n), sign = n < 0 ? '−' : ''; return sign + (a >= 10000 ? '€' + Math.round(a / 1000) + 'k' : a >= 1000 ? '€' + (a / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : '€' + Math.round(a)); };
const pctF = v => (v == null || Number.isNaN(v) ? '' : Math.round(v * 100) + '%');
const pct1 = v => (v == null || Number.isNaN(v) ? '–' : (v * 100).toFixed(1) + '%');
const signed = v => (v == null || Number.isNaN(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.round(Math.abs(v) * 100) + '%');
const monthShort = k => `${MONTHS[+k.slice(5, 7) - 1]} ${k.slice(2, 4)}`;
const monthLong = k => (k ? `${MONTHS_LONG[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}` : '–');
const dayLong = k => (k ? `${+k.slice(8, 10)} ${MONTHS[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}` : '');
const dateOf = iso => (iso ? new Date(iso) : null);
const dateText = iso => { const d = dateOf(iso); return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'; };
const dateTimeText = iso => { const d = dateOf(iso); return d ? d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–'; };
const hh = h => String(h).padStart(2, '0') + ':00';
const monthOpts = { label: monthShort, long: monthLong };
const goodBad = v => (v == null ? '' : v > 0 ? ' class="good"' : v < 0 ? ' class="bad"' : '');
const productHref = r => `stock.html?q=${encodeURIComponent(r.product)}#catalogue`;

// Every month between the first and the last row, so a gap shows as a gap.
function fillMonths(rows, zero) {
    if (!rows.length) return rows;
    const by = new Map(rows.map(r => [r.month, r]));
    const sorted = rows.map(r => r.month).sort();
    const out = [];
    let [y, m] = sorted[0].split('-').map(Number);
    const [ey, em] = sorted[sorted.length - 1].split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
        const k = `${y}-${String(m).padStart(2, '0')}`;
        out.push(by.get(k) || { month: k, ...zero });
        m++; if (m > 12) { m = 1; y++; }
    }
    return out;
}

// ------------------------------------------------------------------ page parts

const kpi = (label, value, sub = '', cls = '') => `<div class="kpi"><small>${esc(label)}</small><span class="v${cls ? ' ' + cls : ''}">${value}</span><span class="d">${sub}</span></div>`;
const v = text => `<b>${esc(text)}</b>`;
const card = ({ id, title, note = '', body = '', wide = false, extra = '' }) => `
    <section class="panel viz${wide ? ' wide' : ''}" aria-labelledby="h-${id}">
        <div class="viz-head"><h2 class="panel-title" id="h-${id}">${esc(title)}</h2>${extra}</div>
        ${body}
        ${note ? `<p class="chart-note">${note}</p>` : ''}
    </section>`;
const chartBox = (id, legendItems) => `${legendItems ? legend(legendItems) : ''}<div class="chart" id="${id}"></div>`;
const search = (id, placeholder) => `<label class="field-search dash-search">${icon('search')}<input type="search" data-filter-for="${id}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"></label>`;

// ================================================================== MONEY

function money_page(ds, ctx) {
    const s = ds.snapshot[0], s2 = ds.summary2[0];
    const p = pace(s, s2.target, ctx.a.now), c = thisMonthCosts(ds.profit_after_costs);
    const costs = c.running_costs > 0;
    const take = costs
        ? `This month's gross profit of ${v(money(c.gross_profit))} covers ${v(money(c.running_costs))} of running costs, leaving <b${goodBad(c.profit_after_costs)}>${esc(money(c.profit_after_costs))}</b>; at the current pace the month ends near ${v(money(p.projected))}, against a target of ${v(money(p.target))}.`
        : `This month's gross profit so far is ${v(money(c.gross_profit))}; no running costs are recorded for it yet. At the current pace the month ends near ${v(money(p.projected))}, against a target of ${v(money(p.target))}.`;
    const html = `
        <p class="takeaway">${take}</p>
        <div class="dash-grid">
            ${card({ id: 'pace', title: 'This month against your target', wide: true,
                note: `Net revenue so far, what a steady pace to the target would have reached by today, and where the month ends if sales keep the current daily rate. The target is set in <a href="settings.html#general">Settings › General</a>.`,
                body: `<div class="chart" id="c-pace"></div>
                    <div class="summary"><span>So far <b>${esc(money(p.month_to_date))}</b></span><span>Expected by day ${int(p.day)}: <b>${esc(money(p.expected_by_today))}</b></span>
                    <span>Pace <b>${esc(pctF(p.pace))}</b> of what's needed</span><span>Projected month <b>${esc(money(p.projected))}</b></span><span>Target <b>${esc(money(p.target))}</b></span></div>` })}
        </div>

        <h2 class="dash-section">After running costs</h2>
        <div class="kpis">
            ${kpi('Gross profit this month', esc(money(c.gross_profit)), 'on sales with a known cost')}
            ${kpi('Running costs this month', esc(money(c.running_costs)), `rent and expenses in <a href="money.html#expenses">Money › Expenses</a>`)}
            ${kpi('Left after running costs', costs ? `<span${goodBad(c.profit_after_costs)}>${esc(money(c.profit_after_costs))}</span>` : '–', costs ? 'so far this month' : 'no running costs recorded this month')}
            ${kpi('Break-even revenue', esc(money(c.break_even_revenue)), `at this month's margin; you're at ${esc(money(c.revenue))}`)}
        </div>
        <div class="dash-grid">
            ${card({ id: 'costs', title: 'Gross profit against running costs, month by month', wide: true,
                note: `The bars are gross profit; the light marks are what the month cost to run. Running costs exist only for December 2025 and from September 2026 (rent), so other months have no mark: add rent, salaries and the accountant in <a href="money.html#expenses">Money › Expenses</a> to fill them in.`,
                body: chartBox('c-costs', [{ name: 'Gross profit', color: SERIES[0] }, { name: 'Running costs', color: INK, line: true }]) })}
        </div>

        <h2 class="dash-section">What you owe Kärcher</h2>
        <div class="kpis kpis-3">
            ${kpi('Kärcher balance now', esc(money(s2.karcher_balance)), s2.karcher_last_statement ? `from the statement of ${esc(dayLong(s2.karcher_last_statement))} plus everything since` : 'no Kärcher statement among your papers yet')}
            ${kpi('Due in the next 30 days', esc(money(s2.karcher_due_30d)), 'invoice date plus its payment terms')}
            ${kpi('Star (Sonuk) · partial payment', esc(money(s2.star_partial_paid)), "paid this year on a partly paid invoice; the invoice isn't among your papers")}
        </div>
        <div class="dash-grid">
            ${card({ id: 'ledger', title: 'Kärcher account since the last statement',
                note: 'The open total on Kärcher’s last statement, then every invoice and payment Paper Autopilot has read since. A negative balance means you paid ahead of the invoice.',
                body: table(ds.karcher_ledger, [
                    { h: '#', f: 'step' }, { h: 'Date', f: 'date', fmt: dayLong }, { h: 'What', f: 'event' }, { h: 'Document', f: 'document', cls: 'muted' },
                    { h: 'Amount', f: 'amount', num: true, fmt: money2 }, { h: 'Balance', f: 'balance', num: true, fmt: money2 }], { maxH: 420, empty: 'No Kärcher statement among your papers yet.' }) })}
            ${card({ id: 'suppliers', title: 'Who you paid',
                note: 'Every bank payment among your papers, by supplier. Customs is paid in lek to the state treasury.',
                body: table(ds.supplier_payments, [
                    { h: 'Supplier', f: 'supplier' }, { h: 'Paid (EUR)', f: 'paid_eur', num: true, fmt: money0, bar: true },
                    { h: 'Paid (lek)', f: 'paid_lek', num: true, fmt: v => (v == null ? '' : int(Math.round(v)) + ' L') },
                    { h: 'Payments', f: 'payments', num: true, fmt: int }, { h: 'Last', f: 'last_payment', num: true, fmt: dayLong }], { maxH: 420 }) })}
        </div>

        <h2 class="dash-section">True margin after import costs</h2>
        <div class="kpis kpis-3">
            ${kpi("Duty on last 12 months' sales", esc(money(s2.duty_12m)), 'not in the margins Danfosal App shows')}
            ${kpi('Products that pay duty', esc(int(s2.duty_products)), `plus ${esc(s2.fee_rate == null ? '–' : (s2.fee_rate * 100).toFixed(2) + '%')} customs fees on everything`)}
            ${kpi('Import VAT', 'not a cost', 'you reclaim it, so it is left out')}
        </div>
        <div class="dash-grid">
            ${card({ id: 'landed', title: 'Margin before and after duty', wide: true,
                note: 'For products whose customs tariff pays duty: the cost on the last Kärcher invoice, the cost once duty and fees are added (at the rate your own Kärcher declarations were charged), and the margin at today’s shop price. Pressure washers, SC steam cleaners, Puzzi and floor machines pay no duty, so their margin doesn’t change. Click a product to open it in Stock.',
                body: table(ds.landed_margin, [
                    { h: 'Product', f: 'product' }, { h: 'Family', f: 'family', cls: 'muted' }, { h: 'Duty', f: 'duty_rate', num: true, fmt: pctF },
                    { h: 'Invoice cost', f: 'invoice_cost', num: true, fmt: money2 }, { h: 'Landed cost', f: 'landed_cost', num: true, fmt: money2 },
                    { h: 'Price, net', f: 'price_net', num: true, fmt: money2 }, { h: 'Margin before', f: 'margin_invoice', num: true, fmt: pctF },
                    { h: 'Margin after', f: 'margin_landed', num: true, fmt: pctF, pill: v => (v < 0.25 ? 'warn' : '') }, { h: 'Sold 12m', f: 'units_12m', num: true, fmt: int }],
                { maxH: 460, href: productHref, empty: 'No Kärcher customs declarations among your papers yet.' }) })}
        </div>`;
    const draw = body => {
        paceBullet(body.querySelector('#c-pace'), p, money, eurK);
        timeBars(body.querySelector('#c-costs'), ds.profit_after_costs.slice().sort((a, b) => a.month.localeCompare(b.month)), {
            h: 240, ...monthOpts, series: [{ k: 'gross_profit', name: 'Gross profit', color: SERIES[0] }], title: 'Gross profit against running costs',
            marker: { k: 'running_costs', name: 'Running costs', color: INK }, axis: eurK, tip: money,
            extra: r => [{ name: 'Left after costs', value: r.profit_after_costs == null ? '–' : money(r.profit_after_costs) },
                { name: 'Break-even revenue', value: r.break_even_revenue == null ? '–' : money(r.break_even_revenue) }, { name: 'Revenue', value: money(r.revenue) }]
        });
    };
    return { html, draw };
}

// ================================================================== STOCK

const clr = { group: 'Never sold', disc: 0.2 };
function clearanceOf(rows, disc) {
    let cost = 0, cash = 0, below = 0, n = 0;
    rows.forEach(r => {
        if (!(r.price > 0) || !(r.unit_cost > 0) || !(r.in_stock > 0)) return;
        const p = (r.price / 1.2) * (1 - disc);
        n++; cost += r.unit_cost * r.in_stock; cash += p * r.in_stock;
        if (p < r.unit_cost) below++;
    });
    return { n, cost, cash, profit: cash - cost, margin: cash > 0 ? (cash - cost) / cash : null, below };
}
function drawClearance(body, ds, withTable = true) {
    const box = body.querySelector('#clr'); if (!box) return;
    const sel = ds.clearance.filter(r => clr.group === 'both' || r.group === clr.group);
    const c = clearanceOf(sel, clr.disc);
    box.querySelectorAll('[data-g]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.g === clr.group)));
    box.querySelector('#clr-disc').value = String(Math.round(clr.disc * 100));
    box.querySelector('#clr-out').textContent = Math.round(clr.disc * 100) + '%';
    const set = (id, text, bad) => { const el = box.querySelector(id); el.textContent = text; el.classList.toggle('bad', !!bad); };
    set('#clr-n', int(c.n)); set('#clr-cost', money(c.cost)); set('#clr-cash', money(c.cash));
    set('#clr-profit', money(c.profit), c.profit < 0); set('#clr-margin', c.margin == null ? '–' : pctF(c.margin), c.margin != null && c.margin < 0); set('#clr-below', int(c.below), c.below > 0);
    const pts = []; for (let d = 0; d <= 0.6001; d += 0.05) pts.push({ d: Math.round(d * 100) / 100, ...clearanceOf(sel, d) });
    discountChart(box.querySelector('#c-clear'), pts, clr.disc, money, eurK);
    if (withTable) box.querySelector('#clr-table').innerHTML = table(sel.slice().sort((a, b) => (b.value_at_cost || 0) - (a.value_at_cost || 0)), [
        { h: 'Product', f: 'product' }, { h: 'Family', f: 'family', cls: 'muted' }, { h: 'In stock', f: 'in_stock', num: true, fmt: int },
        { h: 'Unit cost', f: 'unit_cost', num: true, fmt: money2 }, { h: 'Shop price', f: 'price', num: true, fmt: money0 },
        { h: 'At cost', f: 'value_at_cost', num: true, fmt: money0, bar: true }, { h: 'Last sold', f: 'last_sold', num: true, fmt: v => (v ? dayLong(v) : 'never') }],
    { maxH: 420, href: productHref, empty: 'No product in this group.' });
}

function stock_page(ds, ctx) {
    const s = ds.snapshot[0], s2 = ds.summary2[0], top = topAsk(ds.demand_stock), never = ds.stock_aging.find(b => b.bucket === 'Never sold') || {};
    const take = top.model
        ? `The model people ask about most, ${v(top.model)}, was asked about ${v(int(top.questions))} times and has ${v(int(top.in_stock))} in stock, while ${v(money(s.never_sold_value))} sits in ${v(int(never.products))} products with no recorded sale at all.`
        : `${v(money(s.never_sold_value))} sits in ${v(int(never.products))} products with no recorded sale at all.`;
    const SIGNAL = { 'Out of stock': 'bad', 'Running low': 'warn', 'In stock': 'ok' };
    const html = `
        <p class="takeaway">${take}</p>
        <div class="kpis">
            ${kpi('Stock at cost', esc(money(s.stock_value_cost)), `${esc(int(s.units_in_stock))} units in ${esc(int(s.products_in_stock))} products`)}
            ${kpi('Not sold in 3+ months', esc(money(s.slow_stock_value)), `${esc(pctF(slowShare(s)))} of the stock value`)}
            ${kpi('Asked-about models out of stock', esc(int(s2.out_of_stock_asked)), 'models people asked the chatbot about twice or more')}
            ${kpi('Products without a cost price', esc(int(s.products_no_cost)), 'their sales don’t count toward margin')}
        </div>
        <div class="dash-grid">
            <section class="panel viz wide" id="clr" aria-labelledby="h-clr">
                <div class="viz-head"><h2 class="panel-title" id="h-clr">Clearance planner</h2></div>
                <p class="chart-note">Pick which slow stock to clear and a discount off the shop price. The figures show what selling all of it would bring in, without VAT, and what's left after its cost. Nothing is changed: this only works it out.</p>
                <div class="toolbar">
                    <div class="seg" role="group" aria-label="Which stock">
                        <button type="button" data-g="Never sold">Never sold</button><button type="button" data-g="Not sold in 3+ months">Sold, but not in 3+ months</button><button type="button" data-g="both">Both</button></div>
                    <label class="range">Discount <input type="range" id="clr-disc" min="0" max="60" step="5" aria-label="Discount"><output id="clr-out"></output></label>
                </div>
                <div class="stat-grid six">
                    <div><small>Products</small><b id="clr-n">–</b></div><div><small>Stock at cost</small><b id="clr-cost">–</b></div>
                    <div><small>Cash it brings in</small><b id="clr-cash">–</b></div><div><small>Profit left</small><b id="clr-profit">–</b></div>
                    <div><small>Margin left</small><b id="clr-margin">–</b></div><div><small>Would sell below cost</small><b id="clr-below">–</b></div>
                </div>
                ${legend([{ name: 'Cash it brings in', color: SERIES[1], line: true }, { name: 'Profit left', color: SERIES[0], line: true }])}
                <div class="chart" id="c-clear"></div>
                <h3 class="dash-sub">The products in this group</h3>
                <div id="clr-table"></div>
            </section>
            ${card({ id: 'demand', title: 'What people ask for vs what’s on the shelf', wide: true,
                note: 'Kärcher models named in Instagram chatbot questions, with your stock and sales. A model that is out of stock can’t sell, so the “runs out” list never shows it; this list does, and so does <a href="stock.html#reorder">Stock › Reorder</a>.',
                body: table(ds.demand_stock, [
                    { h: 'Model', f: 'model' }, { h: 'Questions', f: 'questions', num: true, fmt: int, bar: true }, { h: 'Last 6 months', f: 'questions_6m', num: true, fmt: int },
                    { h: 'In stock', f: 'in_stock', num: true, fmt: int }, { h: 'Sold 12m', f: 'units_12m', num: true, fmt: int },
                    { h: 'Status', f: 'signal', pill: v => SIGNAL[v] || '' }], { maxH: 420, href: r => `stock.html?q=${encodeURIComponent(r.model)}#catalogue` }) })}
            ${card({ id: 'topics', title: 'What people ask about, by type', note: 'Every chatbot product question, sorted into a type by its words, all time.', body: '<div class="chart" id="c-topics"></div>' })}
            ${card({ id: 'aging', title: 'How long your stock has been waiting', note: 'Stock at cost, by when each product last sold (shop or online). Highlighted: 3 months or more.', body: '<div class="chart" id="c-aging"></div>' })}
            ${card({ id: 'season', title: 'When each family sells', wide: true,
                note: 'How each product family’s revenue spreads over the calendar months, brighter where it sells most, so you can order six weeks ahead of its season. November and December only have 2025, and Dec–Jan only till sales, so winter reads low.',
                body: '<div class="chart" id="c-season"></div>' })}
            ${card({ id: 'cost', title: 'Kärcher cost changes', wide: true,
                note: 'Products whose purchase cost changed between Kärcher invoices, and what that did to the margin at today’s shop price. Rises first, by size, then falls.',
                body: table(ds.cost_changes, [
                    { h: 'Product', f: 'product' }, { h: 'Code', f: 'code', cls: 'muted' }, { h: 'First cost', f: 'first_cost', num: true, fmt: money2 },
                    { h: 'Latest cost', f: 'last_cost', num: true, fmt: money2 }, { h: 'Change', f: 'change_pct', num: true, fmt: signed, pill: v => (v > 0 ? 'bad' : 'ok') },
                    { h: 'Margin then', f: 'margin_then', num: true, fmt: pctF }, { h: 'Margin now', f: 'margin_now', num: true, fmt: pctF }, { h: 'Sold 12m', f: 'units_12m', num: true, fmt: int }],
                { maxH: 420, href: productHref, empty: 'No product has been invoiced at two different costs yet.' }) })}
            ${card({ id: 'reorder', title: 'Running out',
                note: `Products selling fast enough (2+ units in 90 days) to run out before a Kärcher restock arrives, about 6 weeks. ${ds.out_of_stock_wanted.length ? `${esc(plural(ds.out_of_stock_wanted.length, 'best seller is', 'best sellers are'))} already out of stock: see <a href="stock.html#reorder">Stock › Reorder</a>.` : ''}`,
                body: table(ds.reorder, [
                    { h: 'Product', f: 'product' }, { h: 'Code', f: 'code', cls: 'muted' }, { h: 'In stock', f: 'in_stock', num: true, fmt: int },
                    { h: 'Sold 90d', f: 'sold_90d', num: true, fmt: int }, { h: 'Days left', f: 'days_left', num: true, fmt: v => (v <= 0 ? 'out now' : int(Math.round(v))) }],
                { maxH: 420, href: productHref, empty: 'Nothing runs out before a restock can arrive.' }) })}
            ${card({ id: 'slow', title: 'Biggest money standing still', wide: true,
                note: 'The 25 products holding the most money at cost that haven’t sold in 90 days or more.',
                body: table(ds.slow_stock, [
                    { h: 'Product', f: 'product' }, { h: 'Code', f: 'code', cls: 'muted' }, { h: 'Family', f: 'family', cls: 'muted' }, { h: 'In stock', f: 'in_stock', num: true, fmt: int },
                    { h: 'At cost', f: 'value_at_cost', num: true, fmt: money0, bar: true }, { h: 'Last sold', f: 'last_sold', num: true, fmt: v => (v ? dayLong(v) : 'never') }],
                { maxH: 460, href: productHref }) })}
        </div>`;
    const draw = body => {
        drawClearance(body, ds);
        hBars(body.querySelector('#c-topics'), ds.demand_family.slice().sort((a, b) => b.questions - a.questions), {
            rowH: 28, label: r => r.topic, value: r => r.questions, color: r => (/^Unclear/.test(r.topic) ? MUTED : SERIES[0]), end: r => int(r.questions),
            tip: r => ({ title: r.topic, lines: [{ name: 'Questions, all time', value: int(r.questions) }, { name: 'Last 6 months', value: int(r.questions_6m) }] })
        });
        hBars(body.querySelector('#c-aging'), ds.stock_aging.slice().sort((a, b) => a.order - b.order), {
            rowH: 30, label: r => r.bucket, value: r => r.value_at_cost, color: r => (r.order >= 3 ? SERIES[0] : MUTED), end: r => `${eurK(r.value_at_cost)} · ${int(r.products)}`,
            tip: r => ({ title: r.bucket === 'Never sold' ? 'Never sold' : `Last sold: ${r.bucket.toLowerCase()}`, lines: [{ name: 'At cost', value: money(r.value_at_cost) }, { name: 'Products', value: int(r.products) }, { name: 'Units', value: int(r.units) }] })
        });
        seasonGrid(body.querySelector('#c-season'), ds.seasonality, money);
    };
    const wire = body => {
        const box = body.querySelector('#clr');
        box.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => { clr.group = b.dataset.g; drawClearance(body, ds); }));
        box.querySelector('#clr-disc').addEventListener('input', e => { clr.disc = Number(e.target.value) / 100; drawClearance(body, ds, false); });
        box.querySelector('#c-clear').addEventListener('click', e => { const t = e.target.closest('[data-disc]'); if (t) { clr.disc = Number(t.dataset.disc); drawClearance(body, ds, false); } });
    };
    return { html, draw, wire };
}

// ================================================================== CUSTOMERS

function customers_page(ds) {
    const s = ds.snapshot[0], s2 = ds.summary2[0];
    const bt = type => ds.buyer_types.find(b => b.type === type) || {};
    const lg = group => (ds.customer_loyalty.find(r => r.group === group) || {}).customers;
    const html = `
        <p class="takeaway">A business buyer's average sale is ${v(money(bt('Business').avg_sale))}, against ${v(money(bt('Private (named)').avg_sale))} for a named private buyer and ${v(money(bt('Walk-in').avg_sale))} for a walk-in; ${v(int(s2.lapsed_customers))} customers who bought twice or more haven't been back in 6 months.</p>
        <div class="kpis">
            ${kpi('Customers, all time', esc(int(s.customers_total)), `${esc(int(s.new_customers_30d))} new in the last 30 days`)}
            ${kpi('Business revenue · 12 months', esc(money(bt('Business').net)), `from ${esc(int(bt('Business').sales))} sales to companies`)}
            ${kpi('Bought 4 to 9 times', esc(int(lg('4–9 times'))), `plus ${esc(int(lg('10+ times')))} who bought 10+ times`)}
            ${kpi('Regulars who stopped coming', esc(int(s2.lapsed_customers)), `they spent ${esc(money(s2.lapsed_spent))} with you before`)}
        </div>
        <div class="dash-grid">
            ${card({ id: 'buyers', title: 'Businesses vs private buyers',
                note: 'Shop sales in the last 12 months. A business is a buyer with a tax number (NIPT) on the receipt or in their profile, or a company name.',
                body: table(ds.buyer_types.slice().sort((a, b) => b.net - a.net), [
                    { h: 'Buyer', f: 'type' }, { h: 'Sales', f: 'sales', num: true, fmt: int }, { h: 'Net', f: 'net', num: true, fmt: money0, bar: true },
                    { h: 'Avg sale', f: 'avg_sale', num: true, fmt: money0 }, { h: 'Margin', f: 'margin', num: true, fmt: pctF }]) })}
            ${card({ id: 'buyers-m', title: 'Shop revenue by buyer, per month', note: 'Net shop sales; online orders aren’t included.',
                body: chartBox('c-buyers', [{ name: 'Business', color: SERIES[0] }, { name: 'Private (named)', color: SERIES[1] }, { name: 'Walk-in', color: SERIES[2] }]) })}
            ${card({ id: 'win', title: 'Win-back list', wide: true, extra: search('t-win', 'Search customers or products'),
                note: 'The 30 customers who spent most among those who bought twice or more but not in the last 6 months, with what they usually buy. Since February 2026 most till receipts carry no name, so a few may have come back without being recognised. Click a name to open the customer.',
                body: `<div id="t-win">${table(ds.win_back, [
                    { h: 'Customer', f: 'customer' }, { h: 'Purchases', f: 'purchases', num: true, fmt: int }, { h: 'Spent', f: 'net_spent', num: true, fmt: money0, bar: true },
                    { h: 'Last bought', f: 'last_purchase', num: true, fmt: dayLong }, { h: 'Usually buys', f: 'usually_buys', cls: 'muted' }, { h: 'Most bought', f: 'top_product' }],
                { maxH: 460, href: r => `customers.html?q=${encodeURIComponent(r.customer)}#all`, search: r => `${r.customer} ${r.usually_buys} ${r.top_product}`, empty: 'No lapsed regulars.' })}</div>` })}
            ${card({ id: 'together', title: 'Bought together', wide: true,
                note: `Pairs of products on the same receipt or order, all time. Only ${esc(int(s2.multi_baskets))} of ${esc(int(s2.baskets))} sales had two or more different products, so each pair is a small signal: good for a bundle or a suggestion at the till.`,
                body: table(ds.bought_together, [
                    { h: '#', f: 'rank' }, { h: 'Product', f: 'product_a' }, { h: 'Bought with', f: 'product_b' }, { h: 'Times', f: 'times', num: true, fmt: int, bar: true },
                    { h: 'Last time', f: 'last_time', num: true, fmt: dayLong }], { maxH: 420, empty: 'No pair bought together twice yet.' }) })}
            ${card({ id: 'cust', title: 'New and returning customers per month', wide: true,
                note: 'Named buyers in the shop and online, with spelling differences merged the way Danfosal App does it. Walk-in sales without a name aren’t counted.',
                body: chartBox('c-cust', [{ name: 'New customers', color: SERIES[0] }, { name: 'Returning customers', color: SERIES[1] }]) })}
            ${card({ id: 'loyal', title: 'How often customers buy', note: 'Every named customer by number of purchases, all time.', body: '<div class="chart" id="c-loyal"></div>' })}
            ${card({ id: 'shop-hours', title: 'When the shop sells', note: 'EasyPOS receipts and till sales by weekday and hour (07–20), since December 2025. Imported 2025 sales carry no time of day.', body: '<div class="chart" id="c-shop-hours"></div>' })}
        </div>`;
    const draw = body => {
        timeBars(body.querySelector('#c-buyers'), ds.buyer_types_monthly, {
            h: 230, ...monthOpts, axis: eurK, tip: money, title: 'Shop revenue by buyer',
            series: [{ k: 'business', name: 'Business', color: SERIES[0] }, { k: 'private', name: 'Private (named)', color: SERIES[1] }, { k: 'walkin', name: 'Walk-in', color: SERIES[2] }]
        });
        timeBars(body.querySelector('#c-cust'), ds.customers_monthly, {
            h: 240, ...monthOpts, title: 'New and returning customers',
            series: [{ k: 'new_customers', name: 'New customers', color: SERIES[0] }, { k: 'returning_customers', name: 'Returning customers', color: SERIES[1] }]
        });
        hBars(body.querySelector('#c-loyal'), ds.customer_loyalty.slice().sort((a, b) => a.order - b.order), {
            rowH: 30, label: r => r.group, value: r => r.customers, color: () => SERIES[0], end: r => int(r.customers),
            tip: r => ({ title: r.group, lines: [{ name: 'Customers', value: int(r.customers) }] })
        });
        heat(body.querySelector('#c-shop-hours'), ds.shop_hours, { from: 7, to: 20, v: r => r.receipts, title: 'When the shop sells', lines: r => [{ name: 'Sales', value: int(r.receipts) }, { name: 'Net', value: money(r.net || 0) }] });
    };
    return { html, draw };
}

// ================================================================== INSTAGRAM

function instagram_page(ds) {
    const s = ds.snapshot[0], s2 = ds.summary2[0];
    const trend = botTrend(ds.bot_monthly, ds.online_monthly), since = botOrdersSince(ds.bot_orders_monthly);
    const funnel = funnelRates(ds.bot_funnel), posts = postTimes(ds.bot_hours);
    const html = `
        <p class="takeaway">The Instagram chatbot peaked at ${v(int(trend.peak_people))} people writing in ${v(monthLong(trend.peak_month))} and was down to ${v(int(trend.last_people))} in ${v(monthLong(trend.last_month))}; since December 2025, ${v(int(since.missing))} of the ${v(int(since.created))} orders it took never became an order in Danfosal App.</p>
        <div class="kpis">
            ${kpi('People who wrote to the bot', esc(int(funnel[0] ? funnel[0].count : 0)), 'since it started, October 2025')}
            ${kpi('Bot messages · last 30 days', esc(int(s.bot_messages_30d)), `last one ${esc(dateText(s.bot_last_message_at))}`)}
            ${kpi('Bot orders that arrived', esc(pctF(since.arrived_share)), 'since December 2025')}
            ${kpi('Missing · last 90 days', esc(int(s2.bot_orders_missing_90d)), `bot orders with no matching online order · <a href="sell.html#leads">Sell › Instagram</a>`)}
        </div>
        <div class="dash-grid">
            ${card({ id: 'botorders', title: 'Bot orders that arrived, and those that didn’t', wide: true,
                note: 'Orders the chatbot logged each month, split by whether a matching order exists in Online orders. The bot’s first weeks (Oct–Nov 2025) were entered by hand, so they don’t link and aren’t counted as missing above.',
                body: chartBox('c-botorders', [{ name: 'Arrived in Online orders', color: SERIES[0] }, { name: 'No matching order', color: SERIES[1] }]) })}
            ${card({ id: 'post', title: 'Best time to post',
                note: 'For each weekday, the hour when the most messages arrive; a post about an hour earlier is in front of people just before they write.',
                body: table(posts, [
                    { h: 'Day', f: 'weekday' }, { h: 'Post by', f: 'post_at', num: true, fmt: hh }, { h: 'Busiest hour', f: 'peak_hour', num: true, fmt: hh },
                    { h: 'Messages then', f: 'peak_messages', num: true, fmt: int }, { h: 'That day', f: 'day_messages', num: true, fmt: int, bar: true }]) })}
            ${card({ id: 'bot-hours', title: 'When people message the bot', note: 'Messages by weekday and hour, all time.', body: '<div class="chart" id="c-bot-hours"></div>' })}
            ${card({ id: 'bot', title: 'Instagram chatbot, month by month', wide: true, note: 'From the chatbot’s own log. The current month is still running.',
                body: `<div class="dash-multi"><div><h3 class="dash-sub">Messages</h3><div class="chart" id="c-bot-msg"></div></div>
                    <div><h3 class="dash-sub">People who wrote</h3><div class="chart" id="c-bot-ppl"></div></div>
                    <div><h3 class="dash-sub">Orders the bot created</h3><div class="chart" id="c-bot-ord"></div></div></div>` })}
            ${card({ id: 'funnel', title: 'From message to order', note: 'Everyone who wrote to the bot, those who asked about a product, and the orders it created. All time.', body: '<div class="chart" id="c-funnel"></div>' })}
            ${card({ id: 'asked', title: 'What people ask the bot about',
                note: 'Most asked products, spellings merged. “Fshesë” is a steam mop; SC models are steam cleaners.',
                body: table(ds.bot_asked, [{ h: '#', f: 'rank' }, { h: 'Asked about', f: 'asked' }, { h: 'Questions', f: 'inquiries', num: true, fmt: int, bar: true }]) })}
            ${card({ id: 'online', title: 'Online orders per month', wide: true,
                note: 'Instagram, WhatsApp and website orders that were paid, by how they reached the app. Returned and cancelled orders are left out.',
                body: chartBox('c-online', [{ name: 'Entered by hand', color: SERIES[0] }, { name: 'Instagram chatbot', color: SERIES[1] }, { name: 'Danfosal App', color: SERIES[2] }]) })}
        </div>`;
    const draw = body => {
        timeBars(body.querySelector('#c-botorders'), fillMonths(ds.bot_orders_monthly, { created: 0, arrived: 0, missing: 0 }), {
            h: 220, ...monthOpts, title: 'Bot orders', series: [{ k: 'arrived', name: 'Arrived in Online orders', color: SERIES[0] }, { k: 'missing', name: 'No matching order', color: SERIES[1] }]
        });
        heat(body.querySelector('#c-bot-hours'), ds.bot_hours, { from: 0, to: 23, v: r => r.messages, title: 'Messages by weekday and hour', lines: r => [{ name: 'Messages', value: int(r.messages) }] });
        [['#c-bot-msg', 'messages', 'Messages'], ['#c-bot-ppl', 'people', 'People who wrote'], ['#c-bot-ord', 'orders_created', 'Orders created']].forEach(([sel, k, name]) =>
            timeBars(body.querySelector(sel), ds.bot_monthly, { h: 150, ticks: 3, ...monthOpts, title: name, series: [{ k, name, color: SERIES[0] }] }));
        hBars(body.querySelector('#c-funnel'), funnel, {
            rowH: 34, label: r => r.step, value: r => r.count, color: r => (r.order === 1 ? MUTED : SERIES[0]),
            end: r => (r.of_previous == null ? int(r.count) : `${int(r.count)} · ${pctF(r.of_previous)}`),
            tip: r => ({ title: r.step, lines: [{ name: r.order === 3 ? 'Orders' : 'People', value: int(r.count) }, ...(r.of_previous == null ? [] : [{ name: 'Of the step before', value: pct1(r.of_previous) }])] })
        });
        timeBars(body.querySelector('#c-online'), fillMonths(ds.online_monthly, { orders: 0, returned: 0, revenue_net: 0, chatbot: 0, app: 0, imported: 0, avg_order_net: null }), {
            h: 220, ...monthOpts, title: 'Online orders', series: [{ k: 'imported', name: 'Entered by hand', color: SERIES[0] }, { k: 'chatbot', name: 'Instagram chatbot', color: SERIES[1] }, { k: 'app', name: 'Danfosal App', color: SERIES[2] }],
            extra: r => [{ name: 'Net value', value: money(r.revenue_net || 0) }, { name: 'Returned or cancelled', value: int(r.returned || 0) }]
        });
    };
    return { html, draw };
}

// ================================================================== PURCHASING

function purchasing_page(ds) {
    const s = ds.snapshot[0], t = purchaseTotals(ds.purchases_monthly);
    const html = `
        <p class="takeaway">Kärcher invoiced ${v(money(t.invoiced))} since ${v(monthLong(t.first_month))}, as read from the ${v(int(s.purchase_docs))} purchasing papers Paper Autopilot has filed; the balance with Kärcher is on the <a href="#money">Money</a> page.</p>
        <div class="kpis">
            ${kpi('Invoiced by Kärcher', esc(money(t.invoiced)), `${esc(int(t.invoices))} invoices, net`)}
            ${kpi('Paid to Kärcher', esc(money(t.paid)), 'by euro transfer, as far as your papers go')}
            ${kpi('Paid to other suppliers', esc(money(t.other)), 'Star, Rulopak, Fersan, Bayersan')}
            ${kpi('Import VAT and duty', esc(money(t.customs)), 'on the customs declarations, at each one’s rate')}
        </div>
        <div class="dash-grid">
            ${card({ id: 'purch', title: 'Invoices, payments and customs, month by month', wide: true,
                note: 'What each purchasing paper says: Kärcher invoice net amounts, euro bank transfers to Kärcher and to other suppliers, and import VAT + duty converted from lek. Duplicate copies of the same paper are counted once. The papers themselves are in <a href="stock.html#purchases">Stock › Purchases</a>.',
                body: chartBox('c-purch', [{ name: 'Invoiced by Kärcher', color: SERIES[0] }, { name: 'Paid to Kärcher', color: SERIES[1] }, { name: 'Paid to other suppliers', color: SERIES[2] }, { name: 'Import VAT + duty', color: SERIES[3] }]) })}
        </div>`;
    const draw = body => timeBars(body.querySelector('#c-purch'), fillMonths(ds.purchases_monthly, { karcher_invoiced: 0, invoices: 0, karcher_paid: 0, other_paid: 0, customs_taxes: 0 }), {
        h: 280, mode: 'group', pad: 0.18, ...monthOpts, axis: eurK, tip: money, title: 'Purchasing by month',
        series: [{ k: 'karcher_invoiced', name: 'Invoiced by Kärcher', color: SERIES[0] }, { k: 'karcher_paid', name: 'Paid to Kärcher', color: SERIES[1] }, { k: 'other_paid', name: 'Paid to other suppliers', color: SERIES[2] }, { k: 'customs_taxes', name: 'Import VAT + duty', color: SERIES[3] }],
        extra: r => [{ name: 'Kärcher invoices', value: int(r.invoices || 0) }]
    });
    return { html, draw };
}

// ================================================================== YOUR APPS

function apps_page(ds) {
    const s = ds.snapshot[0];
    const html = `
        <p class="takeaway">The EasyPOS bridge recorded its last receipt on ${v(dateTimeText(s.last_easypos_at))}, and the website sync found ${v(int(s.web_proposals_pending))} website prices waiting for your decision in <a href="stock.html#website">Stock › Website</a>.</p>
        <div class="kpis">
            ${kpi('EasyPOS receipts captured', esc(int(s.easypos_receipts_total)), 'since February 2026, by the OCR bridge')}
            ${kpi('Website products linked', esc(s.web_linked == null ? '–' : int(s.web_linked)), s.web_last_sync_at ? `${esc(int(s.web_price_off))} price and ${esc(int(s.web_stock_off))} stock differences · synced ${esc(dateTimeText(s.web_last_sync_at))}` : 'the website sync hasn’t run yet')}
            ${kpi('Live warranty certificates', esc(int(s.live_warranties)), `${esc(int(s.warranties_expiring_90d))} ending in the next 90 days`)}
            ${kpi('Open repairs', esc(int(s.repairs_open)), `of ${esc(int(s.repairs_total))} repair tickets in Garanci`)}
        </div>
        <div class="dash-grid">
            ${card({ id: 'easypos', title: 'EasyPOS receipts per day · last 60 days', wide: true,
                note: 'Till receipts the bridge read and saved, with refunds from credit notes. A day without bars had no receipt captured.',
                body: chartBox('c-easypos', [{ name: 'Receipts', color: SERIES[0] }, { name: 'Refunds', color: SERIES[1] }]) })}
            ${card({ id: 'warranty', title: 'Warranty certificates issued', note: 'Certificates from Danfos Garanci and the till, by month issued.', body: '<div class="chart" id="c-warranty"></div>' })}
            ${card({ id: 'health', title: 'Data health', note: `Things that make the numbers less complete. The full check is in <a href="settings.html#health">Settings › Data health</a>.`,
                body: `<div class="lines">
                    <div class="line"><div><b>${esc(int(s.products_no_cost))} products have no cost price</b><span>their sales don’t count toward margin</span></div></div>
                    <div class="line"><div><b>${esc(pctF(s.costed_share_12m))} of the last 12 months’ shop revenue has a known cost</b><span>margins are worked out on that part</span></div></div>
                    <div class="line"><div><b>${esc(s.web_below_cost == null ? '–' : int(s.web_below_cost))} website prices are below what the product cost you</b><span>by this morning’s website sync; ${esc(int(s.web_proposals_below_cost))} of the prices waiting below</span></div></div>
                    <div class="line"><div><b>${esc(int(s.refunds_12m))} refunds in the last 12 months</b><span>worth ${esc(money(s.refunded_12m_gross))} with VAT</span></div></div></div>` })}
            ${card({ id: 'web', title: 'Website prices waiting for a decision', wide: true, extra: search('t-web', 'Search products'),
                note: 'Prices on danfosal.com that differ from the shop’s, from this morning’s sync. Biggest differences first; “below cost” means the website price, without VAT, is under the product’s cost. Decide them in <a href="stock.html#website">Stock › Website</a>.',
                body: `<div id="t-web">${table(ds.web_prices, [
                    { h: 'Product', f: 'product' }, { h: 'Code', f: 'code', cls: 'muted' }, { h: 'Shop price', f: 'shop_price', num: true, fmt: money0 },
                    { h: 'Website price', f: 'website_price', num: true, fmt: (v, r) => (v == null ? '' : money(v) + (r.on_sale ? ' · offer' : '')) },
                    { h: 'Difference', f: 'gap_pct', num: true, fmt: signed }, { h: 'Below cost', f: 'below_cost', fmt: v => (v ? 'below cost' : ''), pill: () => 'bad' }],
                { maxH: 460, href: () => 'stock.html#website', search: r => `${r.product} ${r.code}`, empty: 'No website price is waiting.' })}</div>` })}
        </div>`;
    const draw = body => {
        timeBars(body.querySelector('#c-easypos'), ds.easypos_daily, {
            key: 'day', h: 200, ticks: 3, pad: 0.2, title: 'EasyPOS receipts per day',
            series: [{ k: 'receipts', name: 'Receipts', color: SERIES[0] }, { k: 'refunds', name: 'Refunds', color: SERIES[1] }],
            label: k => `${+k.slice(8, 10)} ${MONTHS[+k.slice(5, 7) - 1]}`, long: k => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
            extra: r => [{ name: 'Net sales', value: money(r.net || 0) }]
        });
        timeBars(body.querySelector('#c-warranty'), ds.warranty_monthly, {
            h: 180, ticks: 3, pad: 0.45, ...monthOpts, title: 'Warranty certificates', series: [{ k: 'issued', name: 'Certificates', color: SERIES[0] }],
            extra: r => [{ name: 'Machines covered', value: int(r.machines || 0) }, { name: 'Cancelled since', value: int(r.cancelled || 0) }]
        });
    };
    return { html, draw };
}

// ================================================================== tabs

// need: the big collections a page reads besides loadAll() (see dashboard-data.js).
export const DASHBOARD_PAGES = [
    { id: 'money', label: 'Money', icon: 'payments', need: ['purchaseDocs'], page: money_page },
    { id: 'stock', label: 'Stock', icon: 'inventory_2', need: ['events', 'purchaseDocs'], page: stock_page },
    { id: 'customers', label: 'Customers', icon: 'group', need: [], page: customers_page },
    { id: 'instagram', label: 'Instagram', icon: 'forum', need: ['events'], page: instagram_page },
    { id: 'purchasing', label: 'Purchasing', icon: 'receipt_long', need: ['purchaseDocs'], page: purchasing_page },
    { id: 'apps', label: 'Your apps', icon: 'apps', need: [], page: apps_page }
];

let shown = null;           // { ctx, def, view } of the page on screen, for redrawing on resize

// The header line every page shares: when the data was read, and a way to read it again.
export function liveHeader(ctx, extrasAt) {
    const at = Math.min(ctx.model.loadedAt, ...(extrasAt || []).filter(Boolean));
    ctx.setSub(`Live from Danfosal App · read ${esc(clock(at))} · amounts net of VAT unless a card says otherwise`);
    const actions = ctx.setActions(`<button class="btn" type="button" id="dash-refresh">${icon('refresh')}Refresh</button>`);
    actions.querySelector('#dash-refresh').addEventListener('click', () => { forgetExtras(); ctx.body.innerHTML = '<div class="skeleton" style="height:340px"></div>'; ctx.reload(); });
}

export async function renderDashboardPage(ctx, def) {
    ctx.setActions('');
    ctx.setSub(def.need.length ? 'Reading the chatbot log and purchasing papers…' : 'Working it out…');
    ctx.body.innerHTML = '<div class="kpis">' + '<div class="skeleton" style="height:92px"></div>'.repeat(4) + '</div><div class="skeleton" style="height:320px"></div>';
    let extras;
    try { extras = await loadExtras(def.need); }
    catch (error) {
        if (ctx.tab !== def.id) return;
        ctx.body.innerHTML = `<div class="error-box">${icon('error')}<div><b>Couldn't read this page's data.</b><br><span>${esc(error.message)}. Check the internet connection, then try again.</span></div>
            <button class="btn small" type="button" id="dash-retry" style="margin-left:auto">Try again</button></div>`;
        ctx.body.querySelector('#dash-retry').addEventListener('click', () => renderDashboardPage(ctx, def));
        return;
    }
    if (ctx.tab !== def.id || !ctx.model) return;           // the owner moved on while it loaded
    const ds = dashboardFor(ctx.model, extras, ctx.a.now);
    const view = def.page(ds, ctx);
    liveHeader(ctx, def.need.map(n => extras[n + 'At']));
    ctx.body.innerHTML = view.html;
    view.draw(ctx.body);
    if (view.wire) view.wire(ctx.body);
    wireTables(ctx.body);
    wireTooltip(ctx.body);
    shown = { ctx, def, view };
}

// Rows that open another screen, and the search boxes over the win-back and website-price tables.
export function wireTables(body) {
    if (body._dashTables) return;
    body._dashTables = true;
    const go = el => { const r = el.closest('[data-href]'); if (r) window.location.href = r.dataset.href; };
    body.addEventListener('click', e => { if (!e.target.closest('a, button, input')) go(e.target); });
    body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('tr[data-href]')) go(e.target); });
    body.addEventListener('input', e => {
        const box = e.target.closest('[data-filter-for]'); if (!box) return;
        const q = box.value.trim().toLowerCase();
        const target = body.querySelector('#' + box.dataset.filterFor);
        if (target) target.querySelectorAll('tbody tr[data-search]').forEach(tr => { tr.hidden = !!q && !tr.dataset.search.includes(q); });
    });
}

let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (shown && shown.ctx.tab === shown.def.id && shown.ctx.body.isConnected) shown.view.draw(shown.ctx.body); }, 200);
});
