// "Check Downloads now": the Monday filing, on demand.
//
// The work happens on the shop PC, where Downloads and the archive are (tools/paper-autopilot,
// started by the desktop app's main process). In the desktop app the button runs it directly. On
// the phone or the web the button leaves a request in `autopilotRuns`, which the desktop app picks
// up whenever it is open (serveRemoteRequests, started by every screen) and answers with the result.
import { db, ready, collection, addDoc, updateDoc, runTransaction, query, where, onSnapshot } from './firebase.js';
import { esc, icon, plural, openModal } from './ui.js';

export const onThisPC = () => !!(window.electronAPI && window.electronAPI.runPaperAutopilot);
const PHONE_WAIT_MS = 90000;          // how long the phone waits for the PC to take the request

// What a result looks like once stored: no local paths, the list of what was filed kept short.
function slim(r) {
    return {
        ok: !!r.ok, busy: !!r.busy, error: r.error || '', at: r.at || new Date().toISOString(),
        filed: (r.filed || []).slice(0, 40).map(f => ({ to: f.to, label: f.label, type: f.type })),
        filedCount: (r.filed || []).length, recycled: Array.isArray(r.recycled) ? r.recycled.length : (r.recycled || 0), skipped: (r.skipped || []).slice(0, 10),
        left: r.left || {}, synced: r.synced || 0, syncedKinds: r.syncedKinds || {}, orderLines: r.orderLines || 0, syncError: r.syncError || '',
        salesAdded: (r.salesAdded || []).slice(0, 20), salesReview: (r.salesReview || []).slice(0, 20), salesError: r.salesError || ''
    };
}

// Run the check and return its summary. onStatus gets short progress lines for the button.
export async function checkDownloadsNow(onStatus = () => {}) {
    if (onThisPC()) {
        onStatus('Checking Downloads…');
        return slim(await window.electronAPI.runPaperAutopilot());
    }
    onStatus('Asking the shop PC…');
    await ready;
    const ref = await addDoc(collection(db, 'autopilotRuns'), { status: 'requested', requestedAt: Date.now(), from: /Android/i.test(navigator.userAgent) ? 'phone' : 'web' });
    return new Promise(resolve => {
        let taken = false;
        const stop = onSnapshot(ref, snap => {
            const v = snap.data(); if (!v) return;
            if (v.status === 'running' && !taken) { taken = true; onStatus('The shop PC is checking Downloads…'); }
            if (v.status === 'done' || v.status === 'failed') { stop(); clearTimeout(timer); resolve({ ...(v.result || {}), remote: true }); }
        }, () => { stop(); clearTimeout(timer); resolve({ queued: true }); });
        const timer = setTimeout(() => { if (!taken) { stop(); resolve({ queued: true }); } }, PHONE_WAIT_MS);
    });
}

// On the PC: answer requests from the phone. Every waiting request is claimed in one go and served
// by a single run (three presses while the PC was off need one check, not three). A request left
// "running" for over 20 minutes was cut off (the app closed mid-run) and is marked so.
export async function serveRemoteRequests() {
    if (!onThisPC() || window.__autopilotServing) return;
    window.__autopilotServing = true;
    await ready;                      // the rules refuse a listener before the app has signed in
    let busy = false;
    onSnapshot(query(collection(db, 'autopilotRuns'), where('status', 'in', ['requested', 'running'])), async snap => {
        const stale = snap.docs.filter(d => d.data().status === 'running' && Date.now() - (d.data().startedAt || 0) > 20 * 60000);
        stale.forEach(d => updateDoc(d.ref, { status: 'failed', finishedAt: Date.now(), result: { ok: false, error: 'The check was cut off (Danfosal App closed on the PC). Press the button again.' } }).catch(() => {}));
        if (busy) return;
        const waiting = snap.docs.filter(d => d.data().status === 'requested');
        if (!waiting.length) return;
        busy = true;
        try {
            const mine = [];
            for (const d of waiting) {
                const ok = await runTransaction(db, async tx => {
                    const cur = await tx.get(d.ref);
                    if (cur.data()?.status !== 'requested') return false;
                    tx.update(d.ref, { status: 'running', startedAt: Date.now() });
                    return true;
                }).catch(() => false);
                if (ok) mine.push(d.ref);
            }
            if (!mine.length) return;
            const result = slim(await window.electronAPI.runPaperAutopilot());
            await Promise.all(mine.map(ref => updateDoc(ref, { status: result.ok ? 'done' : 'failed', finishedAt: Date.now(), result }).catch(() => {})));
        } finally { busy = false; }
    }, () => { window.__autopilotServing = false; });
}

// The result, said plainly. Resolves to where the owner asked to go next: 'import' (invoices
// waiting for a look), 'purchases', or false.
export async function showCheckResult(r) {
    if (r.queued) {
        await openModal({ title: 'The shop PC didn’t answer', confirmLabel: 'OK',
            body: `<p>Danfosal App isn’t open on the shop PC right now. Your request is waiting: the check runs as soon as the app is opened there.</p>` });
        return false;
    }
    if (r.busy) {
        await openModal({ title: 'A check is already running', confirmLabel: 'OK', body: '<p>The Monday run or another press of the button is filing Downloads right now. Try again in a minute.</p>' });
        return false;
    }
    if (!r.ok) {
        await openModal({ title: 'The check didn’t finish', confirmLabel: 'OK', body: `<p>${esc(r.error || 'Something went wrong.')}</p><p class="muted">Nothing half-done is left: every file moved is in the journal, and anything not moved is still in Downloads.</p>` });
        return false;
    }
    const kinds = { order: ['order', 'orders'], invoice: ['invoice', 'invoices'], creditNote: ['credit note', 'credit notes'], payment: ['payment', 'payments'], customs: ['customs declaration', 'customs declarations'], statement: ['Kärcher statement', 'Kärcher statements'] };
    const read = Object.entries(r.syncedKinds || {}).map(([k, n]) => plural(n, ...(kinds[k] || [k, k]))).join(', ');
    const leftN = Object.entries(r.left || {}).filter(([k]) => k !== 'not-pdf' && k !== 'settling').reduce((s, [, n]) => s + n, 0);
    const purchases = (r.synced || 0) + (r.orderLines || 0) > 0 || (r.filed || []).some(f => /^karcher|customs|bank/.test(f.type || ''));
    const added = r.salesAdded || [], review = r.salesReview || [];
    const next = review.length ? 'import' : purchases ? 'purchases' : '';
    const nothing = !r.filedCount && !r.recycled && !r.synced && !added.length && !review.length;
    const ok = await openModal({
        title: nothing ? 'Nothing new in Downloads' : 'Downloads checked',
        confirmLabel: next === 'import' ? 'Review invoices' : next ? 'Open Purchases' : 'OK', confirmClass: next ? 'money' : 'primary', cancelLabel: 'Close',
        body: nothing ? `<p>Every paper in Downloads is already filed.${leftN ? ` ${plural(leftN, 'PDF stays', 'PDFs stay')} there because it isn’t one the autopilot recognises.` : ''}</p>` : `
            ${r.filedCount ? `<p><b>${plural(r.filedCount, 'paper filed', 'papers filed')}</b> into E:\\Danfos Papers:</p>
                <ul style="margin:4px 0 10px;padding-left:18px;max-height:220px;overflow:auto">${r.filed.map(f => `<li>${esc(f.to.split('\\').pop())} <span class="muted">· ${esc(f.label)}</span></li>`).join('')}</ul>` : ''}
            ${r.recycled ? `<p>${icon('delete')} ${plural(r.recycled, 'exact copy', 'exact copies')} sent to the Recycle Bin.</p>` : ''}
            ${r.synced ? `<p>${icon('receipt_long')} Read into Purchases: ${esc(read)}.</p>` : ''}
            ${r.orderLines ? `<p>${icon('playlist_add')} ${plural(r.orderLines, 'line', 'lines')} added to the order list.</p>` : ''}
            ${added.length ? `<p>${icon('point_of_sale')} <b>Added to Sales:</b> ${added.map(s => `invoice ${esc(s.invoiceNumber)} ${esc(s.customerName)} €${Number(s.total).toFixed(2)}`).join(', ')}.</p>` : ''}
            ${review.length ? `<p style="color:var(--warn)">${icon('rate_review')} ${plural(review.length, 'invoice waits', 'invoices wait')} for a look in Sell › Import invoice: ${review.map(s => `${esc(s.invoiceNumber || '?')} (${esc(s.reason)})`).join('; ')}.</p>` : ''}
            ${r.salesError ? `<p style="color:var(--warn)">Adding invoices to Sales failed: ${esc(r.salesError)}</p>` : ''}
            ${r.skipped?.length ? `<p class="muted">Left in Downloads: ${r.skipped.map(s => `${esc(s.file)} (${esc(s.why)})`).join('; ')}.</p>` : ''}
            ${r.syncError ? `<p style="color:var(--warn)">The papers are filed, but reading them into the app failed: ${esc(r.syncError)}</p>` : ''}`
    });
    return ok ? next || false : false;
}

// A "Check Downloads now" button wired to all of the above. after(result) runs once it's done.
export function checkButton(label = 'Check Downloads now') {
    return `<button class="btn" type="button" data-autopilot-check title="File what's in Downloads now instead of waiting for Monday">${icon('sync')}<span data-label>${esc(label)}</span></button>`;
}
export function wireCheckButton(root, after = () => {}) {
    const btn = root.querySelector('[data-autopilot-check]'); if (!btn) return;
    btn.addEventListener('click', async () => {
        const text = btn.querySelector('[data-label]'), was = text.textContent;
        btn.disabled = true;
        try {
            const r = await checkDownloadsNow(s => { text.textContent = s; });
            text.textContent = was; btn.disabled = false;
            const go = await showCheckResult(r);
            await after(r, go);
        } catch (e) {
            text.textContent = was; btn.disabled = false;
            await showCheckResult({ ok: false, error: e.message });
        }
    });
}
