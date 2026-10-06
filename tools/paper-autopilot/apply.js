// Carrying out a plan, and undoing it.
//
// Every step checks before it acts: a file must still be the one the plan read (same SHA-256),
// nothing is ever overwritten, and a copy goes to the Recycle Bin only while the file it copies
// is still there. Each step is written to a journal the moment it happens, so --undo can put
// every moved file back even after an interrupted run. Recycled copies are restored from the
// Recycle Bin by hand, like anything else deleted in Explorer.
import { appendFileSync, copyFileSync, constants, existsSync, mkdirSync, readFileSync, readdirSync, renameSync,
    rmdirSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './plan.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// A move that also works across drives: rename where it can, else copy, check, then remove.
async function move(from, to) {
    try { renameSync(from, to); return; }
    catch (e) { if (e.code !== 'EXDEV') throw e; }
    const s = statSync(from);
    copyFileSync(from, to, constants.COPYFILE_EXCL);
    utimesSync(to, s.atime, s.mtime);
    if (await sha256(to) !== await sha256(from)) { unlinkSync(to); throw new Error('the copy did not match'); }
    unlinkSync(from);
}

// Returns one entry per path: '' when it went to the Recycle Bin, otherwise why not.
function recycle(paths) {
    if (!paths.length) return [];
    const list = join(tmpdir(), `paper-autopilot-recycle-${process.pid}.txt`);
    writeFileSync(list, paths.join('\n') + '\n', 'utf8');
    try {
        const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(HERE, 'recycle.ps1'), list],
            { encoding: 'utf8', windowsHide: true });
        const out = paths.map(() => 'the Recycle Bin gave no answer');
        (r.stdout || '').split(/\r?\n/).filter(Boolean).forEach(l => {
            const [st, i, code] = l.trim().split('\t');
            if (out[Number(i)] !== undefined) out[Number(i)] = st === 'ok' ? '' : `the Recycle Bin refused it (${code})`;
        });
        return out;
    } finally { try { unlinkSync(list); } catch { } }
}

export async function applyPlan(plan, { journal, log = () => {} }) {
    const note = entry => appendFileSync(journal, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
    const res = { moved: 0, already: 0, recycled: 0, skipped: [] };
    const skip = (a, why) => { res.skipped.push({ file: a.file, why }); note({ op: 'skip', file: a.file, why }); };
    const before = earlierMoves(dirname(journal));
    note({ op: 'start', source: plan.source, dest: plan.dest, planCreated: plan.createdAt });

    // 1. Moves. A file an earlier run of this plan already moved counts as done, so a plan can be
    // run again to finish what an interrupted or partly failed run left.
    const where = new Map();                     // file name -> where it is now
    for (const a of plan.actions.filter(x => x.action === 'move')) {
        const from = join(plan.source, a.file);
        const earlier = before.get(from.toLowerCase());
        if (!existsSync(from) && earlier && existsSync(earlier.to) && earlier.sha256 === a.sha256) {
            where.set(a.file, earlier.to); res.already++; continue;
        }
        if (!existsSync(from)) { skip(a, 'no longer in the folder'); continue; }
        if (await sha256(from) !== a.sha256) { skip(a, 'changed since the plan was made'); continue; }
        if (existsSync(a.to)) { skip(a, 'a file is already there with that name'); continue; }
        try {
            mkdirSync(dirname(a.to), { recursive: true });
            await move(from, a.to);
            where.set(a.file, a.to);
            note({ op: 'move', from, to: a.to, sha256: a.sha256, type: a.type });
            res.moved++;
            if (res.moved % 50 === 0) log(`  moved ${res.moved}`);
        } catch (e) { skip(a, e.code === 'EBUSY' || e.code === 'EPERM' ? 'open in another program' : String(e.message || e)); }
    }

    // 2. Copies, once it's certain the file each one copies is still somewhere.
    const toRecycle = [];
    for (const a of plan.actions.filter(x => x.action === 'recycle')) {
        const from = join(plan.source, a.file);
        // keptAt: the identical file is already filed (a PDF downloaded twice, the second time
        // after the first had been filed). keptSha: a reprint - the same numbered paper with other
        // bytes - so the filed copy must still be the one the plan saw.
        const kept = a.keptAt || where.get(a.duplicateOf) || join(plan.source, a.duplicateOf);
        if (!existsSync(from)) { skip(a, 'no longer in the folder'); continue; }
        if (!existsSync(kept) || await sha256(kept) !== (a.keptSha || a.sha256)) { skip(a, `the copy that stays (${a.duplicateOf}) is gone or changed, so this one stays too`); continue; }
        if (await sha256(from) !== a.sha256) { skip(a, 'changed since the plan was made'); continue; }
        toRecycle.push({ a, from, kept });
    }
    const outcome = recycle(toRecycle.map(x => x.from));
    for (const [i, { a, from, kept }] of toRecycle.entries()) {
        if (outcome[i]) { skip(a, outcome[i]); continue; }
        note({ op: 'recycle', from, sha256: a.sha256, sameAs: kept });
        res.recycled++;
    }
    note({ op: 'end', moved: res.moved, already: res.already, recycled: res.recycled, skipped: res.skipped.length });
    return res;
}

// Every move recorded in the journals beside this one: original path (lower case) -> {to, sha256}.
// A file that --undo put back is in its folder again, so it is simply moved afresh.
function earlierMoves(dir) {
    const out = new Map();
    let names = [];
    try { names = readdirSync(dir).filter(n => /^journal-.*\.jsonl$/.test(n)).sort(); } catch { return out; }
    for (const n of names) {
        let lines = [];
        try { lines = readFileSync(join(dir, n), 'utf8').split(/\r?\n/).filter(Boolean); } catch { continue; }
        for (const l of lines) {
            try { const e = JSON.parse(l); if (e.op === 'move') out.set(e.from.toLowerCase(), { to: e.to, sha256: e.sha256 }); } catch { }
        }
    }
    return out;
}

// Put every moved file back where it came from, newest move first. A file that was changed or
// moved again since is left where it is; folders the run created and emptied are removed.
export async function undoJournal(journalPath, { log = () => {} } = {}) {
    const entries = readFileSync(journalPath, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
    const dest = (entries.find(e => e.op === 'start') || {}).dest;
    const res = { restored: 0, skipped: [], recycled: entries.filter(e => e.op === 'recycle').length };
    for (const e of entries.filter(x => x.op === 'move').reverse()) {
        if (!existsSync(e.to)) { res.skipped.push({ file: e.to, why: 'not there any more' }); continue; }
        if (existsSync(e.from)) { res.skipped.push({ file: e.to, why: 'something else now has its old name' }); continue; }
        if (await sha256(e.to) !== e.sha256) { res.skipped.push({ file: e.to, why: 'changed since it was filed' }); continue; }
        await move(e.to, e.from);
        res.restored++;
        // Tidy the folders this left empty, inside the destination root and never the root itself.
        // relative() rather than comparing strings, which "E:/x" and "E:\x" would fail.
        for (let d = dirname(e.to); dest; d = dirname(d)) {
            const rel = relative(dest, d);
            if (!rel || rel.startsWith('..') || isAbsolute(rel)) break;
            try { if (readdirSync(d).length) break; rmdirSync(d); } catch { break; }
        }
    }
    log(`Put back ${res.restored} files.`);
    return res;
}
