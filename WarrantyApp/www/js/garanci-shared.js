// Shared helpers for the Danfos Garanci app. Firebase project is the same one
// the main Danfosal App uses — this module owns no data of its own.
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import './garanci-ui.js';
export { confirmAction, announceConnection } from './garanci-ui.js';

export const firebaseConfig = {
    apiKey: "AIzaSyDUtblUqNiSCmC4kRjikE7D2kba0Mhxej4",
    authDomain: "danfosal-app.firebaseapp.com",
    projectId: "danfosal-app",
    storageBucket: "danfosal-app.appspot.com",
    messagingSenderId: "565855692028",
    appId: "1:565855692028:web:c7cb647497cb3df9452379",
    measurementId: "G-50JPG2KKEC"
};

const PARTS_MONTHS_DEFAULT = 24;
const LABOUR_MONTHS_DEFAULT = 12;
export { PARTS_MONTHS_DEFAULT, LABOUR_MONTHS_DEFAULT };

export function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

export function formatDateAlb(value) {
    if (!value) return '';
    const d = value.toDate ? value.toDate() : (value instanceof Date ? value : new Date(value));
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.${d.getFullYear()}`;
}

export function addMonths(date, months) {
    const d = date.toDate ? date.toDate() : new Date(date);
    const result = new Date(d);
    result.setMonth(result.getMonth() + months);
    return result;
}

export function daysAgo(value) {
    if (!value) return '';
    const d = value.toDate ? value.toDate() : new Date(value);
    const diffMs = Date.now() - d.getTime();
    const days = Math.max(0, Math.floor(diffMs / 86400000));
    if (days === 0) return 'sot';
    if (days === 1) return '1 ditë';
    return `${days} ditë`;
}

// warrantyCard: a warrantyCards doc ({items, warrantyUntil, ...}) matched to one specific
// item, or null if none was ever issued for that item. Returns a badge for the claim screen's
// machine list — the prototype only shows active/expired since its mock data always has a
// warranty on file; real historic orders often don't, so "none issued" is a real third state.
export function warrantyBadge(warrantyCard) {
    if (!warrantyCard || !warrantyCard.warrantyUntil) {
        return { label: 'Pa garanci të lëshuar', className: 'gn-badge-none' };
    }
    const until = warrantyCard.warrantyUntil.toDate ? warrantyCard.warrantyUntil.toDate() : new Date(warrantyCard.warrantyUntil);
    if (until.getTime() >= Date.now()) {
        return { label: `Garanci aktive · deri ${formatDateAlb(until)}`, className: 'gn-badge-active' };
    }
    return { label: 'Garancia ka skaduar', className: 'gn-badge-expired' };
}

// Atomically issues the next number in a yearly-reset sequence, e.g. GAR-2026-0001.
// Stored in counters/{counterId} as { year, seq }; resets seq to 1 when the year rolls over.
export async function nextSequenceNumber(db, counterId, prefix) {
    const ref = doc(db, 'counters', counterId);
    const year = new Date().getFullYear();
    let result;
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists() ? snap.data() : {};
        const seq = (data.year === year ? (data.seq || 0) : 0) + 1;
        tx.set(ref, { year, seq });
        result = `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
    });
    return result;
}

const NAV_ITEMS = [
    { key: 'home', label: 'Ballina', href: 'index.html', icon: '⌂' },
    { key: 'pending', label: 'Kërkesat', href: 'pending.html', icon: '⇄' },
    { key: 'machines', label: 'Makineritë', href: 'machines.html', icon: '▱' },
    { key: 'schedule', label: 'Planifikimi', href: 'schedule.html', icon: '◷' },
    { key: 'analytics', label: 'Analitika', href: 'analytics.html', icon: '↗' },
    { key: 'issue', label: 'Lësho garanci', href: 'issue.html', icon: '＋' },
    { key: 'claim', label: 'Kërkesë e re', href: 'claim.html', icon: '✎' }
];

export function renderHeader(active) {
    const nav = NAV_ITEMS.map(item =>
        `<a class="dg-nav${item.key === active ? ' dg-active' : ''}" href="${item.href}"${item.key === active ? ' aria-current="page"' : ''}><span aria-hidden="true">${item.icon}</span><span>${item.label}</span></a>`
    ).join('');
    return `
    <a class="dg-skip-link" href="#dg-workspace">Kalo te përmbajtja</a>
    <header class="dg-topbar gn-header">
      <a class="dg-wordmark" href="index.html" aria-label="Danfos Garanci · Ballina">
        <img class="dg-brand-logo" src="assets/garanci-logo.svg" alt="" width="36" height="36">
        <span>Danfos</span><span class="dg-brand-tag">GARANCI</span>
      </a>
      <div class="dg-topright"><span class="dg-connection" role="status" aria-live="polite" data-connection="loading"><span class="dg-dot"></span><span data-connection-label>Duke lidhur…</span></span><button class="dg-settings-toggle" type="button" data-ui-settings aria-expanded="false" aria-controls="dg-settings-panel"><span aria-hidden="true">◈</span> Pamja</button></div>
      <section class="dg-settings" id="dg-settings-panel" aria-label="Personalizo pamjen" hidden>
        <div class="dg-settings-heading"><h2>Pamja juaj</h2><button type="button" class="dg-close-settings" data-ui-close aria-label="Mbyll cilësimet">×</button></div>
        <p>Zgjidhni ngjyrën dhe ritmin e lëvizjes.</p>
        <fieldset><legend>Ngjyra kryesore</legend><div class="dg-setting-options"><button type="button" data-ui-accent="violet" class="dg-accent-swatch" aria-pressed="true"><i class="dg-swatch-violet" aria-hidden="true"></i>Vjollcë</button><button type="button" data-ui-accent="cyan" class="dg-accent-swatch" aria-pressed="false"><i class="dg-swatch-cyan" aria-hidden="true"></i>Mentë</button><button type="button" data-ui-accent="gold" class="dg-accent-swatch" aria-pressed="false"><i class="dg-swatch-gold" aria-hidden="true"></i>Ari</button></div></fieldset>
        <fieldset><legend>Lëvizja 3D</legend><div class="dg-setting-options"><button type="button" data-ui-motion="subtle" aria-pressed="true">E lehtë</button><button type="button" data-ui-motion="cinematic" aria-pressed="false">Kinematike</button><button type="button" data-ui-motion="off" aria-pressed="false">Pa lëvizje</button></div></fieldset>
        <small class="dg-motion-note">Zgjedhja ruhet në këtë pajisje.</small>
      </section>
    </header>
    <nav class="dg-sidebar" aria-label="Navigimi kryesor"><div class="dg-nav-label">HAPËSIRA E PUNËS</div>${nav}<div class="dg-sidebar-bottom"><div class="dg-sidebar-caption">Çdo makinë ka një histori.</div><button type="button" class="dg-motion-button" data-ui-pause aria-pressed="false"><span aria-hidden="true">◈</span><span data-motion-label>Lëvizja 3D: e lehtë</span></button><div class="dg-side-status"><span class="dg-dot"></span>Danfos · Garanci & servis</div></div></nav>`;
}

export function renderAuroraBackground() {
    return `<div class="gn-aurora"></div><div class="gn-grid"></div>`;
}

// A decorative certificate, never a claim of a customer's coverage. Every supplied
// label is escaped; callers should use real card data only when displaying coverage.
export function renderWarrantyScene({ model = 'Garanci e sigurt', serial = '', period = 'Historia e makinës, në një vend', caption = 'DANFOS GARANCI' } = {}) {
    return `<div class="dg-scene" aria-hidden="true"><div class="dg-parallax"><div class="dg-card-stack"><div class="dg-certificate dg-layer-two"></div><div class="dg-certificate dg-layer-one"></div><div class="dg-certificate"><div class="dg-cert-top"><b>Danfos</b><span>GARANCI</span></div><div class="dg-cert-model">${escapeHtml(model)}</div><div class="dg-cert-serial">${escapeHtml(serial)}</div><div class="dg-cert-bottom"><div class="dg-cert-period">${escapeHtml(period)}</div><div class="dg-cert-seal">✓</div></div></div></div></div><span class="dg-scene-caption">${escapeHtml(caption)}</span></div>`;
}

export function renderMiniPassport() {
    return '<span class="dg-mini-passport" aria-hidden="true"><span class="dg-mini-leaf dg-mini-back"></span><span class="dg-mini-leaf"></span></span>';
}
