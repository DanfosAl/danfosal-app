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
