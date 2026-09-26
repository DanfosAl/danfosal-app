// Making the plan: every file in the source folder, what it is, and what should happen to it.
// Nothing here touches a file; apply.js carries a plan out.
//
// Actions: 'move' (a recognised PDF, with its destination), 'recycle' (a byte-for-byte copy of a
// file that stays), 'leave' (everything else, with the reason).
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pdfLines } from './pdftext.js';
import { classify, clean } from './classify.js';
import { readKarcherStatement } from './purchase-read.js';

// Unfinished downloads, Windows' own files, and the shortcuts to the archive that live here.
const SKIP = /^(desktop\.ini|thumbs\.db)$|\.(crdownload|part|tmp|lnk)$/i;

// What was learnt about a file last time, keyed by name, size and date, so a scheduled run does
// not re-read 3 GB of installers every half hour. A PDF's "not recognised" answer is only reused
// while the rules that gave it are unchanged.
const HERE = dirname(fileURLToPath(import.meta.url));
const RULES_VERSION = createHash('sha256')
    .update(readFileSync(join(HERE, 'classify.js'))).update(readFileSync(join(HERE, '../../resources/app/www/app/karcher-invoice.js')))
    .digest('hex').slice(0, 16);
function loadCache(path) {
    try { const c = JSON.parse(readFileSync(path, 'utf8')); return c.rules === RULES_VERSION ? c : { files: c.files || {}, rules: RULES_VERSION, stale: true }; }
    catch { return { files: {}, rules: RULES_VERSION }; }
}

export function sha256(path) {
    return new Promise((resolve, reject) => {
        const h = createHash('sha256');
        createReadStream(path).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
    });
}

// Of several identical files, keep the one a person named: not a browser's " (2)" copy, then
// the shortest name, then the oldest.
const isCopyName = n => /\(\d+\)(?=\.[^.]+$)/.test(n);
const keeperOf = group => group.slice().sort((a, b) => isCopyName(a.name) - isCopyName(b.name) || a.name.length - b.name.length || a.mtime - b.mtime)[0];

const base = f => ({ file: f.name, size: f.size, modified: new Date(f.mtime).toISOString(), sha256: f.sha256 });

// settleMinutes: a file that arrived more recently than this is left alone, so a scheduled run
// never files a PDF the owner has just downloaded and is about to open or send.
export async function makePlan({ source, dest, settleMinutes = 0, cachePath = '', log = () => {} }) {
    const now = Date.now();
    const files = readdirSync(source, { withFileTypes: true })
        .filter(d => d.isFile() && !SKIP.test(d.name))
        .map(d => { const path = join(source, d.name), s = statSync(path); return { name: d.name, path, size: s.size, mtime: s.mtimeMs, arrived: Math.max(s.birthtimeMs || 0, s.mtimeMs) }; })
        .sort((a, b) => a.mtime - b.mtime);
    const settling = f => settleMinutes > 0 && now - f.arrived < settleMinutes * 60000;

    const cache = cachePath ? loadCache(cachePath) : { files: {} }, seen = {};
    for (const f of files) {
        f.key = `${f.name}|${f.size}|${f.mtime}`;
        const known = cache.files[f.key];
        f.sha256 = known?.sha256 || await sha256(f.path);
        f.verdict = !cache.stale && known?.verdict;
        seen[f.key] = { sha256: f.sha256 };
    }

    // Exact copies. A group with a file still settling is left whole until it settles.
    const actions = [], keepers = [], byHash = new Map();
    files.forEach(f => byHash.set(f.sha256, [...(byHash.get(f.sha256) || []), f]));
    for (const group of byHash.values()) {
        if (group.some(settling)) { group.forEach(f => actions.push({ ...base(f), action: 'leave', type: 'settling', label: 'Just downloaded' })); continue; }
        const keep = keeperOf(group);
        keepers.push(keep);
        group.filter(f => f !== keep).forEach(f => actions.push({ ...base(f), action: 'recycle', type: 'duplicate', label: 'Exact copy', duplicateOf: keep.name }));
    }

    // What each PDF is.
    const pdfs = keepers.filter(f => /\.pdf$/i.test(f.name));
    let done = 0;
    for (const f of keepers) {
        // Kärcher's account statement arrives as a spreadsheet, not a PDF.
        if (/\.xlsx$/i.test(f.name) && /balance|statement|kartel/i.test(f.name)) {
            const st = await readKarcherStatement(f.path).catch(() => null);
            if (st) {
                const d = f.name.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/), date = d ? `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}` : st.date;
                actions.push({ ...base(f), action: 'move', type: 'karcher-statement', label: 'Kärcher account statement', folder: `Kärcher/Statements/${date.slice(0, 4)}`,
                    newName: `${date} Kärcher statement.xlsx`, fields: { date, open: st.openTotal, lines: st.lines.length } });
                continue;
            }
        }
        if (!/\.pdf$/i.test(f.name)) {
            actions.push({ ...base(f), action: 'leave', type: 'not-pdf', label: `${(extname(f.name) || '(no extension)').toLowerCase()} file` });
            continue;
        }
        if (++done % 50 === 0) log(`  read ${done} of ${pdfs.length} PDFs`);
        if (f.verdict) { actions.push({ ...base(f), action: 'leave', ...f.verdict }); seen[f.key].verdict = f.verdict; continue; }
        let read;
        try {
            read = await pdfLines(f.path, { maxPages: 4 });
            // A Kärcher invoice's totals are on its last page.
            if (read.pages > 4 && /k[aä]rcher d\.o\.o\./i.test(read.lines.join(' '))) read = await pdfLines(f.path, { maxPages: 60 });
        } catch (e) {
            actions.push({ ...base(f), action: 'leave', type: 'unreadable', label: 'Could not be opened', note: String(e.message || e).slice(0, 120) });
            continue;
        }
        const hit = classify({ name: f.name, lines: read.lines, pages: read.pages });
        if (hit) { actions.push({ ...base(f), action: 'move', ...hit }); continue; }
        const verdict = read.lines.join('').replace(/\s/g, '').length < 40 ? { type: 'scan', label: 'Scan with no text' } : { type: 'unknown', label: 'Not recognised' };
        actions.push({ ...base(f), action: 'leave', ...verdict });
        seen[f.key].verdict = verdict;
    }
    if (cachePath) writeFileSync(cachePath, JSON.stringify({ rules: RULES_VERSION, files: seen }));

    // Where each one goes. Oldest first, so when two different files earn the same name (an
    // invoice and its reprint) the original keeps the plain name and the later one is numbered.
    // Versions of an offer keep their old file name instead, which says which is which.
    // A file already in the destination folder with the very same bytes, whatever it is called,
    // means this PDF was filed before and has been downloaded again: it is a copy to recycle, not
    // a "(2)". Only files of the same size are hashed.
    const taken = new Set(), free = p => !taken.has(p.toLowerCase()) && !existsSync(p);
    const listed = new Map();
    const twinIn = async (dir, a) => {
        if (!listed.has(dir)) {
            let entries = [];
            try { entries = readdirSync(dir, { withFileTypes: true }).filter(d => d.isFile()).map(d => { const p = join(dir, d.name); return { p, size: statSync(p).size }; }); } catch { }
            listed.set(dir, entries);
        }
        for (const f of listed.get(dir).filter(x => x.size === a.size)) if (await sha256(f.p) === a.sha256) return f.p;
        return '';
    };
    for (const a of actions.filter(x => x.action === 'move').sort((x, y) => x.modified.localeCompare(y.modified))) {
        const dir = join(dest, ...a.folder.split('/'));
        const twin = await twinIn(dir, a);
        if (twin) {
            Object.assign(a, { action: 'recycle', type: 'duplicate', label: 'Already filed', duplicateOf: twin, keptAt: twin });
            continue;
        }
        const plain = join(dir, a.newName), ext = extname(a.newName), stem = a.newName.slice(0, a.newName.length - ext.length);
        const versioned = join(dir, `${stem} (${clean(a.file.replace(/(\.pdf)+$/i, ''), 70)})${ext}`);
        function* names() {
            yield plain;
            if (a.versions) yield versioned;
            for (let n = 2; ; n++) yield join(dir, `${stem} (${n})${ext}`);
        }
        let to = '';
        for (const name of names()) if (free(name)) { to = name; break; }
        if (to === versioned) a.note = 'Another version of the same offer, told apart by its old file name';
        else if (to !== plain) a.note = 'Another file gets the same name (a reprint or a second copy?), so this one is numbered';
        taken.add(to.toLowerCase());
        a.to = to;
    }

    const count = key => actions.reduce((m, a) => (m[a[key]] = (m[a[key]] || 0) + 1, m), {});
    const of = kind => actions.filter(a => a.action === kind);
    return {
        kind: 'paper-autopilot-plan', version: 1, createdAt: new Date().toISOString(), source, dest,
        summary: {
            files: files.length, pdfs: files.filter(f => /\.pdf$/i.test(f.name)).length,
            move: of('move').length, moveBytes: of('move').reduce((s, a) => s + a.size, 0),
            recycle: of('recycle').length, recycleBytes: of('recycle').reduce((s, a) => s + a.size, 0),
            leave: of('leave').length, byType: count('type')
        },
        actions
    };
}
