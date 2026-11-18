// Phone updates (Finding #78). Runs on every page, on its own (no imports), so it works on the
// sign-in form and offline too. Does anything only in the Android app; the desktop app updates
// itself through electron-updater (main.js) and the web version is whatever Hosting serves.
//
// The Android app keeps its screens (this www folder) in the APK. A release (tools/release) puts
// the same folder on GitHub as a zip and the release's manifest on Hosting (app-version.json):
//   - On every start this tells the live-update plugin (@capgo/capacitor-updater, its online
//     service switched off in capacitor.config.ts) that the screens started, or it goes back to
//     the ones inside the APK.
//   - At most once an hour it reads the manifest. Newer screens that this APK can run (its native
//     version is at least the manifest's minNative) are downloaded in the background and used
//     from the next start. A release that needs a newer APK shows a bar whose Install opens the
//     APK's download in the browser; Android then asks to install it.
const MANIFEST = 'https://danfosal-app.web.app/app-version.json';
const OWN = new URL('../app-version.json', import.meta.url).href;
const LAST_CHECK = 'danfosal-update-check', SNOOZE = 'danfosal-update-later';
const HOUR = 3600 * 1000;

const cap = () => window.Capacitor;
const native = () => { const c = cap(); return !!(c && c.isNativePlatform && c.isNativePlatform() && c.getPlatform && c.getPlatform() === 'android'); };
// The plugin's methods. The pages have no bundler, so they don't load @capacitor/core and
// window.Capacitor.registerPlugin isn't there on the phone - only the Android runtime's own bridge
// (window.Capacitor.nativePromise). 1.4.2 and 1.4.3 asked for registerPlugin alone, so on the
// owner's phone they never checked and Settings said "latest" (18 Nov 2026).
let plugin = null;
function call(method, options = {}) {
    const c = cap();
    if (c.registerPlugin) return (plugin || (plugin = c.registerPlugin('CapacitorUpdater')))[method](options);
    if (c.nativePromise) return c.nativePromise('CapacitorUpdater', method, options);
    return Promise.reject(new Error('the update plugin is not reachable on this phone'));
}
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private */ } } };

// "1.4.10" > "1.4.9".
export function newer(a, b) {
    const x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
    return false;
}

// The version of the screens running now (their own app-version.json).
export async function runningVersion() {
    try { return (await (await fetch(OWN, { cache: 'no-store' })).json()).version || ''; } catch { return ''; }
}

// Checks the release manifest and acts on it. Returns what it found, for Settings (asked: the
// owner pressed Check, so an install bar shows even if Later was tapped today).
export async function checkNow({ asked = false } = {}) {
    if (!native()) return { status: 'not-android' };
    const [mine, latest, current] = await Promise.all([
        runningVersion(),
        fetch(MANIFEST, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
        call('current').catch(() => null)
    ]);
    store.set(LAST_CHECK, String(Date.now()));
    if (!latest || !latest.version) return { status: 'offline', mine };
    const apk = current && current.native;
    if (latest.minNative && apk && newer(latest.minNative, apk)) { showInstallBar(latest, !asked); return { status: 'needs-apk', mine, latest: latest.version }; }
    if (!newer(latest.version, mine)) return { status: 'latest', mine };
    // Already downloaded on an earlier check: just make it the next one.
    const have = ((await call('list').catch(() => null)) || {}).bundles || [];
    let bundle = have.find(b => b.version === latest.version && b.status === 'success');
    if (!bundle) bundle = await call('download', { url: latest.bundle, version: latest.version, ...(latest.bundleSha256 ? { checksum: latest.bundleSha256 } : {}) });
    await call('next', { id: bundle.id });
    return { status: 'next-start', mine, latest: latest.version };
}

// A bar at the bottom: a new APK to install. Later hides it for a day (unless asked from Settings).
function showInstallBar(latest, quiet) {
    if (document.getElementById('danfosal-update-bar')) return;
    if (quiet && Date.now() - Number(store.get(SNOOZE) || 0) < 24 * HOUR) return;
    const bar = document.createElement('div');
    bar.id = 'danfosal-update-bar';
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 14px;border-radius:12px;'
        + 'background:var(--panel,#fff);color:var(--text,#111);border:1px solid var(--line,#ddd);box-shadow:0 6px 24px rgba(0,0,0,.18);font:14px/1.4 system-ui,sans-serif';
    bar.innerHTML = `<span style="flex:1;min-width:200px"><b>Danfosal App ${String(latest.version).replace(/[<>&"]/g, '')}</b> needs a new install. Tap Install, then open the download.</span>`
        + '<button type="button" data-u="later" style="padding:8px 12px;border-radius:8px;border:1px solid var(--line,#ccc);background:transparent;color:inherit">Later</button>'
        + '<button type="button" data-u="go" style="padding:8px 14px;border-radius:8px;border:0;background:var(--brand,#2563eb);color:#fff;font-weight:600">Install</button>';
    bar.addEventListener('click', e => {
        const b = e.target.closest('[data-u]'); if (!b) return;
        if (b.dataset.u === 'later') { store.set(SNOOZE, String(Date.now())); bar.remove(); return; }
        window.location.href = latest.apk;            // not this app's address: Capacitor hands it to the browser
    });
    document.body.appendChild(bar);
}

if (native()) {
    call('notifyAppReady').catch(() => {});
    if (Date.now() - Number(store.get(LAST_CHECK) || 0) > HOUR) setTimeout(() => checkNow().catch(() => {}), 4000);
}
