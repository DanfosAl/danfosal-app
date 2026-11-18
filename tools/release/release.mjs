// One release of Danfosal App to every device (Finding #78): `node tools/release/release.mjs`
//
//   1. the next version (1.4.2 -> 1.4.3, or --version x.y.z) in package.json, package-lock.json,
//      the Android build (versionName, versionCode + 1) and www/app-version.json - the manifest
//      the phone app reads (its own copy says which screens it runs; Hosting's says what's newest);
//   2. builds: the desktop installer with its blockmap and latest.yml (electron-builder), the
//      Android APK (cap sync + Gradle), and the screens as a zip for the phones' live update;
//   3. commits the version and pushes, then publishes GitHub release v<version> on
//      DanfosAl/danfosal-app with those files (as a draft until every file is up, so an updater
//      never sees a half-published release);
//   4. deploys Hosting: the web version, and the manifest that sends the phones to the release;
//   5. installs it on this PC and refreshes Danfos HQ's app copies.
//
// Every installed desktop app then updates itself (electron-updater reads the release), and every
// phone takes the new screens on its next start (www/app/updates.js). --native: this release
// changes the APK's native side (a new Capacitor plugin, capacitor.config.ts, AndroidManifest):
// phones are asked to install the new APK instead. --notes "...": the release text (default: the
// newest CHANGELOG title). --skip-deploy / --skip-install: leave those steps for later.
//
// GitHub sign-in: GH_TOKEN if set, else the credential git uses to push to github.com on this PC
// (it is never printed). Firebase: run `npx firebase login` first when its sign-in has expired.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, rmSync, createReadStream } from 'node:fs';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = 'E:\\DanfosalApp';
const APP = join(ROOT, 'resources', 'app');
const WWW = join(APP, 'www');
const OUT = join(APP, 'dist-release');
const SDK = 'C:\\Users\\User\\AppData\\Local\\Android\\Sdk';
const KEYSTORE = 'C:\\Users\\User\\.android\\debug.keystore';
const KEYSTORE_BACKUP = 'E:\\Danfos Backups\\Android signing key\\debug.keystore';
const HQ_SYNC = 'E:\\Danfos HQ\\app\\sync-apps.py';

const { values: opt } = parseArgs({ options: {
    version: { type: 'string' }, native: { type: 'boolean' }, notes: { type: 'string' },
    'skip-deploy': { type: 'boolean' }, 'skip-install': { type: 'boolean' }
} });

const say = s => console.log(s);
const step = s => console.log(`\n== ${s}`);
// shell: needed for .cmd/.bat files on Windows (npm, npx, gradlew); their arguments have no spaces.
function run(cmd, args, { cwd = APP, env = {}, quiet = false, shell = false } = {}) {
    const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', shell, stdio: quiet ? 'pipe' : 'inherit', maxBuffer: 1 << 26 });
    if (r.error) throw new Error(`${cmd} could not start: ${r.error.message}`);
    if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} stopped with code ${r.status}${quiet ? `: ${(r.stderr || r.stdout || '').trim().slice(-600)}` : ''}`);
    return r.stdout || '';
}
const npx = (args, o) => run('npx', args, { ...o, shell: true });

// A release file to GitHub, streamed (the installer is ~500 MB; fetch would time out waiting).
function upload(url, path, token) {
    return new Promise((resolve, reject) => {
        const size = statSync(path).size;
        const req = https.request(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream',
            'Content-Length': size, 'User-Agent': 'danfosal-release', Accept: 'application/vnd.github+json' } }, res => {
            let text = ''; res.on('data', d => { text += d; });
            res.on('end', () => res.statusCode < 300 ? resolve() : reject(new Error(`${res.statusCode}: ${text.slice(0, 300)}`)));
        });
        req.on('error', reject);
        createReadStream(path).pipe(req);
    });
}
const sha256 = f => createHash('sha256').update(readFileSync(f)).digest('hex');
const read = f => readFileSync(f, 'utf8');
// The text as written, or with Windows line endings (git may check files out either way).
function replaceOnce(file, from, to) {
    const s = read(file), crlf = !s.includes(from) && s.includes(from.replace(/\n/g, '\r\n'));
    if (!s.includes(from) && !crlf) throw new Error(`${file}: "${from}" not found`);
    writeFileSync(file, crlf ? s.replace(from.replace(/\n/g, '\r\n'), to.replace(/\n/g, '\r\n')) : s.replace(from, to));
}

// ------------------------------------------------------------------ 0. where we start
const pkg = JSON.parse(read(join(APP, 'package.json')));
const { owner, repo } = pkg.build.publish[0];
const current = pkg.version;
const next = opt.version || current.replace(/(\d+)$/, n => String(Number(n) + 1));
if (!/^\d+\.\d+\.\d+$/.test(next) || next === current) throw new Error(`Bad next version ${next} (now ${current})`);
const status = run('git', ['status', '--porcelain'], { cwd: ROOT, quiet: true }).trim();
if (status) throw new Error(`Commit or stash these first, so the release is exactly what is in git:\n${status}`);
if (!existsSync(KEYSTORE)) throw new Error(`The Android signing key is missing (${KEYSTORE}). Copy it back from ${KEYSTORE_BACKUP} first: a new key makes phones refuse the update.`);
const token = githubToken();
const before = existsSync(join(WWW, 'app-version.json')) ? JSON.parse(read(join(WWW, 'app-version.json'))) : null;
const minNative = opt.native || !before || !before.minNative ? next : before.minNative;
const notes = opt.notes || ((read(join(ROOT, 'docs', 'CHANGELOG.md')).match(/^## \[Released\] - [\d-]+ - (.+?)(?: \(|$)/m) || [])[1] || `Danfosal App ${next}`);
const base = `https://github.com/${owner}/${repo}/releases/download/v${next}`;
const names = { exe: `Danfosal-App-Setup-${next}.exe`, apk: `Danfosal-App-${next}.apk`, zip: `danfosal-www-${next}.zip` };
say(`Danfosal App ${current} -> ${next} (phones need APK ${minNative} or newer${minNative === next ? ': this release asks them to install the new APK' : ''})`);

// ------------------------------------------------------------------ 1. the version everywhere
step('Version');
replaceOnce(join(APP, 'package.json'), `"version": "${current}"`, `"version": "${next}"`);
replaceOnce(join(APP, 'package-lock.json'), `"name": "danfosal-app",\n    "version": "${current}"`, `"name": "danfosal-app",\n    "version": "${next}"`);
replaceOnce(join(APP, 'package-lock.json'), `"": {\n            "name": "danfosal-app",\n            "version": "${current}"`, `"": {\n            "name": "danfosal-app",\n            "version": "${next}"`);
const gradle = join(APP, 'android', 'app', 'build.gradle');
const code = Number((read(gradle).match(/versionCode (\d+)/) || [])[1]);
replaceOnce(gradle, `versionCode ${code}`, `versionCode ${code + 1}`);
replaceOnce(gradle, /versionName "[^"]*"/.exec(read(gradle))[0], `versionName "${next}"`);
// The copy inside the builds says which version they are; the checksum of the screens' zip is
// added after the zip is made (it can't be inside itself), for Hosting's copy.
const manifest = { version: next, date: new Date().toISOString().slice(0, 10), notes, minNative,
    apk: `${base}/${names.apk}`, bundle: `${base}/${names.zip}`, desktop: `${base}/${names.exe}` };
writeFileSync(join(WWW, 'app-version.json'), JSON.stringify(manifest, null, 2) + '\n');
say(`package.json, package-lock.json, build.gradle (versionCode ${code + 1}), www/app-version.json`);

// ------------------------------------------------------------------ 2. builds
step('Desktop installer');
run('npm', ['run', 'dist'], { shell: true });
const dist = join(APP, 'dist');
const latest = read(join(dist, 'latest.yml'));
if (!latest.includes(`version: ${next}`) || !latest.includes(names.exe)) throw new Error(`dist/latest.yml is not for ${names.exe}`);
for (const f of [names.exe, `${names.exe}.blockmap`]) if (!existsSync(join(dist, f))) throw new Error(`dist/${f} is missing`);

step('Android APK');
npx(['cap', 'sync', 'android']);
run('gradlew.bat', ['assembleDebug', '-q'], { cwd: join(APP, 'android'), env: { ANDROID_SDK_ROOT: SDK }, shell: true });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, names.apk), readFileSync(join(APP, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')));

step('Screens for the phones');
// Windows' own tar writes zip files; the entries sit at the zip's root (index.html first level).
run('C:\\Windows\\System32\\tar.exe', ['-a', '-c', '-f', join(OUT, names.zip), '-C', WWW, ...readdirSync(WWW)]);
manifest.bundleSha256 = sha256(join(OUT, names.zip));
manifest.bundleBytes = statSync(join(OUT, names.zip)).size;
writeFileSync(join(WWW, 'app-version.json'), JSON.stringify(manifest, null, 2) + '\n');
say(`${names.zip}: ${(manifest.bundleBytes / 1e6).toFixed(1)} MB`);

// ------------------------------------------------------------------ 3. git + GitHub release
step('Commit and push the version');
run('git', ['add', 'resources/app/package.json', 'resources/app/package-lock.json', 'resources/app/android/app/build.gradle', 'resources/app/www/app-version.json'], { cwd: ROOT });
run('git', ['commit', '-q', '-m', `release: Danfosal App ${next}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`], { cwd: ROOT });
run('git', ['push', '-q', 'origin', 'HEAD'], { cwd: ROOT });
const sha = run('git', ['rev-parse', 'HEAD'], { cwd: ROOT, quiet: true }).trim();

step(`GitHub release v${next}`);
const api = (path, init = {}) => fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, { ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'danfosal-release', ...(init.headers || {}) } });
let res = await api('/releases', { method: 'POST', body: JSON.stringify({ tag_name: `v${next}`, target_commitish: sha, name: `Danfosal App ${next}`,
    body: `${notes}\n\nDesktop and phone apps update themselves. First install on a new device: ${names.exe} (Windows) or ${names.apk} (Android).`, draft: true }) });
if (!res.ok) throw new Error(`GitHub refused the release (${res.status}): ${(await res.text()).slice(0, 300)}`);
const rel = await res.json();
const files = [[join(dist, names.exe), names.exe], [join(dist, `${names.exe}.blockmap`), `${names.exe}.blockmap`], [join(dist, 'latest.yml'), 'latest.yml'],
    [join(OUT, names.apk), names.apk], [join(OUT, names.zip), names.zip]];
for (const [path, name] of files) {
    say(`  uploading ${name} (${(statSync(path).size / 1e6).toFixed(1)} MB)`);
    try { await upload(`https://uploads.github.com/repos/${owner}/${repo}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`, path, token); }
    catch (e) { throw new Error(`Upload of ${name} failed (${e.message}). The release is still a draft on GitHub; delete it and run again.`); }
}
res = await api(`/releases/${rel.id}`, { method: 'PATCH', body: JSON.stringify({ draft: false, make_latest: 'true' }) });
if (!res.ok) throw new Error(`Publishing the release failed (${res.status})`);
say(`published: https://github.com/${owner}/${repo}/releases/tag/v${next}`);

// ------------------------------------------------------------------ 4. Hosting
// The manifest with the zip's checksum (www/app-version.json, now differing from the builds' copy
// only by that) goes live with the web version; phones follow it from their next start.
if (!opt['skip-deploy']) {
    step('Web version and phone manifest (Firebase Hosting)');
    try { npx(['firebase', 'deploy', '--only', 'hosting']); }
    catch (e) { say(`Hosting deploy failed (${e.message}). Sign in with \`npx firebase login\`, then run \`npx firebase deploy --only hosting\` in resources\\app.`); }
}
run('git', ['add', 'resources/app/www/app-version.json'], { cwd: ROOT });
if (run('git', ['status', '--porcelain'], { cwd: ROOT, quiet: true }).trim()) {
    run('git', ['commit', '-q', '-m', `release: Danfosal App ${next} - phone manifest\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`], { cwd: ROOT });
    run('git', ['push', '-q', 'origin', 'HEAD'], { cwd: ROOT });
}

// ------------------------------------------------------------------ 5. this PC + Danfos HQ
if (!opt['skip-install']) {
    step('Install on this PC');
    run(join(dist, names.exe), ['/S', '/currentuser'], { cwd: ROOT });
    const installed = join(process.env.LOCALAPPDATA, 'Programs', 'Danfosal App', 'resources', 'app.asar');
    say(sha256(installed) === sha256(join(dist, 'win-unpacked', 'resources', 'app.asar')) ? 'installed app.asar is identical to the build' : 'WARNING: the installed app.asar differs from the build');
    step('Danfos HQ');
    try { run('python', [HQ_SYNC], { cwd: ROOT }); } catch (e) { say(`HQ sync failed: ${e.message}`); }
}
say(`\nDanfosal App ${next} is out. Desktop apps update within 4 hours (or at their next start); phones at their next start${minNative === next ? ' - after installing the new APK, which they are asked to do' : ''}.`);

// GH_TOKEN, else what git uses for github.com here (Git Credential Manager), never shown.
function githubToken() {
    if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
    const r = spawnSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } });
    const t = ((r.stdout || '').match(/^password=(.+)$/m) || [])[1];
    if (!t) throw new Error('No GitHub sign-in found: set GH_TOKEN (a token allowed to write this repository\'s contents) and run again.');
    return t.trim();
}
