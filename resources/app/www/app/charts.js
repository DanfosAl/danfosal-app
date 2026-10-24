// Hand-drawn SVG charts for Insights and its dashboard pages. No library, so they work offline on
// the desktop and on the phone, and print to PDF. Every chart is a string of SVG put into its box;
// hover text lives in a data-tip attribute (built with esc) and one floating tooltip shows it.
//
// Colours follow app.css: violet is the accent, sky blue the second series (as Insights' online
// orders), then light violet and slate. Green/amber/red are never a series - they only mean state.
import { esc, int } from './ui.js';

export const SERIES = ['#8b5cf6', '#38bdf8', '#c4b5fd', '#64748b'];
export const MUTED = '#3a3d5c';
export const INK = '#e9e9f5';

// ------------------------------------------------------------------ shared pieces

export function niceScale(max, ticks = 4) {
    if (!(max > 0)) return { top: 1, step: 1 };
    const raw = max / ticks, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw);
    return { top: Math.ceil(max / step - 1e-9) * step, step };
}

// Violet ramp from the panel colour to the accent, for heatmaps and the treemap.
export function ramp(f) {
    const a = [24, 27, 51], b = [139, 92, 246], c = [214, 202, 255];
    const mix = (x, y, t) => x.map((v, i) => Math.round(v + (y[i] - v) * t));
    const rgb = f <= 0.75 ? mix(a, b, f / 0.75) : mix(b, c, (f - 0.75) / 0.25);
    return `rgb(${rgb.join(',')})`;
}

// One floating tooltip for every chart: any element with data-tip shows it on hover.
export function wireTooltip(root) {
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
// A tooltip row. The value is a formatted figure the caller made; both sides are escaped here.
export const tipRow = (label, value, swatch) => `<div class="tr">${swatch ? `<i style="background:${swatch}"></i>` : ''}<span>${esc(label)}</span><b>${esc(value)}</b></div>`;
export const tipHtml = (title, rows = [], note = '') => `<b>${esc(title)}</b>${rows.map(r => tipRow(r.name, r.value, r.color)).join('')}${note ? `<div class="tn">${esc(note)}</div>` : ''}`;

export function legend(items) {
    return `<div class="legend">${items.map(it => `<span><i${it.line ? ' class="ln"' : it.dash ? ' class="dsh"' : ''} style="${it.dash ? '' : `background:${it.color}`}"></i>${esc(it.name)}</span>`).join('')}</div>`;
}

// Text widths without measuring the DOM: axis text is 10.5px mono, labels 12-13px sans.
const monoW = s => String(s).length * 6.4;
const sansW = s => String(s).length * 6.7;
export const fitLabel = (text, px) => { const max = Math.floor(px / 6.9); text = String(text); return text.length <= max ? text : text.slice(0, Math.max(1, max - 1)).trimEnd() + '…'; };
const topRound = (x, y, w, h, r) => { r = Math.max(0, Math.min(r, w / 2, h)); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
const rightRound = (x, y, w, h, r) => { r = Math.max(0, Math.min(r, h / 2, w)); return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`; };
const widthOf = el => Math.max(300, el.clientWidth || 0);

// ------------------------------------------------------------------ bars over time

// rows: one per month (or day). o.series [{k, name, color}] stacked, or side by side with
// o.mode 'group'; optional o.line (a dotted line, e.g. gross profit), o.marker (a dash per column,
// e.g. running costs), o.ref (a dashed reference line, e.g. the target) and o.band (how each month
// was recorded, drawn as runs under the months).
export function timeBars(el, rows, o) {
    if (!rows.length) { el.innerHTML = '<p class="empty">Nothing recorded yet.</p>'; return; }
    const W = widthOf(el), H = o.h || 240, key = o.key || 'month';
    const fmt = o.axis || int, tipFmt = o.tip || fmt;
    const bandH = o.band ? 26 : 0, T = 10, R = 4, B = 22 + bandH;
    const total = r => (o.mode === 'group' ? Math.max(...o.series.map(s => r[s.k] || 0)) : o.series.reduce((a, s) => a + Math.max(0, r[s.k] || 0), 0));
    const max = Math.max(1e-9, ...rows.map(r => Math.max(total(r), o.line ? r[o.line.k] || 0 : 0, o.marker ? r[o.marker.k] || 0 : 0)), o.ref ? o.ref.v * 1.05 : 0);
    const { top, step } = niceScale(max, o.ticks || 4);
    const ticks = []; for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
    const L = Math.ceil(Math.max(...ticks.map(t => monoW(fmt(t))))) + 12;
    const ch = H - T - B, y = v => T + ch - (v / top) * ch;
    const cw = (W - L - R) / rows.length, gap = Math.min(10, cw * (o.pad ?? 0.25)), bw = Math.max(1, cw - gap);
    const x0 = i => L + i * cw + gap / 2;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || '')}">`;
    ticks.forEach(t => { s += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 8}" y="${y(t) + 3.5}" class="ax" text-anchor="end">${esc(fmt(t))}</text>`; });
    rows.forEach((r, i) => {
        const lines = o.series.map(se => ({ name: se.name, value: tipFmt(r[se.k] || 0), color: o.series.length > 1 || o.line ? se.color : null }));
        if (o.line) lines.push({ name: o.line.name, value: tipFmt(r[o.line.k] || 0), color: o.line.color });
        if (o.marker) lines.push({ name: o.marker.name, value: r[o.marker.k] > 0 ? tipFmt(r[o.marker.k]) : 'not recorded', color: o.marker.color });
        if (o.extra) lines.push(...o.extra(r));
        s += `<g class="col" data-tip="${esc(tipHtml(o.long(r[key]), lines, o.note ? o.note(r) : ''))}"><rect class="hov" x="${L + i * cw}" y="${T}" width="${cw}" height="${ch}"/>`;
        if (o.mode === 'group') {
            const iw = bw / o.series.length;
            o.series.forEach((se, j) => { const v = r[se.k] || 0; if (v > 0) s += `<path d="${topRound(x0(i) + j * iw + iw * 0.06, y(v), iw * 0.88, y(0) - y(v), 2.5)}" fill="${se.color}"/>`; });
        } else {
            const parts = o.series.map(se => ({ se, v: Math.max(0, r[se.k] || 0) })).filter(p => p.v > 0);
            let acc = 0;
            parts.forEach((p, j) => {
                const yt = y(acc + p.v), yb = y(acc); acc += p.v;
                const h = yb - yt - (j > 0 ? 1.5 : 0); if (h <= 0.4) return;
                s += `<path d="${j === parts.length - 1 ? topRound(x0(i), yt, bw, h, Math.min(3, bw / 3)) : `M${x0(i)},${yt}h${bw}v${h}h${-bw}Z`}" fill="${p.se.color}"/>`;
            });
        }
        s += '</g>';
    });
    s += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="axis"/>`;
    if (o.marker) rows.forEach((r, i) => { const v = r[o.marker.k]; if (v > 0) s += `<rect x="${x0(i) - 2}" width="${bw + 4}" y="${y(v) - 1.5}" height="3" rx="1.5" fill="${o.marker.color}" pointer-events="none"/>`; });
    if (o.ref) {
        s += `<line x1="${L}" x2="${W - R}" y1="${y(o.ref.v)}" y2="${y(o.ref.v)}" class="ref" pointer-events="none"/>`;
        if (o.ref.label) s += `<text x="${W - R - 2}" y="${y(o.ref.v) - 5}" class="ax ref-t" text-anchor="end">${esc(o.ref.label)}</text>`;
    }
    if (o.line) {
        const pts = rows.map((r, i) => `${x0(i) + bw / 2},${y(r[o.line.k] || 0)}`);
        s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${o.line.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>`;
        pts.forEach(p => { const [cx, cy] = p.split(','); s += `<circle cx="${cx}" cy="${cy}" r="2.6" fill="${o.line.color}" stroke="var(--panel)" stroke-width="1.5" pointer-events="none"/>`; });
    }
    // x labels: as many as fit without touching
    const labels = rows.map(r => o.label(r[key]));
    const every = Math.max(1, Math.ceil((Math.max(...labels.map(monoW)) + 10) / cw));
    let lastRight = -Infinity;
    labels.forEach((t, i) => {
        if (i % every) return;
        const w = monoW(t), cx = Math.min(Math.max(x0(i) + bw / 2, L + w / 2), W - w / 2 - 1);
        if (cx - w / 2 < lastRight + 6) return;         // kept inside the chart, it would touch the one before
        lastRight = cx + w / 2;
        s += `<text x="${cx}" y="${T + ch + 15}" class="ax" text-anchor="middle">${esc(t)}</text>`;
    });
    if (o.band) {
        let i = 0;
        while (i < rows.length) {
            let j = i; const b = o.band(rows[i]);
            while (j + 1 < rows.length && o.band(rows[j + 1]) === b) j++;
            const xa = L + i * cw + 1, xb = L + (j + 1) * cw - 1, by = H - bandH + 4;
            s += `<path d="M${xa},${by + 4}V${by}H${xb}V${by + 4}" class="bracket"/>`;
            const opts = [b, ...(o.bandShort ? [o.bandShort(b)] : [])];
            const pick = opts.find(t => monoW(t) + 6 <= xb - xa);
            if (pick) s += `<text x="${(xa + xb) / 2}" y="${H - 3}" class="ax" text-anchor="middle">${esc(pick)}</text>`;
            i = j + 1;
        }
    }
    el.innerHTML = s + '</svg>';
}

// ------------------------------------------------------------------ horizontal bars

export function hBars(el, rows, o) {
    if (!rows.length) { el.innerHTML = '<p class="empty">Nothing to show yet.</p>'; return; }
    const W = widthOf(el), rh = o.rowH || 30, H = rows.length * rh + 2;
    const labels = rows.map(o.label), ends = rows.map(o.end);
    const lw = Math.min(Math.max(...labels.map(sansW)) + 14, W * 0.42);
    const ew = Math.max(...ends.map(monoW)) + 12;
    const max = Math.max(1e-9, ...rows.map(o.value));
    const span = Math.max(20, W - ew - lw);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || '')}">`;
    rows.forEach((r, i) => {
        const yy = i * rh + 1, bh = Math.min(16, rh - 10), mid = yy + rh / 2;
        const w = Math.max(0, (o.value(r) / max) * span);
        const t = o.tip(r);
        s += `<g class="col" data-tip="${esc(tipHtml(t.title, t.lines, t.note))}"${o.href ? ` data-href="${esc(o.href(r))}"` : ''}>
            <rect class="hov" x="0" y="${yy}" width="${W}" height="${rh}" rx="5"/>
            <text x="0" y="${mid + 4}" class="lab">${esc(fitLabel(labels[i], lw - 12))}</text>
            ${w > 0.5 ? `<path d="${rightRound(lw, mid - bh / 2, w, bh, 4)}" fill="${o.color(r)}"/>` : ''}
            <text x="${lw + w + 6}" y="${mid + 4}" class="end">${esc(ends[i])}</text></g>`;
    });
    el.innerHTML = s + '</svg>';
}

// ------------------------------------------------------------------ weekday x hour

export function heat(el, rows, o) {
    const hours = []; for (let h = o.from; h <= o.to; h++) hours.push(h);
    const W = widthOf(el), L = 34, T = 4, cw = (W - L - 2) / hours.length, ch = Math.max(16, Math.min(26, cw)), H = T + 7 * ch + 20;
    const max = Math.max(1, ...rows.map(o.v));
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || '')}">`;
    days.forEach((d, i) => { s += `<text x="${L - 8}" y="${T + i * ch + ch / 2 + 3.5}" class="ax" text-anchor="end">${d}</text>`; });
    rows.forEach(r => {
        if (r.hour < o.from || r.hour > o.to) return;
        const v = o.v(r), x = L + (r.hour - o.from) * cw, yy = T + r.day * ch;
        const title = `${days[r.day]} ${String(r.hour).padStart(2, '0')}:00–${String(r.hour + 1).padStart(2, '0')}:00`;
        s += `<rect x="${x + 1}" y="${yy + 1}" width="${Math.max(1, cw - 2)}" height="${ch - 2}" rx="3" fill="${v > 0 ? ramp(0.15 + 0.85 * v / max) : 'var(--panel-2)'}" data-tip="${esc(tipHtml(title, o.lines(r)))}"/>`;
    });
    const every = [1, 2, 3, 4, 6].find(k => k * cw >= 20) || 6;
    hours.forEach((h, i) => { if (h % every === 0) s += `<text x="${L + i * cw + cw / 2}" y="${H - 5}" class="ax" text-anchor="middle">${String(h).padStart(2, '0')}</text>`; });
    el.innerHTML = s + '</svg>';
}

// ------------------------------------------------------------------ family x calendar month

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function seasonGrid(el, rows, money) {
    const byFam = new Map();
    rows.forEach(r => byFam.set(r.family, (byFam.get(r.family) || 0) + r.net));
    const fams = [...byFam.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const W = widthOf(el), ml = Math.min(Math.max(...fams.map(sansW)) + 14, W * 0.36), T = 2, ch = 26, H = T + fams.length * ch + 20;
    const cw = (W - ml) / 12;
    const key = new Map(rows.map(r => [r.family + '|' + r.month_num, r]));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="When each family sells">`;
    fams.forEach((f, i) => {
        const vals = MONTHS.map((_, j) => Math.max(0, (key.get(f + '|' + (j + 1)) || {}).net || 0));
        const max = Math.max(1e-9, ...vals), tot = vals.reduce((a, v) => a + v, 0) || 1;
        s += `<text x="0" y="${T + i * ch + ch / 2 + 4}" class="lab">${esc(fitLabel(f, ml - 12))}</text>`;
        vals.forEach((v, j) => {
            const r = key.get(f + '|' + (j + 1)) || { net: 0, units: 0 };
            s += `<rect x="${ml + j * cw + 1}" y="${T + i * ch + 1}" width="${Math.max(1, cw - 2)}" height="${ch - 2}" rx="3" fill="${v > 0 ? ramp(0.1 + 0.9 * v / max) : 'var(--panel-2)'}"
                data-tip="${esc(tipHtml(`${f} · ${MONTHS_LONG[j]}`, [{ name: 'Net revenue', value: money(r.net || 0) }, { name: 'Units', value: int(r.units || 0) }, { name: "Share of the family's year", value: Math.round(100 * v / tot) + '%' }]))}"/>`;
        });
    });
    const every = [1, 2, 3, 4, 6].find(k => k * cw >= 30) || 6;
    MONTHS.forEach((mo, j) => { if (j % every === 0) s += `<text x="${ml + j * cw + cw / 2}" y="${H - 5}" class="ax" text-anchor="middle">${mo}</text>`; });
    el.innerHTML = s + '</svg>';
}

// ------------------------------------------------------------------ this month against the target

export function paceBullet(el, p, money, axis) {
    const W = widthOf(el), H = 84, ty = 34, th = 20;
    const top = Math.max(p.target || 0, p.projected || 0, p.month_to_date || 0) * 1.04 || 1;
    const x = v => 2 + (Math.max(0, v) / top) * (W - 4);
    const tip = tipHtml('This month', [
        { name: 'So far', value: money(p.month_to_date), color: SERIES[0] },
        { name: `Expected by day ${p.day}`, value: money(p.expected_by_today) },
        { name: 'Projected month', value: money(p.projected) },
        { name: 'Target', value: money(p.target) }
    ]);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="This month against the target"><g data-tip="${esc(tip)}">
        <rect x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
        <rect x="${x(0)}" y="${ty}" width="${x(top) - x(0)}" height="${th}" rx="4" fill="var(--panel-2)"/>
        <path d="${rightRound(x(0), ty, Math.max(0, x(p.projected) - x(0)), th, 4)}" fill="${SERIES[0]}" fill-opacity=".3"/>
        <path d="${rightRound(x(0), ty, Math.max(0, x(p.month_to_date) - x(0)), th, 4)}" fill="${SERIES[0]}"/>
        <line x1="${x(p.expected_by_today)}" x2="${x(p.expected_by_today)}" y1="${ty - 6}" y2="${ty + th + 6}" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
        <line x1="${x(p.target)}" x2="${x(p.target)}" y1="${ty - 10}" y2="${ty + th + 10}" class="ref"/>`;
    const place = (cx, t) => Math.min(Math.max(cx, monoW(t) / 2 + 1), W - monoW(t) / 2 - 1);
    const today = place(x(p.expected_by_today), 'today'), target = place(x(p.target), 'target');
    if (Math.abs(today - target) > 50) s += `<text x="${today}" y="${ty - 13}" class="ax" text-anchor="middle">today</text>`;
    s += `<text x="${target}" y="${ty - 13}" class="ax" text-anchor="middle">target</text>`;
    const { step } = niceScale(top, 4);
    for (let v = 0; v <= top; v += step) s += `<text x="${place(x(v), axis(v))}" y="${H - 4}" class="ax" text-anchor="middle">${esc(axis(v))}</text>`;
    el.innerHTML = s + '</g></svg>';
}

// ------------------------------------------------------------------ clearance: cash and profit against the discount

export function discountChart(el, pts, current, money, axis) {
    const W = widthOf(el), H = 220, T = 10, B = 24;
    const lo = Math.min(0, ...pts.map(p => p.profit)), hi = Math.max(1, ...pts.map(p => p.cash));
    const { top, step } = niceScale(hi - lo, 4);
    const base = lo < 0 ? -Math.ceil(-lo / step) * step : 0, ceil = base + Math.ceil((hi - base) / step) * step;
    const ticks = []; for (let v = base; v <= ceil + 1e-9; v += step) ticks.push(v);
    const L = Math.ceil(Math.max(...ticks.map(t => monoW(axis(t))))) + 12, ch = H - T - B;
    const y = v => T + ch - ((v - base) / (ceil - base || top)) * ch;
    const xMax = pts[pts.length - 1].d, x = d => L + 6 + (d / xMax) * (W - L - 16);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cash and profit at each discount">`;
    ticks.forEach(t => { s += `<line x1="${L}" x2="${W - 4}" y1="${y(t)}" y2="${y(t)}" class="${Math.abs(t) < 1e-9 ? 'axis' : 'grid'}"/><text x="${L - 8}" y="${y(t) + 3.5}" class="ax" text-anchor="end">${esc(axis(t))}</text>`; });
    for (let d = 0; d <= xMax + 1e-9; d += 0.1) s += `<text x="${x(d)}" y="${H - 6}" class="ax" text-anchor="middle">${Math.round(d * 100)}%</text>`;
    s += `<line x1="${x(current)}" x2="${x(current)}" y1="${T}" y2="${T + ch}" class="ref"/>`;
    [['cash', SERIES[1]], ['profit', SERIES[0]]].forEach(([k, c]) => {
        s += `<polyline points="${pts.map(p => `${x(p.d)},${y(p[k])}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    });
    const cur = pts.find(p => Math.abs(p.d - current) < 1e-9) || pts[0];
    [['cash', SERIES[1]], ['profit', SERIES[0]]].forEach(([k, c]) => { s += `<circle cx="${x(cur.d)}" cy="${y(cur[k])}" r="4" fill="${c}" stroke="var(--panel)" stroke-width="2"/>`; });
    // one hover strip per step, so the tooltip tells what that discount would do
    const sw = (W - L - 16) / (pts.length - 1);
    pts.forEach(p => {
        s += `<rect class="hov" x="${x(p.d) - sw / 2}" y="${T}" width="${sw}" height="${ch}" data-disc="${p.d}" data-tip="${esc(tipHtml(`${Math.round(p.d * 100)}% off`, [
            { name: 'Cash it brings in', value: money(p.cash), color: SERIES[1] },
            { name: 'Profit left', value: money(p.profit), color: SERIES[0] },
            { name: 'Margin left', value: p.margin == null ? '–' : Math.round(p.margin * 100) + '%' },
            { name: 'Below cost', value: `${int(p.below)} products` }], 'Click to use this discount'))}"/>`;
    });
    el.innerHTML = s + '</svg>';
}

// ------------------------------------------------------------------ tables

// cols: [{ h: header, f: field, num, fmt(v, r) -> text, pill(v, r) -> 'ok'|'warn'|'bad'|'', bar: true, w }]
// Every cell is text, escaped. o.href(r) makes a row open another screen; o.search(r) the text the
// search box looks in.
export function table(rows, cols, o = {}) {
    const max = {};
    cols.forEach(c => { if (c.bar) max[c.f] = Math.max(1e-9, ...rows.map(r => Math.abs(Number(r[c.f]) || 0))); });
    const head = cols.map(c => `<th${c.num ? ' class="n"' : ''}>${esc(c.h)}</th>`).join('');
    const body = rows.map(r => {
        const attrs = (o.href ? ` data-href="${esc(o.href(r))}" tabindex="0"` : '') + (o.search ? ` data-search="${esc(String(o.search(r)).toLowerCase())}"` : '');
        return `<tr${attrs}>${cols.map(c => {
            const v = r[c.f];
            const text = c.fmt ? c.fmt(v, r) : v == null ? '' : String(v);
            const pill = c.pill ? c.pill(v, r) : null;
            const inner = pill != null && text ? `<span class="chip ${pill}">${esc(text)}</span>` : esc(text);
            const bar = c.bar && v != null ? `<span class="cbar"><i style="width:${Math.max(2, (Math.abs(Number(v) || 0) / max[c.f]) * 100).toFixed(1)}%"></i></span>` : '';
            return `<td${c.num ? ' class="n"' : c.cls ? ` class="${c.cls}"` : ''}>${inner}${bar}</td>`;
        }).join('')}</tr>`;
    }).join('') || `<tr><td colspan="${cols.length}" class="muted" style="padding:14px">${esc(o.empty || 'Nothing here.')}</td></tr>`;
    return `<div class="table-wrap"${o.maxH ? ` style="max-height:${o.maxH}px"` : ''}><table class="dt${o.href ? '' : ' ro'}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
