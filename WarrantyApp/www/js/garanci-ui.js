// Local presentation only: this module never reads or writes customer data.
const STYLE_URL = new URL('../css/modern.css', import.meta.url).href;
if (!Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(link => link.href === STYLE_URL)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_URL;
    document.head.append(link);
}

const STORAGE_KEY = 'danfos-garanci-appearance-v1';
const ACCENTS = ['violet', 'cyan', 'gold'];
const MOTIONS = ['subtle', 'cinematic', 'off'];
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const pointerQuery = matchMedia('(pointer: coarse)');
let root, observer, controller, activeSurface, frame = 0, settings = { accent: 'violet', motion: 'subtle' };
let connection = navigator.onLine ? 'loading' : 'offline';
let previousMotion = 'subtle';
let pointerPosition = null;
try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (ACCENTS.includes(saved.accent)) settings.accent = saved.accent;
    if (MOTIONS.includes(saved.motion)) settings.motion = saved.motion;
} catch { /* Storage may be unavailable; the current page still works. */ }

function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* No persistence in restricted sessions. */ }
}

const motionAllowed = () => settings.motion !== 'off' && !motionQuery.matches && !pointerQuery.matches && !document.hidden;
function resetSurface() {
    if (!activeSurface) return;
    activeSurface.classList.remove('dg-depth-hover');
    ['--dg-rx', '--dg-ry', '--dg-lift', '--dg-light-x', '--dg-light-y'].forEach(key => activeSurface.style.removeProperty(key));
    if (activeSurface.classList.contains('dg-parallax')) activeSurface.style.removeProperty('transform');
    activeSurface = null;
    pointerPosition = null;
    cancelAnimationFrame(frame);
    frame = 0;
}

function refreshControls() {
    if (!root) return;
    root.dataset.accent = settings.accent;
    root.dataset.motion = settings.motion;
    root.classList.toggle('dg-paused', settings.motion === 'off' || motionQuery.matches);
    root.classList.toggle('dg-cinematic', settings.motion === 'cinematic');
    root.classList.toggle('dg-background-paused', document.hidden);
    root.querySelectorAll('[data-ui-accent]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.uiAccent === settings.accent)));
    root.querySelectorAll('[data-ui-motion]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.uiMotion === settings.motion)));
    root.querySelectorAll('[data-ui-pause]').forEach(button => button.setAttribute('aria-pressed', String(settings.motion === 'off' || motionQuery.matches)));
    root.querySelectorAll('[data-motion-label]').forEach(label => { label.textContent = `Lëvizja 3D: ${motionQuery.matches || settings.motion === 'off' ? 'e ndalur' : settings.motion === 'cinematic' ? 'kinematike' : 'e lehtë'}`; });
    root.querySelectorAll('.dg-motion-note').forEach(label => { label.textContent = motionQuery.matches ? 'Lëvizja është ndalur sipas cilësimit të pajisjes.' : 'Zgjedhja ruhet në këtë pajisje.'; });
    if (!motionAllowed()) resetSurface();
}

function updateConnection() {
    if (!root) return;
    const labels = { loading: 'Duke lidhur…', connected: 'Lidhja aktive', offline: 'Pa lidhje', error: 'Lidhja kërkon vëmendje' };
    root.querySelectorAll('[data-connection]').forEach(indicator => {
        indicator.dataset.connection = connection;
        const label = indicator.querySelector('[data-connection-label]');
        if (label) label.textContent = labels[connection];
    });
}

// Pages call connected only after a successful backend operation. Browser online
// events indicate network availability and return the status to loading, not success.
export function announceConnection(status) {
    if (!['loading', 'connected', 'offline', 'error'].includes(status)) return;
    connection = navigator.onLine ? status : 'offline';
    updateConnection();
}

function enhanceSurfaces() {
    if (!root) return;
    root.querySelectorAll('.dg-machine-row:not(:has(.dg-mini-passport))').forEach((surface, index) => {
        const icon = document.createElement('span');
        icon.className = 'dg-mini-passport';
        icon.setAttribute('aria-hidden', 'true');
        icon.style.setProperty('--dg-float-delay', `${-(index % 9)}s`);
        for (const className of ['dg-mini-leaf dg-mini-back', 'dg-mini-leaf']) {
            const leaf = document.createElement('span');
            leaf.className = className;
            icon.append(leaf);
        }
        surface.prepend(icon);
    });
    root.querySelectorAll('.mp-detail .dg-panel:has(>.dg-eyebrow)').forEach(panel => {
        if (panel.querySelector('input,select,textarea,.dg-coverage-emblem')) return;
        panel.classList.add('dg-coverage');
        const emblem = document.createElement('span');
        emblem.className = 'dg-coverage-emblem';
        emblem.setAttribute('aria-hidden', 'true');
        const ring = document.createElement('span'); ring.className = 'dg-coverage-ring';
        const coin = document.createElement('span'); coin.className = 'dg-coverage-coin'; coin.textContent = '✓';
        emblem.append(ring, coin); panel.prepend(emblem);
    });
    root.querySelectorAll('[data-depth], .dg-stat, .dg-job, .dg-machine-row, .gn-tile, a.gn-glass').forEach(surface => {
        if (surface.matches('input,select,textarea,[contenteditable="true"]') || surface.querySelector('input,select,textarea,[contenteditable="true"]')) {
            surface.classList.remove('dg-depth-surface');
            return;
        }
        surface.classList.add('dg-depth-surface');
    });
    root.querySelectorAll('.dg-stat:not(:has(.dg-stat-emblem))').forEach(surface => {
        const emblem = document.createElement('span');
        emblem.className = 'dg-stat-emblem';
        emblem.setAttribute('aria-hidden', 'true');
        surface.append(emblem);
    });
    const main = root.querySelector('.gn-main');
    if (main) {
        main.setAttribute('tabindex', '-1');
        // Existing pages use main IDs for rendering. A separate anchor preserves them.
        if (!root.querySelector('#dg-workspace')) {
            const anchor = document.createElement('span');
            anchor.id = 'dg-workspace';
            anchor.tabIndex = -1;
            anchor.className = 'dg-workspace-anchor';
            main.before(anchor);
        }
    }
    refreshControls();
    updateConnection();
}

function settingsPanel(open, focusTrigger = false) {
    const panel = root.querySelector('#dg-settings-panel');
    const trigger = root.querySelector('[data-ui-settings]');
    if (!panel || !trigger) return;
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) panel.querySelector('[data-ui-accent][aria-pressed="true"]')?.focus();
    else if (focusTrigger) trigger.focus();
}

function paintPointer() {
    frame = 0;
    if (!activeSurface || !pointerPosition || !motionAllowed() || !activeSurface.isConnected) return resetSurface();
    const bounds = activeSurface.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (pointerPosition.x - bounds.left) / bounds.width));
    const py = Math.max(0, Math.min(1, (pointerPosition.y - bounds.top) / bounds.height));
    const strength = settings.motion === 'cinematic' ? 8 : 3.5;
    if (activeSurface.classList.contains('dg-parallax')) {
        activeSurface.style.transform = `rotateX(${((0.5 - py) * strength).toFixed(2)}deg) rotateY(${((px - 0.5) * strength * 1.4).toFixed(2)}deg)`;
    } else {
        activeSurface.style.setProperty('--dg-rx', `${((0.5 - py) * strength).toFixed(2)}deg`);
        activeSurface.style.setProperty('--dg-ry', `${((px - 0.5) * strength).toFixed(2)}deg`);
        activeSurface.style.setProperty('--dg-lift', settings.motion === 'cinematic' ? '-4px' : '-2px');
        activeSurface.style.setProperty('--dg-light-x', `${(px * 100).toFixed(1)}%`);
        activeSurface.style.setProperty('--dg-light-y', `${(py * 100).toFixed(1)}%`);
        activeSurface.classList.add('dg-depth-hover');
    }
}

function initialize() {
    root = document.querySelector('.gn-page');
    if (!root || controller) return;
    controller = new AbortController();
    const options = { signal: controller.signal };
    root.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (button?.hasAttribute('data-ui-settings')) settingsPanel(button.getAttribute('aria-expanded') !== 'true');
        else if (button?.hasAttribute('data-ui-close')) settingsPanel(false, true);
        else if (button?.hasAttribute('data-ui-accent')) { settings.accent = button.dataset.uiAccent; saveSettings(); refreshControls(); }
        else if (button?.hasAttribute('data-ui-motion')) { settings.motion = button.dataset.uiMotion; saveSettings(); resetSurface(); refreshControls(); }
        else if (button?.hasAttribute('data-ui-pause')) { if (settings.motion === 'off') settings.motion = previousMotion; else { previousMotion = settings.motion; settings.motion = 'off'; } saveSettings(); refreshControls(); }
    }, options);
    document.addEventListener('pointerdown', event => { if (!event.target.closest('#dg-settings-panel, [data-ui-settings]')) settingsPanel(false); }, options);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && root.querySelector('#dg-settings-panel:not([hidden])')) settingsPanel(false, true); }, options);
    root.addEventListener('pointermove', event => {
        if (!motionAllowed() || event.pointerType === 'touch') return;
        const candidate = event.target.closest('.dg-parallax, .dg-depth-surface');
        if (!candidate || candidate.querySelector('input,select,textarea,[contenteditable="true"]')) return resetSurface();
        if (candidate !== activeSurface) { resetSurface(); activeSurface = candidate; }
        pointerPosition = { x: event.clientX, y: event.clientY };
        if (!frame) frame = requestAnimationFrame(paintPointer);
    }, { ...options, passive: true });
    root.addEventListener('pointerleave', resetSurface, options);
    root.addEventListener('focusin', event => { if (event.target.matches('input,select,textarea,[contenteditable="true"]')) resetSurface(); }, options);
    document.addEventListener('visibilitychange', refreshControls, options);
    window.addEventListener('blur', resetSurface, options);
    window.addEventListener('offline', () => announceConnection('offline'), options);
    window.addEventListener('online', () => announceConnection('loading'), options);
    motionQuery.addEventListener('change', refreshControls, options);
    pointerQuery.addEventListener('change', refreshControls, options);
    window.addEventListener('storage', event => {
        if (event.key !== STORAGE_KEY || !event.newValue) return;
        try { const next = JSON.parse(event.newValue); if (ACCENTS.includes(next.accent) && MOTIONS.includes(next.motion)) { settings = next; refreshControls(); } } catch { /* Ignore malformed external preferences. */ }
    }, options);
    observer = new MutationObserver(mutations => {
        if (mutations.some(mutation => Array.from(mutation.addedNodes).some(node => node.nodeType === Node.ELEMENT_NODE))) enhanceSurfaces();
    });
    observer.observe(root, { childList: true, subtree: true });
    enhanceSurfaces();
    window.addEventListener('pagehide', () => { resetSurface(); observer.disconnect(); controller.abort(); controller = null; }, { once: true });
}

// Safe plaintext contract: title, body and labels are always assigned through
// textContent. HTML strings are intentionally displayed as text, never executed.
export function confirmAction({ title = 'Konfirmoni veprimin', body = '', confirmLabel = 'Konfirmo', cancelLabel = 'Anulo' } = {}) {
    if (typeof HTMLDialogElement === 'undefined') return Promise.resolve(window.confirm(`${title}\n\n${body}`));
    return new Promise(resolve => {
        const previousFocus = document.activeElement;
        const dialog = document.createElement('dialog');
        dialog.className = 'dg-confirm';
        const heading = document.createElement('h2'); heading.textContent = title;
        const description = document.createElement('p'); description.textContent = body;
        const id = `dg-confirm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        heading.id = `${id}-title`; description.id = `${id}-body`;
        dialog.setAttribute('aria-labelledby', heading.id); dialog.setAttribute('aria-describedby', description.id);
        const actions = document.createElement('div'); actions.className = 'dg-actions';
        const cancel = document.createElement('button'); cancel.className = 'gn-btn gn-btn-glass'; cancel.type = 'button'; cancel.textContent = cancelLabel;
        const confirm = document.createElement('button'); confirm.className = 'gn-btn gn-btn-primary'; confirm.type = 'button'; confirm.textContent = confirmLabel;
        actions.append(cancel, confirm); dialog.append(heading, description, actions);
        (root || document.querySelector('.gn-page') || document.body).append(dialog);
        let accepted = false;
        cancel.addEventListener('click', () => dialog.close());
        confirm.addEventListener('click', () => { accepted = true; dialog.close(); });
        dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
        dialog.addEventListener('close', () => { dialog.remove(); if (previousFocus?.isConnected) previousFocus.focus(); resolve(accepted); }, { once: true });
        dialog.showModal();
        cancel.focus();
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
window.addEventListener('pageshow', event => { if (event.persisted) initialize(); });
