// Insights: a handful of honest charts, every one drawn from the same definitions as Today.
//
// Honest means: amounts are net of VAT, margin only counts sales whose cost is known, and the
// months are marked by how they were recorded - the 2025 history was imported, Dec 2025-Jan 2026
// only has till sales, and from Feb 2026 EasyPOS and PDF invoices record the shop. Without that
// band, the drop from 2025 to 2026 would look like a collapse in sales rather than a change in
// what was recorded. Charts are hand-drawn SVG: no library, works offline, prints to PDF.
import { bootWorkspace } from './workspace.js';
import { esc, eur, int, icon, plural, fold, toast } from './ui.js';
import {
    DAY, saleTime, orderTime, orderTotal, netRevenue, lineNetCost, lineNetRevenues, productFamily,
    productIdOfLine, productNetCost, saleSource, VAT
} from './data.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const COVERAGE = {
    import: { label: 'Imported history', color: '#4b5b8f', note: 'sales imported from the old records' },
    gap: { label: 'Till only', color: '#7a5a1c', note: 'only sales typed into the till were recorded, so these months are incomplete' },
    live: { label: 'EasyPOS + invoices', color: '#2f6d57', note: 'every receipt and invoice recorded automatically' }
};
const k = n => n >= 10000 ? '€' + Math.round(n / 1000) + 'k' : n >= 1000 ? '€' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : '€' + Math.round(n);
const monthKey = t => { const d = new Date(t); return d.getFullYear() * 12 + d.getMonth(); };
const monthLabel = mk => `${MONTHS[mk % 12]} ${Math.floor(mk / 12)}`;

// ================================================================== data

function prepare(m) {
    if (m._insights) return m._insights;
    const knownIds = new Set(m.products.map(p => p._id));
    const productById = new Map(m.products.map(p => [p._id, p]));
    const sales = [], lines = [], orders = [];
    m.sales.filter(s => !s.isReturn).forEach(s => {
        const t = saleTime(s); if (isNaN(t)) return;
        const items = s.items || [];
        const nets = lineNetRevenues(s);
        let cost = 0, costed = items.length > 0;
        items.forEach((it, i) => {
            const c = lineNetCost(it), qty = Number(it.quantity) || 1;
            if (c === null) costed = false; else cost += c * qty;
            const pid = productIdOfLine(it, knownIds);
            const name = (pid && productById.get(pid).name) || it.name || it.productName || '?';
            lines.push({ t, net: nets[i], cost: c === null ? null : c * qty, qty, pid, name, family: productFamily(name, it), src: saleSource(s) });
        });
        sales.push({ t, net: netRevenue(s), cost: costed ? cost : null, src: saleSource(s), easypos: s.type === 'easypos' });
    });
    m.orders.forEach(o => { const t = orderTime(o); if (!isNaN(t)) orders.push({ t, net: orderTotal(o) / VAT }); });

    // Month by month, from the first recorded sale to this month.
    const first = Math.min(...sales.map(s => s.t), ...orders.map(o => o.t));
    const nowMk = monthKey(Date.now());
    const months = [];
    for (let mk = monthKey(first); mk <= nowMk; mk++) months.push({ mk, costedNet: 0, cost: 0, uncosted: 0, online: 0, count: 0, src: {} });
    const byMk = new Map(months.map(x => [x.mk, x]));
    sales.forEach(s => {
        const x = byMk.get(monthKey(s.t)); if (!x) return;
        x.count++; x.src[s.src] = (x.src[s.src] || 0) + 1;
        if (s.cost === null) x.uncosted += s.net; else { x.costedNet += s.net; x.cost += s.cost; }
    });
    orders.forEach(o => { const x = byMk.get(monthKey(o.t)); if (x) x.online += o.net; });
    months.forEach(x => {
        // Most of the month's sales decide: Dec 2025 has 1 imported sale among 24 till sales.
        x.coverage = (x.src.EasyPOS || x.src.PDF) ? 'live' : (x.src.Import || 0) * 2 >= x.count ? 'import' : 'gap';
        x.total = x.costedNet + x.uncosted + x.online;
        x.profit = x.costedNet - x.cost;
    });
    return (m._insights = { sales, lines, orders, months });
}

function periodRange(id, now = Date.now()) {
    const y = new Date(now).getFullYear();
    return {
        '90d': [now - 90 * DAY, now + DAY, 'Last 90 days'],
        '12m': [now - 365 * DAY, now + DAY, 'Last 12 months'],
        ytd: [new Date(y, 0, 1).getTime(), now + DAY, String(y)],
        ly: [new Date(y - 1, 0, 1).getTime(), new Date(y, 0, 1).getTime(), String(y - 1)],
        all: [0, now + DAY, 'All time']
    }[id];
}
const PERIODS = ['90d', '12m', 'ytd', 'ly', 'all'];

// ================================================================== small chart helpers

function niceScale(max, ticks = 4) {
    if (!(max > 0)) return { top: 1, step: 1 };
    const raw = max / ticks, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw);
    return { top: Math.ceil(max / step) * step, step };
}

// Violet ramp from the panel colour to the accent, for heatmaps and the treemap.
function ramp(f) {
    const a = [24, 27, 51], b = [139, 92, 246], c = [214, 202, 255];
    const mix = (x, y, t) => x.map((v, i) => Math.round(v + (y[i] - v) * t));
    const rgb = f <= 0.75 ? mix(a, b, f / 0.75) : mix(b, c, (f - 0.75) / 0.25);
    return `rgb(${rgb.join(',')})`;
}
// Margin colour: low margins warm, healthy margins violet, unknown grey.
function marginColor(mg) {
    if (mg === null || isNaN(mg)) return '#3a3d5c';
    const f = Math.max(0, Math.min(1, (mg - 0.15) / 0.45));
    const lo = [150, 70, 60], mid = [120, 80, 170], hi = [124, 92, 246];
    const mix = (x, y, t) => x.map((v, i) => Math.round(v + (y[i] - v) * t));
    return `rgb(${(f < 0.5 ? mix(lo, mid, f * 2) : mix(mid, hi, (f - 0.5) * 2)).join(',')})`;
}

// Squarified treemap (Bruls et al.): rows of tiles whose aspect ratios stay close to square.
function treemap(items, x, y, w, h) {
    const total = items.reduce((a, i) => a + i.value, 0);
    if (!total) return [];
    const scale = (w * h) / total;
    const nodes = items.map(i => ({ ...i, area: i.value * scale }));
    const out = [];
    const worst = (row, side) => {
        const s = row.reduce((a, r) => a + r.area, 0), mx = Math.max(...row.map(r => r.area)), mn = Math.min(...row.map(r => r.area));
        return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
    };
    let row = [], rect = { x, y, w, h };
    const layout = () => {
        const s = row.reduce((a, r) => a + r.area, 0);
        if (rect.w >= rect.h) {
            const cw = s / rect.h; let cy = rect.y;
            row.forEach(r => { const rh = r.area / cw; out.push({ ...r, x: rect.x, y: cy, w: cw, h: rh }); cy += rh; });
            rect = { x: rect.x + cw, y: rect.y, w: rect.w - cw, h: rect.h };
        } else {
            const rh = s / rect.w; let cx = rect.x;
            row.forEach(r => { const cw = r.area / rh; out.push({ ...r, x: cx, y: rect.y, w: cw, h: rh }); cx += cw; });
            rect = { x: rect.x, y: rect.y + rh, w: rect.w, h: rect.h - rh };
        }
        row = [];
    };
    nodes.forEach(n => {
        const side = Math.min(rect.w, rect.h);
        if (!row.length || worst([...row, n], side) <= worst(row, side)) row.push(n);
        else { layout(); row.push(n); }
    });
    if (row.length) layout();
    return out;
}

// One floating tooltip for every chart: any element with data-tip shows it on hover.
function wireTooltip(root) {
    if (root._tipWired) return;
    root._tipWired = true;
    let tip = document.getElementById('viz-tip');
    if (!tip) { tip = document.createElement('div'); tip.id = 'viz-tip'; tip.className = 'viz-tip'; tip.hidden = true; document.body.appendChild(tip); }
    root.addEventListener('mousemove', e => {
        const t = e.target.closest('[data-tip]');
        if (!t) { tip.hidden = true; return; }
        tip.innerHTML = t.getAttribute('data-tip');
        tip.hidden = false;
        const r = tip.getBoundingClientRect();
        let left = e.clientX + 14, top = e.clientY + 14;
        if (left + r.width > window.innerWidth - 8) left = e.clientX - r.width - 14;
        if (top + r.height > window.innerHeight - 8) top = e.clientY - r.height - 14;
        tip.style.left = left + 'px'; tip.style.top = top + 'px';
    });
    root.addEventListener('mouseleave', () => { tip.hidden = true; });
}
const tipRow = (label, value, swatch) => `<div class="tr">${swatch ? `<i style="background:${swatch}"></i>` : ''}<span>${esc(label)}</span><b>${value}</b></div>`;

// ================================================================== charts

function monthlyChart(el, months, range) {
    const W = Math.max(320, el.clientWidth), H = 300;
    const L = 52, R = 8, T = 14, B = 58, ch = H - T - B;
    const { top, step } = niceScale(Math.max(...months.map(x => x.total), 1));
    const bw = (W - L - R) / months.length, gap = Math.min(6, bw * 0.22);
    const y = v => T + ch - (v / top) * ch;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Net revenue and gross profit by month">
        <defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#2a2d4d"/><line x1="0" y1="0" x2="0" y2="5" stroke="#5b5f8f" stroke-width="2"/></pattern></defs>`;
    for (let v = 0; v <= top + 1e-9; v += step) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 8}" y="${y(v) + 4}" class="ax" text-anchor="end">${k(v)}</text>`;
    months.forEach((x, i) => {
        const bx = L + i * bw + gap / 2, w = bw - gap;
        const start = new Date(Math.floor(x.mk / 12), x.mk % 12, 1).getTime(), end = new Date(Math.floor(x.mk / 12), x.mk % 12 + 1, 1).getTime();
        const inRange = end > range[0] && start < range[1];
        const segs = [['cost', x.cost, '#2e3260'], ['profit', x.profit, '#8b5cf6'], ['uncosted', x.uncosted, 'url(#hatch)'], ['online', x.online, '#38bdf8']];
        let acc = 0;
        const tip = `<b>${monthLabel(x.mk)}</b>${tipRow('Net revenue', eur(x.total))}${tipRow('Gross profit', eur(x.profit), '#8b5cf6')}${tipRow('Cost of goods', eur(x.cost), '#2e3260')}${x.uncosted ? tipRow('Sales with unknown cost', eur(x.uncosted), '#5b5f8f') : ''}${x.online ? tipRow('Online orders', eur(x.online), '#38bdf8') : ''}${tipRow('Sales', int(x.count))}${x.costedNet ? tipRow('Margin (costed)', Math.round(100 * x.profit / x.costedNet) + '%') : ''}<div class="tn">${esc(COVERAGE[x.coverage].label)}: ${esc(COVERAGE[x.coverage].note)}</div>`;
        s += `<g opacity="${inRange ? 1 : 0.35}" data-tip="${esc(tip)}"><rect x="${bx}" y="${T}" width="${w}" height="${ch}" fill="transparent"/>`;
        segs.forEach(([, v, fill]) => { if (v > 0) { const h = (v / top) * ch; s += `<rect x="${bx}" y="${y(acc + v)}" width="${w}" height="${Math.max(0.5, h)}" fill="${fill}" rx="${Math.min(2, w / 4)}"/>`; acc += v; } });
        s += `</g>`;
        if (x.mk % 12 === 0 || i === 0 || bw > 34 || (bw > 17 && x.mk % 2 === 0) || (bw > 11 && x.mk % 3 === 0))
            s += `<text x="${bx + w / 2}" y="${T + ch + 16}" class="ax" text-anchor="middle">${MONTHS[x.mk % 12]}${x.mk % 12 === 0 || i === 0 ? ' ' + String(Math.floor(x.mk / 12)).slice(2) : ''}</text>`;
    });
    // Coverage band: how each month was recorded, merged into runs.
    let i = 0;
    while (i < months.length) {
        let j = i; while (j + 1 < months.length && months[j + 1].coverage === months[i].coverage) j++;
        const c = COVERAGE[months[i].coverage], x0 = L + i * bw + 1, x1 = L + (j + 1) * bw - 1;
        s += `<g data-tip="${esc(`<b>${c.label}</b><div class="tn">${monthLabel(months[i].mk)} – ${monthLabel(months[j].mk)}: ${c.note}.</div>`)}"><rect x="${x0}" y="${T + ch + 26}" width="${Math.max(2, x1 - x0)}" height="18" rx="4" fill="${c.color}"/>`;
        if (x1 - x0 > 70) s += `<text x="${(x0 + x1) / 2}" y="${T + ch + 39}" class="band" text-anchor="middle">${esc(c.label)}</text>`;
        s += `</g>`;
        i = j + 1;
    }
    el.innerHTML = s + '</svg>';
}

function calendarChart(el, sales, orders, now = Date.now()) {
    const end = new Date(now); end.setHours(0, 0, 0, 0);
    const dow = (end.getDay() + 6) % 7;                          // Monday first
    const start = new Date(end.getTime() - (52 * 7 + dow) * DAY);
    const days = new Map();
    const add = (t, v, n) => { if (t < start.getTime()) return; const d = new Date(t); d.setHours(0, 0, 0, 0); const key = d.getTime(); const x = days.get(key) || { v: 0, n: 0 }; x.v += v; x.n += n; days.set(key, x); };
    sales.forEach(s => add(s.t, s.net, 1)); orders.forEach(o => add(o.t, o.net, 1));
    const values = [...days.values()].map(x => x.v).filter(v => v > 0).sort((a, b) => a - b);
    const q = f => values.length ? values[Math.min(values.length - 1, Math.floor(f * values.length))] : 0;
    const cuts = [q(0.25), q(0.5), q(0.75), q(0.93)];
    const level = v => v <= 0 ? 0 : 1 + cuts.filter(c => v > c).length;
    const colors = ['var(--panel-2)', ramp(0.3), ramp(0.5), ramp(0.7), ramp(0.85), ramp(1)];
    const W = Math.max(320, el.clientWidth), L = 30, T = 18;
    const cell = Math.max(7, Math.min(17, Math.floor((W - L - 4) / 53) - 2)), g = 2, H = T + 7 * (cell + g) + cell + 14;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue by day over the last year">`;
    [0, 2, 4].forEach(r => { s += `<text x="${L - 6}" y="${T + r * (cell + g) + cell - 2}" class="ax" text-anchor="end">${WEEKDAYS[r]}</text>`; });
    let lastMonth = -1;
    for (let w = 0; w < 53; w++) for (let d = 0; d < 7; d++) {
        const t = start.getTime() + (w * 7 + d) * DAY;
        if (t > end.getTime()) continue;
        const date = new Date(t), x = days.get(t) || { v: 0, n: 0 };
        const cx = L + w * (cell + g), cy = T + d * (cell + g);
        if (d === 0 && date.getMonth() !== lastMonth && date.getDate() <= 7) { lastMonth = date.getMonth(); s += `<text x="${cx}" y="${T - 6}" class="ax">${MONTHS[lastMonth]}</text>`; }
        const label = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        s += `<rect x="${cx}" y="${cy}" width="${cell}" height="${cell}" rx="2.5" fill="${colors[level(x.v)]}" data-tip="${esc(`<b>${label}</b>${x.n ? tipRow('Net revenue', eur(x.v)) + tipRow('Sales', int(x.n)) : '<div class="tn">No sales recorded</div>'}`)}"/>`;
    }
    const lx = W - 5 * (cell + g) - 44, ly = H - cell - 2;
    s += `<text x="${lx - 6}" y="${ly + cell - 3}" class="ax" text-anchor="end">Less</text>`;
    colors.slice(1).forEach((c, i) => { s += `<rect x="${lx + i * (cell + g)}" y="${ly}" width="${cell}" height="${cell}" rx="2.5" fill="${c}"/>`; });
    s += `<text x="${lx + 5 * (cell + g) + 4}" y="${ly + cell - 3}" class="ax">More</text>`;
    el.innerHTML = s + '</svg>';
}

// When the shop sells. EasyPOS receipts carry the real time of sale; imported history doesn't.
function hoursChart(el, sales, range) {
    let pick = sales.filter(s => s.easypos && s.t >= range[0] && s.t < range[1]);
    const note = el.parentElement.querySelector('.chart-note');
    if (pick.length < 20) { pick = sales.filter(s => s.easypos); if (note) note.textContent = `All ${int(pick.length)} EasyPOS receipts (too few in this period for a pattern).`; }
    else if (note) note.textContent = `${int(pick.length)} EasyPOS receipts in this period. Imported history has no time of day, so it isn't included.`;
    const H0 = 8, H1 = 20, grid = WEEKDAYS.map(() => Array(H1 - H0 + 1).fill(null).map(() => ({ n: 0, v: 0 })));
    pick.forEach(s => { const d = new Date(s.t), h = Math.min(H1, Math.max(H0, d.getHours())); const c = grid[(d.getDay() + 6) % 7][h - H0]; c.n++; c.v += s.net; });
    const max = Math.max(1, ...grid.flat().map(c => c.n));
    const W = Math.max(300, el.clientWidth), L = 36, T = 8, cols = H1 - H0 + 1;
    const cw = (W - L - 4) / cols, rh = 24, H = T + 7 * rh + 22;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Receipts by weekday and hour">`;
    grid.forEach((row, r) => {
        s += `<text x="${L - 8}" y="${T + r * rh + rh / 2 + 4}" class="ax" text-anchor="end">${WEEKDAYS[r]}</text>`;
        row.forEach((c, i) => {
            const x = L + i * cw, y = T + r * rh;
            s += `<rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${rh - 2}" rx="4" fill="${c.n ? ramp(0.15 + 0.85 * c.n / max) : 'var(--panel-2)'}" data-tip="${esc(`<b>${WEEKDAYS[r]} ${pad2(H0 + i)}:00–${pad2(H0 + i + 1)}:00</b>${tipRow('Receipts', int(c.n))}${tipRow('Net revenue', eur(c.v))}`)}"/>`;
            if (c.n && cw > 22) s += `<text x="${x + cw / 2}" y="${y + rh / 2 + 4}" class="cell" text-anchor="middle" fill="${c.n / max > 0.55 ? '#140c2e' : '#e9e9f5'}">${c.n}</text>`;
        });
    });
    for (let i = 0; i < cols; i += cw > 40 ? 1 : 2) s += `<text x="${L + i * cw + cw / 2}" y="${H - 6}" class="ax" text-anchor="middle">${pad2(H0 + i)}</text>`;
    el.innerHTML = s + '</svg>';
}
const pad2 = n => String(n).padStart(2, '0');

const fitLabel = (text, px) => { const max = Math.floor(px / 7.4); return text.length <= max ? text : text.slice(0, Math.max(1, max - 1)).trimEnd() + '…'; };

function familyTreemap(el, fams, selected) {
    const W = Math.max(300, el.clientWidth), H = 330;
    const tiles = treemap(fams.filter(f => f.net > 0).map(f => ({ ...f, value: f.net })), 0, 0, W, H);
    const total = fams.reduce((a, f) => a + f.net, 0);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue and margin by product family">`;
    tiles.forEach(t => {
        const mg = t.costedNet > 0 ? t.profit / t.costedNet : null;
        const dim = selected && selected !== t.family;
        const tip = `<b>${esc(t.family)}</b>${tipRow('Net revenue', eur(t.net))}${tipRow('Share of revenue', Math.round(100 * t.net / total) + '%')}${tipRow('Gross profit', eur(t.profit))}${tipRow('Margin', mg === null ? 'unknown' : Math.round(100 * mg) + '%')}${tipRow('Units', int(t.units))}${t.costedNet < t.net * 0.9 ? `<div class="tn">Margin covers ${Math.round(100 * t.costedNet / t.net)}% of this revenue; the rest has no cost price.</div>` : ''}<div class="tn">Click to see its best sellers.</div>`;
        s += `<g class="tile" data-family="${esc(t.family)}" data-tip="${esc(tip)}" opacity="${dim ? 0.35 : 1}" style="cursor:pointer">
            <rect x="${t.x + 1.5}" y="${t.y + 1.5}" width="${Math.max(0, t.w - 3)}" height="${Math.max(0, t.h - 3)}" rx="6" fill="${marginColor(mg)}"${selected === t.family ? ' stroke="#e9e9f5" stroke-width="2"' : ''}/>`;
        if (t.w > 86 && t.h > 44) {
            s += `<text x="${t.x + 11}" y="${t.y + 22}" class="tl">${esc(fitLabel(t.family, t.w - 20))}</text>
                  <text x="${t.x + 11}" y="${t.y + 40}" class="tv">${k(t.net)}${mg !== null ? ' · ' + Math.round(100 * mg) + '%' : ''}</text>`;
        } else if (t.w > 40 && t.h > 24) s += `<text x="${t.x + 7}" y="${t.y + 17}" class="tv">${Math.round(100 * t.net / total)}%</text>`;
        s += `</g>`;
    });
    el.innerHTML = s + '</svg>';
}

// ================================================================== screen

const state = { period: '12m', family: null };
let lastCtx = null;

function renderInsights(ctx) {
    lastCtx = ctx;
    const d = prepare(ctx.model), a = ctx.a;
    const range = periodRange(state.period, a.now);
    const inR = t => t >= range[0] && t < range[1];
    const sales = d.sales.filter(s => inR(s.t)), orders = d.orders.filter(o => inR(o.t)), lines = d.lines.filter(l => inR(l.t));
    const salesNet = sales.reduce((x, s) => x + s.net, 0), onlineNet = orders.reduce((x, o) => x + o.net, 0);
    const costed = sales.filter(s => s.cost !== null);
    const costedNet = costed.reduce((x, s) => x + s.net, 0), cost = costed.reduce((x, s) => x + s.cost, 0);
    const profit = costedNet - cost, margin = costedNet > 0 ? profit / costedNet : null;
    const coverages = new Set(d.months.filter(x => { const st = new Date(Math.floor(x.mk / 12), x.mk % 12, 1).getTime(); return st < range[1] && new Date(Math.floor(x.mk / 12), x.mk % 12 + 1, 1).getTime() > range[0]; }).map(x => x.coverage));

    // Families and products in the period.
    const famMap = new Map(), prodMap = new Map();
    lines.forEach(l => {
        const f = famMap.get(l.family) || { family: l.family, net: 0, costedNet: 0, profit: 0, units: 0 };
        f.net += l.net; f.units += l.qty; if (l.cost !== null) { f.costedNet += l.net; f.profit += l.net - l.cost; }
        famMap.set(l.family, f);
        const key = fold(l.name).replace(/\s+/g, ' ').trim();   // two catalogue records with one name are one product here
        const p = prodMap.get(key) || { key, name: l.name, family: l.family, net: 0, costedNet: 0, profit: 0, units: 0 };
        p.net += l.net; p.units += l.qty; if (l.cost !== null) { p.costedNet += l.net; p.profit += l.net - l.cost; }
        prodMap.set(key, p);
    });
    const fams = [...famMap.values()].sort((x, y) => y.net - x.net);
    if (state.family && !famMap.has(state.family)) state.family = null;
    const best = [...prodMap.values()].filter(p => !state.family || p.family === state.family).sort((x, y) => y.net - x.net).slice(0, 12);

    // Stock by how long since each product last sold.
    const buckets = [['30 days', 30, '#8b5cf6'], ['31–90 days', 90, '#6d5bb8'], ['3–6 months', 182, '#8a6a2a'], ['6–12 months', 365, '#9a4b3a'], ['Over a year', Infinity, '#8a3434'], ['Never sold', null, '#5a2323']]
        .map(([label, days, color]) => ({ label, days, color, value: 0, items: [] }));
    a.stockValue && ctx.model.products.forEach(p => {
        const stock = Number(p.stock) || 0, c = productNetCost(p);
        if (!(stock > 0) || !c) return;
        const last = a.lastSoldAt[p._id];
        const age = last ? (a.now - last) / DAY : null;
        const b = age === null ? buckets[5] : buckets.find(x => x.days !== null && age <= x.days);
        b.value += stock * c; b.items.push({ p, value: stock * c, last });
    });
    const stockTotal = buckets.reduce((x, b) => x + b.value, 0);
    const stale = buckets.slice(2).flatMap(b => b.items).sort((x, y) => y.value - x.value).slice(0, 8);

    // Supplier cost changes: purchase batches deduplicated by invoice.
    const costChanges = ctx.model.products.map(p => {
        const seen = new Map();
        (p.batches || []).forEach(b => { const key = b.invoice || b.date; if (Number(b.cost) > 0 && !seen.has(key)) seen.set(key, { cost: Number(b.cost), date: Number(b.date) || 0, supplier: b.supplier || '' }); });
        const list = [...seen.values()].sort((x, y) => x.date - y.date);
        if (list.length < 2) return null;
        const f = list[0], l = list[list.length - 1];
        return f.cost !== l.cost ? { p, from: f, to: l, change: (l.cost - f.cost) / f.cost } : null;
    }).filter(Boolean).sort((x, y) => Math.abs(y.change) - Math.abs(x.change));

    ctx.setSub(`${esc(range[2])} · all amounts net of VAT`);
    const actions = ctx.setActions(`<div class="seg" role="group" aria-label="Period">${PERIODS.map(p => `<button type="button" data-p="${p}" aria-pressed="${p === state.period}">${esc(periodRange(p, a.now)[2])}</button>`).join('')}</div>
        <button class="btn" type="button" id="export-pdf">${icon('picture_as_pdf')}Export PDF</button>`);
    actions.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { state.period = b.dataset.p; renderInsights(ctx); }));
    actions.querySelector('#export-pdf').addEventListener('click', () => exportPdf(range[2]));

    const mixNote = coverages.size > 1 ? `<span class="chip warn" data-tip="${esc('<b>Mixed recording</b><div class="tn">This period includes months recorded in different ways (see the band under the monthly chart), so compare months within the same band.</div>')}">mixed recording</span>` : coverages.has('gap') ? '<span class="chip warn">incomplete months</span>' : '';
    ctx.body.innerHTML = `
        <div class="print-head"><b>Danfosal · Insights</b><span>${esc(range[2])} · printed ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · amounts net of VAT</span></div>
        <div class="kpis kpis-6">
            <div class="kpi"><small>Net revenue ${mixNote}</small><span class="v">${eur(salesNet + onlineNet)}</span><span class="d">${plural(sales.length, 'sale', 'sales')}${orders.length ? ` + ${plural(orders.length, 'online order', 'online orders')}` : ''}</span></div>
            <div class="kpi"><small>Gross profit</small><span class="v">${eur(profit)}</span><span class="d">on sales with a known cost</span></div>
            <div class="kpi"><small>Margin</small><span class="v">${margin === null ? '–' : Math.round(100 * margin) + '%'}</span><span class="d">net, after cost of goods</span></div>
            <div class="kpi"><small>Average sale</small><span class="v">${sales.length ? eur(salesNet / sales.length) : '–'}</span><span class="d">net, per receipt or invoice</span></div>
            <div class="kpi"><small>Costed</small><span class="v">${salesNet ? Math.round(100 * costedNet / salesNet) + '%' : '–'}</span><span class="d">of revenue has a cost price</span></div>
            <div class="kpi"><small>Stock at cost</small><span class="v">${eur(stockTotal)}</span><span class="d">${stockTotal ? Math.round(100 * (buckets[2].value + buckets[3].value + buckets[4].value + buckets[5].value) / stockTotal) + '% unsold for 3+ months' : ''}</span></div>
        </div>

        <section class="panel viz" aria-labelledby="h-month">
            <div class="viz-head"><h2 class="panel-title" id="h-month">Revenue and profit, month by month</h2>
                <div class="legend"><span><i style="background:#8b5cf6"></i>Gross profit</span><span><i style="background:#2e3260"></i>Cost of goods</span><span><i class="hatch"></i>Cost unknown</span><span><i style="background:#38bdf8"></i>Online orders</span></div></div>
            <div class="chart" id="c-month"></div>
            <p class="chart-note">The band shows how each month was recorded. Compare months within one band: the 2025 history was imported in bulk, the two till-only months are incomplete, and EasyPOS records the shop from February 2026. The selected period is highlighted.</p>
        </section>

        <div class="cols" style="grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)">
            <section class="panel viz" aria-labelledby="h-fam">
                <div class="viz-head"><h2 class="panel-title" id="h-fam">Where the profit comes from</h2>
                    <div class="legend"><span>size = revenue</span><span><i style="background:${marginColor(0.15)}"></i>low margin</span><span><i style="background:${marginColor(0.6)}"></i>high margin</span></div></div>
                <div class="chart" id="c-fam"></div>
                <p class="chart-note">${fams.length ? `Product families by net revenue, coloured by margin. ${esc(fams[0].family)} brings ${Math.round(100 * fams[0].net / (salesNet || 1))}% of revenue.` : 'No sales in this period.'} Click a family to filter the best sellers.</p>
            </section>
            <section class="panel viz" aria-labelledby="h-best">
                <div class="viz-head"><h2 class="panel-title" id="h-best">Best sellers${state.family ? ` · ${esc(state.family)}` : ''}</h2>
                    ${state.family ? `<button class="btn ghost small" type="button" id="clear-fam">${icon('close')}All families</button>` : ''}</div>
                <div class="rank" id="c-best">${best.map((p, i) => { const mg = p.costedNet > 0 ? p.profit / p.costedNet : null; return `
                    <div class="rank-row" data-tip="${esc(`<b>${esc(p.name)}</b>${tipRow('Net revenue', eur(p.net))}${tipRow('Units', int(p.units))}${tipRow('Gross profit', eur(p.profit))}${tipRow('Margin', mg === null ? 'unknown' : Math.round(100 * mg) + '%')}<div class="tn">${esc(p.family)}</div>`)}">
                        <span class="rk">${i + 1}</span>
                        <div class="rn"><b>${esc(p.name)}</b><span class="rb"><i style="width:${(100 * p.net / best[0].net).toFixed(1)}%;background:${marginColor(mg)}"></i></span></div>
                        <span class="rv">${eur(p.net)}<small>${int(p.units)} units · ${mg === null ? 'margin ?' : Math.round(100 * mg) + '%'}</small></span></div>`; }).join('') || '<p class="empty">No sales in this period.</p>'}</div>
            </section>
        </div>

        <section class="panel viz" aria-labelledby="h-cal">
                <div class="viz-head"><h2 class="panel-title" id="h-cal">Every day of the last year</h2></div>
                <div class="chart" id="c-cal"></div>
                <p class="chart-note">Net revenue per day, including online orders. Empty squares are days with no recorded sale.</p>
            </section>

        <div class="cols" style="grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)">
            <section class="panel viz" aria-labelledby="h-stock">
                <div class="viz-head"><h2 class="panel-title" id="h-stock">How long your stock has been waiting</h2><span class="muted">${eur(stockTotal)} at cost</span></div>
                <div class="stackbar">${buckets.filter(b => b.value > 0).map(b => `<i style="flex:${b.value};background:${b.color}" data-tip="${esc(`<b>Last sold: ${b.label === 'Never sold' ? 'never' : 'within ' + b.label}</b>${tipRow('Stock at cost', eur(b.value))}${tipRow('Share', Math.round(100 * b.value / stockTotal) + '%')}${tipRow('Products', int(b.items.length))}`)}"></i>`).join('')}</div>
                <div class="legend" style="margin:10px 0 12px">${buckets.map(b => `<span><i style="background:${b.color}"></i>${esc(b.label)} <b>${k(b.value)}</b></span>`).join('')}</div>
                ${stale.length ? `<div class="lines">${stale.map(x => `<div class="line"><div><b><a href="stock.html?q=${encodeURIComponent(x.p.name)}#catalogue" style="text-decoration:none">${esc(x.p.name)}</a></b><span>${int(Number(x.p.stock) || 0)} in stock · last sold ${x.last ? new Date(x.last).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : 'never'}</span></div><span class="n">${eur(x.value)}</span></div>`).join('')}</div>` : ''}
            </section>
            <div class="stack"><section class="panel viz" aria-labelledby="h-hours">
                <div class="viz-head"><h2 class="panel-title" id="h-hours">When customers buy</h2></div>
                <div class="chart" id="c-hours"></div>
                <p class="chart-note"></p>
            </section>
            <section class="panel viz" aria-labelledby="h-sup">
                <div class="viz-head"><h2 class="panel-title" id="h-sup">Supplier price changes</h2></div>
                ${costChanges.length ? `<div class="lines">${costChanges.slice(0, 10).map(c => `<div class="line"><div><b>${esc(c.p.name)}</b><span>€${c.from.cost.toFixed(2)} → €${c.to.cost.toFixed(2)}${c.to.supplier ? ' · ' + esc(c.to.supplier) : ''}${c.to.date ? ' · ' + new Date(c.to.date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : ''}</span></div><span class="n"><span class="chip ${c.change > 0 ? 'bad' : 'ok'}">${c.change > 0 ? '+' : ''}${Math.round(100 * c.change)}%</span></span></div>`).join('')}</div>`
                : `<p class="empty">No product has been bought at two different prices yet. Only ${plural(ctx.model.products.filter(p => (p.batches || []).length).length, 'product has', 'products have')} a recorded purchase; each delivery received through Receive delivery adds one, and price rises will show here.</p>`}
            </section></div>
        </div>`;

    monthlyChart(ctx.body.querySelector('#c-month'), d.months, range);
    familyTreemap(ctx.body.querySelector('#c-fam'), fams, state.family);
    calendarChart(ctx.body.querySelector('#c-cal'), d.sales, d.orders, a.now);
    hoursChart(ctx.body.querySelector('#c-hours'), d.sales, range);
    wireTooltip(ctx.body);
    ctx.body.querySelector('#c-fam').addEventListener('click', e => {
        const t = e.target.closest('[data-family]'); if (!t) return;
        state.family = state.family === t.dataset.family ? null : t.dataset.family; renderInsights(ctx);
    });
    const clear = ctx.body.querySelector('#clear-fam');
    if (clear) clear.addEventListener('click', () => { state.family = null; renderInsights(ctx); });
}

async function exportPdf(periodLabel) {
    const name = `Danfosal insights ${periodLabel} ${new Date().toISOString().slice(0, 10)}`;
    document.getElementById('viz-tip')?.setAttribute('hidden', '');
    if (window.electronAPI && window.electronAPI.savePagePDF) {
        try { const r = await window.electronAPI.savePagePDF(name); if (r && r.saved) toast('PDF saved'); }
        catch (e) { toast(`Couldn't save the PDF: ${e.message}`, { bad: true }); }
    } else window.print();
}

let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (lastCtx && lastCtx.tab === 'overview' && lastCtx.model) renderInsights(lastCtx); }, 200); });

// ================================================================== boot

bootWorkspace({
    active: 'insights', title: 'Insights', defaultTab: 'overview',
    tabs: [
        { id: 'overview', label: 'Overview', icon: 'insights', render: renderInsights },
        { label: 'Forecasts', icon: 'trending_up', href: 'business-intelligence.html' }
    ]
});
