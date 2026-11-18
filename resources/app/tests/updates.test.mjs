// Checks for the phone's self-update (www/app/updates.js) against a fake Android app.
// Run from resources/app: node --test tests/updates.test.mjs. All versions and URLs are made up.
//
// The real Android runtime gives the pages window.Capacitor with nativePromise(plugin, method,
// options) but NOT registerPlugin (that comes from @capacitor/core, which these pages don't load).
// 1.4.2 and 1.4.3 looked for registerPlugin only, so on a real phone they never updated.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const calls = [];
let state;
const store = {};
const bodyKids = [];
const plugin = {
    notifyAppReady: async () => { calls.push(['notifyAppReady']); return {}; },
    current: async () => ({ bundle: { version: 'builtin' }, native: state.native }),
    list: async () => ({ bundles: state.bundles }),
    download: async o => { calls.push(['download', o.url, o.version, o.checksum]); return { id: 'b1', version: o.version, status: 'success' }; },
    next: async o => { calls.push(['next', o.id]); return {}; }
};
// The runtime as it really is on the phone: no registerPlugin.
const realRuntime = () => ({
    isNativePlatform: () => true, getPlatform: () => 'android',
    nativePromise: (name, method, options) => name === 'CapacitorUpdater' && plugin[method] ? plugin[method](options) : Promise.reject(new Error(`${name}.${method} missing`))
});
globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
globalThis.document = {
    getElementById: id => bodyKids.find(k => k.id === id) || null,
    createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {}, remove() { bodyKids.splice(bodyKids.indexOf(this), 1); } }),
    body: { appendChild: el => bodyKids.push(el) }
};
globalThis.fetch = async url => {
    if (/danfosal-app\.web\.app/.test(url)) return state.remote ? { ok: true, json: async () => state.remote } : Promise.reject(new Error('offline'));
    return { ok: true, json: async () => ({ version: state.mine }) };
};
const remote = v => ({ version: v, minNative: '1.4.2', bundle: `https://example.invalid/danfosal-www-${v}.zip`, apk: `https://example.invalid/Danfosal-App-${v}.apk`, bundleSha256: 'abc' });
const load = async () => import('../www/app/updates.js?' + Math.random());

test('on the real runtime (nativePromise only) it confirms the start, downloads newer screens once and sets them for the next start', async () => {
    globalThis.window = { Capacitor: realRuntime(), location: { href: '' } };
    store['danfosal-update-check'] = String(Date.now());           // no automatic check during the test
    calls.length = 0;
    const U = await load();
    await new Promise(r => setTimeout(r, 10));
    assert.deepEqual(calls, [['notifyAppReady']], 'tells the plugin the screens started');

    state = { native: '1.4.2', mine: '1.4.2', bundles: [], remote: remote('1.4.2') };
    assert.equal((await U.checkNow()).status, 'latest');

    state = { native: '1.4.2', mine: '1.4.3', bundles: [], remote: remote('1.4.4') };
    calls.length = 0;
    const r = await U.checkNow({ asked: true });
    assert.equal(r.status, 'next-start');
    assert.equal(r.latest, '1.4.4');
    assert.deepEqual(calls, [['download', 'https://example.invalid/danfosal-www-1.4.4.zip', '1.4.4', 'abc'], ['next', 'b1']]);

    state.bundles = [{ id: 'b1', version: '1.4.4', status: 'success' }];
    calls.length = 0;
    await U.checkNow();
    assert.deepEqual(calls, [['next', 'b1']], 'an already downloaded version is not downloaded again');

    state = { native: '1.4.2', mine: '1.4.3', bundles: [], remote: { ...remote('1.4.5'), minNative: '1.4.5' } };
    calls.length = 0;
    assert.equal((await U.checkNow()).status, 'needs-apk');
    assert.equal(calls.length, 0, 'screens for a newer APK are never downloaded into an old one');
    assert.equal(bodyKids.length, 1, 'the install bar shows');

    state = { native: '1.4.2', mine: '1.4.3', bundles: [], remote: null };
    assert.equal((await U.checkNow()).status, 'offline');
});

test('with @capacitor/core loaded (registerPlugin) it still works', async () => {
    globalThis.window = { Capacitor: { ...realRuntime(), nativePromise: undefined, registerPlugin: () => plugin }, location: { href: '' } };
    const U = await load();
    state = { native: '1.4.2', mine: '1.4.3', bundles: [], remote: remote('1.4.4') };
    calls.length = 0;
    assert.equal((await U.checkNow()).status, 'next-start');
    assert.deepEqual(calls.filter(c => c[0] !== 'notifyAppReady').map(c => c[0]), ['download', 'next']);
});

test('not the Android app: says so, never "latest"', async () => {
    globalThis.window = { Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' }, location: { href: '' } };
    const U = await load();
    assert.equal((await U.checkNow()).status, 'not-android');
    globalThis.window = { location: { href: '' } };
    const W = await load();
    assert.equal((await W.checkNow()).status, 'not-android');
});

test('newer() compares versions number by number', async () => {
    const U = await load();
    assert.equal(U.newer('1.4.10', '1.4.9'), true);
    assert.equal(U.newer('1.4.3', '1.4.3'), false);
    assert.equal(U.newer('1.4.3', ''), true);
});
