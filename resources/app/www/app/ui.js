// Small display helpers shared by every new screen.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Names and addresses come from OCR'd receipts, so every value is escaped before it reaches innerHTML.
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => HTML_ESCAPES[c]);

export const eur = (n, decimals = 0) => '€' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
export const int = n => Number(n || 0).toLocaleString('en-US');
export const pct = (part, whole) => whole > 0 ? Math.round(100 * part / whole) + '%' : '–';
export const icon = (name, extra = '') => `<span class="ms ${extra}" aria-hidden="true">${name}</span>`;
export const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many}`;

export function ago(ms, now = Date.now()) {
    if (!ms || isNaN(ms)) return 'never';
    const minutes = Math.round((now - ms) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return plural(hours, 'hour', 'hours') + ' ago';
    const days = Math.round(hours / 24);
    return plural(days, 'day', 'days') + ' ago';
}

export const clock = ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const day = ms => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// ------------------------------------------------------------------ feedback

// Short confirmation after every write, so a save is never silent.
export function toast(message, { bad = false } = {}) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const el = document.createElement('div');
    el.className = 'toast' + (bad ? ' bad' : '');
    el.setAttribute('role', 'status');
    el.innerHTML = `${icon(bad ? 'error' : 'check_circle')}<span>${esc(message)}</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), bad ? 6000 : 3200);
}

// Side panel for viewing and editing one record. Esc or the backdrop closes it.
export function openDrawer({ title, sub = '', body = '', foot = '', label = title }) {
    closeDrawer();
    const opener = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.className = 'drawer-backdrop'; backdrop.id = 'drawer-backdrop';
    const el = document.createElement('aside');
    el.className = 'drawer'; el.id = 'drawer';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', label);
    el.innerHTML = `
        <div class="drawer-head"><div style="flex:1;min-width:0"><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
            <button class="btn ghost small" type="button" data-close aria-label="Close">${icon('close')}</button></div>
        <div class="drawer-body">${body}</div>
        ${foot ? `<div class="drawer-foot">${foot}</div>` : ''}`;
    const close = () => { closeDrawer(); if (opener && opener.focus) opener.focus(); };
    backdrop.addEventListener('click', close);
    el.querySelector('[data-close]').addEventListener('click', close);
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    document.body.append(backdrop, el);
    const first = el.querySelector('input, select, textarea, button:not([data-close])');
    (first || el).focus();
    return { el, close };
}
export function closeDrawer() {
    document.getElementById('drawer')?.remove();
    document.getElementById('drawer-backdrop')?.remove();
}

// Confirmation / small form dialog. Resolves with the dialog element on confirm (so the caller can
// read its fields), or null on cancel.
export function openModal({ title, body = '', confirmLabel = 'Confirm', confirmClass = 'primary', cancelLabel = 'Cancel', validate }) {
    return new Promise(resolve => {
        const opener = document.activeElement;
        const wrap = document.createElement('div');
        wrap.className = 'modal-backdrop';
        wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
            <div class="modal-body"><h2>${esc(title)}</h2>${body}<p class="err" data-err hidden></p></div>
            <div class="modal-foot"><button class="btn" type="button" data-cancel>${esc(cancelLabel)}</button>
                <button class="btn ${confirmClass}" type="button" data-ok>${esc(confirmLabel)}</button></div></div>`;
        const done = value => { wrap.remove(); if (opener && opener.focus) opener.focus(); resolve(value); };
        wrap.querySelector('[data-cancel]').addEventListener('click', () => done(null));
        wrap.querySelector('[data-ok]').addEventListener('click', () => {
            const problem = validate ? validate(wrap) : '';
            if (problem) { const e = wrap.querySelector('[data-err]'); e.textContent = problem; e.hidden = false; return; }
            done(wrap);
        });
        wrap.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } });
        wrap.addEventListener('mousedown', e => { if (e.target === wrap) done(null); });
        document.body.appendChild(wrap);
        (wrap.querySelector('.modal-body input, .modal-body textarea') || wrap.querySelector('[data-ok]')).focus();
    });
}

// ------------------------------------------------------------------ misc

export const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const money2 = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dateTime = ms => isNaN(ms) ? '–' : new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Minimal sparkline: an area with the latest point emphasised. Values are plotted against their own max.
export function sparkline(values, { width = 160, height = 30 } = {}) {
    if (!values.length) return '';
    const max = Math.max(...values, 1);
    const step = values.length > 1 ? width / (values.length - 1) : width;
    const pts = values.map((v, i) => [i * step, height - 3 - (v / max) * (height - 6)]);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const [lx, ly] = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        <path d="${line} L${width} ${height} L0 ${height} Z" fill="rgba(139,92,246,.16)"/>
        <path d="${line}" fill="none" stroke="#8b5cf6" stroke-width="1.8" vector-effect="non-scaling-stroke"/>
        <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.6" fill="#b4a3ff"/>
    </svg>`;
}
