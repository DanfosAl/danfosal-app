// Entry point of the new app shell (index.html).
import { mountShell, setPipelineStatus, setSearchData, setNavCounts } from './shell.js';
import { loadAll, analyze, saleTime } from './data.js';
import { renderToday, renderLoading, renderError } from './today.js';
import { db } from './firebase.js';

const content = mountShell({ active: 'today' });
let model = null;
let loading = false;

function paint() {
    const a = analyze(model);
    if (a.lastSale) a.lastSale._t = saleTime(a.lastSale);
    renderToday(content, a, { onGoalChange: paint });
    setPipelineStatus(a.lastEasypos, a.now);
    setNavCounts('today', {
        stock: a.reorder.length + a.needsCount.length ? { n: a.reorder.length + a.needsCount.length, hot: a.reorder.length > 0 } : null,
        service: a.openTickets.length ? { n: a.openTickets.length } : null
    });
}

async function refresh({ quiet = false } = {}) {
    if (loading) return;
    loading = true;
    if (!quiet || !model) renderLoading(content);
    try {
        model = await loadAll();
        setSearchData(model);
        paint();
    } catch (error) {
        console.error('Today failed to load', error);
        if (!model) renderError(content, error, () => refresh());
    } finally {
        loading = false;
    }
}

refresh();

// Keep Today current without a manual reload: every 5 minutes, when the window regains focus
// after 2+ minutes, and immediately when Electron reports a new receipt (receipt-listener.js).
setInterval(() => refresh({ quiet: true }), 5 * 60 * 1000);
window.addEventListener('focus', () => { if (model && Date.now() - model.loadedAt > 2 * 60 * 1000) refresh({ quiet: true }); });
window.addEventListener('new-sale', () => refresh({ quiet: true }));

// New-order notifications, exactly as the classic dashboard started them (notifications.js).
if (typeof window.NotificationManager !== 'undefined') {
    let enabled = true;
    try { enabled = localStorage.getItem('notificationsEnabled') !== 'false'; } catch { /* default on */ }
    if (enabled) {
        window.notificationManager = new window.NotificationManager(db);
        window.notificationManager.requestPermission();
        window.notificationManager.startMonitoring();
    }
}
