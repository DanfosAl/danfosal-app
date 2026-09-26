// Paper Autopilot: reads the PDFs in Downloads and files each under a name a person can read.
//
//   npm run dry-run                    make a plan and a report; change nothing
//   npm run apply -- <plan.json>       carry out a plan that has been reviewed
//   npm run undo -- <journal.jsonl>    put back everything a run moved
//   npm run sweep                      unattended: plan and apply in one go, for Task Scheduler.
//                                      Leaves anything downloaded in the last --settle minutes
//   --sweep --weekly                   the same, at most once a week: the first time it is started
//                                      on or after a Monday ("Danfosal Paper Autopilot" task)
//   --shortcuts                        refresh the "_Archive - ..." shortcuts in Downloads
//   --sync                             put the filed purchase papers into the app (purchaseDocs),
//                                      and new orders onto the order list (the sweep does this too)
//   --resync                           the same, re-reading every paper (after a reader improved)
//
// Options: --source <folder> (default Downloads), --dest <folder> (default E:\Danfos Papers),
// --out <folder> for plans, reports and journals, --settle <minutes> (sweep only, 15).
//
// Plans, reports and journals name customers and amounts: they stay in --out, on this PC.
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { makePlan } from './plan.js';
import { applyPlan, undoJournal } from './apply.js';
import { renderReport } from './report.js';
import { syncPurchases } from './sync.js';

// The owner's choice (26 Sep 2026): the E: drive, not Documents, which Windows syncs to OneDrive.
const { values: opt, positionals } = parseArgs({ allowPositionals: true, options: {
    apply: { type: 'boolean' }, undo: { type: 'boolean' }, sweep: { type: 'boolean' },
    weekly: { type: 'boolean' }, shortcuts: { type: 'boolean' }, sync: { type: 'boolean' }, resync: { type: 'boolean' },
    source: { type: 'string', default: join(homedir(), 'Downloads') },
    dest: { type: 'string', default: 'E:\\Danfos Papers' },
    out: { type: 'string', default: 'C:\\Danfosal\\Reports\\paper-autopilot' },
    settle: { type: 'string', default: '15' }
} });
mkdirSync(opt.out, { recursive: true });

const stamp = () => new Date().toISOString().slice(0, 19).replace(/:/g, '-');
const mbs = n => `${(n / 1048576).toFixed(0)} MB`;
const say = s => console.log(s);
const printResult = (r, journal) => {
    say(`\nMoved ${r.moved} files, sent ${r.recycled} copies to the Recycle Bin.${r.already ? ` ${r.already} were already filed by an earlier run.` : ''}`);
    if (r.skipped.length) { say(`Left ${r.skipped.length} where they were:`); r.skipped.slice(0, 30).forEach(s => say(`  ${s.file}: ${s.why}`)); }
    say(`\nJournal (for --undo): ${journal}`);
};

// "_Archive - ..." shortcuts in Downloads, one per archive folder (shortcuts.ps1). Returns what it made.
function refreshShortcuts() {
    const script = join(dirname(fileURLToPath(import.meta.url)), 'shortcuts.ps1');
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Source', opt.source, '-Dest', opt.dest],
        { encoding: 'utf8', windowsHide: true });
    return (r.stdout || '').split(/\r?\n/).filter(Boolean);
}

// The start of this week: Monday 00:00, local time.
function thisMonday() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7).getTime();
}

if (opt.apply) {
    // ------------------------------------------------------------ carry out a reviewed plan
    const planPath = positionals[0];
    if (!planPath || !existsSync(planPath)) { say('Give the plan to carry out: node autopilot.js --apply "<plan.json>"'); process.exit(1); }
    const plan = JSON.parse(readFileSync(planPath, 'utf8'));
    if (plan.kind !== 'paper-autopilot-plan') { say(`${planPath} is not a Paper Autopilot plan.`); process.exit(1); }
    say(`Carrying out ${planPath}: ${plan.summary.move} to file into ${plan.dest}, ${plan.summary.recycle} copies to the Recycle Bin.`);
    const journal = join(opt.out, `journal-${stamp()}.jsonl`);
    printResult(await applyPlan(plan, { journal, log: say }), journal);
    refreshShortcuts().forEach(s => say(`Downloads: ${s}`));

} else if (opt.sync || opt.resync) {
    // ------------------------------------------------------------ purchase papers to the app
    const r = await syncPurchases({ dest: opt.dest, downloads: opt.source, out: opt.out, resync: !!opt.resync, log: say });
    say(`Synced ${r.synced} purchase papers ${JSON.stringify(r.byKind)}; ${r.orderLines} order-list lines added.`);

} else if (opt.shortcuts) {
    // ------------------------------------------------------------ just the shortcuts
    const made = refreshShortcuts();
    say(made.length ? made.join('\n') : 'The shortcuts in Downloads are already up to date.');

} else if (opt.undo) {
    // ------------------------------------------------------------ put a run back
    const journal = positionals[0];
    if (!journal || !existsSync(journal)) { say('Give the journal to undo: node autopilot.js --undo "<journal.jsonl>" (the path an apply printed at its end)'); process.exit(1); }
    const r = await undoJournal(journal, { log: say });
    r.skipped.forEach(s => say(`  left ${s.file}: ${s.why}`));
    if (r.recycled) say(`${r.recycled} copies went to the Recycle Bin in that run; restore them from there if you want them back.`);

} else if (opt.sweep) {
    // ------------------------------------------------------------ unattended, from Task Scheduler
    // One run at a time: a lock younger than an hour means another sweep is still going.
    // --weekly: the task starts it at every logon and on Monday morning; only the first start on
    // or after Monday does the work, so a PC that stays off on Monday is swept the next time it
    // is turned on that week.
    const lock = join(opt.out, 'sweep.lock'), logFile = join(opt.out, 'sweep.log'), state = join(opt.out, 'sweep-state.json');
    const line = s => appendFileSync(logFile, `${new Date().toISOString()} ${s}\n`);
    let last = 0;
    try { last = Date.parse(JSON.parse(readFileSync(state, 'utf8')).lastSweep) || 0; } catch { }
    if (opt.weekly && last >= thisMonday()) process.exit(0);
    if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs < 3600000) process.exit(0);
    if (!existsSync(opt.dest.slice(0, 3))) { line(`skipped: ${opt.dest.slice(0, 2)} is not available`); process.exit(0); }
    writeFileSync(lock, String(process.pid));
    try {
        const settle = Number(opt.settle);
        const plan = await makePlan({ source: opt.source, dest: opt.dest, settleMinutes: Number.isFinite(settle) ? settle : 15, cachePath: join(opt.out, 'cache.json') });
        if (!plan.summary.move && !plan.summary.recycle) line('nothing new');
        else {
            const journal = join(opt.out, `journal-${stamp()}.jsonl`);
            const r = await applyPlan(plan, { journal });
            line(`filed ${r.moved}, recycled ${r.recycled}, skipped ${r.skipped.length} (${journal})`);
        }
        refreshShortcuts().forEach(s => line(`Downloads: ${s}`));
        // The purchase papers just filed, into the app. A failure here doesn't undo the filing.
        try {
            const s = await syncPurchases({ dest: opt.dest, downloads: opt.source, out: opt.out, log: line });
            if (s.synced) line(`synced ${s.synced} purchase papers ${JSON.stringify(s.byKind)}, ${s.orderLines} order-list lines added`);
        } catch (e) { line(`purchase sync failed: ${e.message}`); }
        writeFileSync(state, JSON.stringify({ lastSweep: new Date().toISOString() }));
    } catch (e) { line(`failed: ${e.stack || e}`); process.exitCode = 1; }
    finally { try { unlinkSync(lock); } catch { } }

} else {
    // ------------------------------------------------------------ the dry run
    say(`Paper Autopilot dry run: ${opt.source} -> ${opt.dest}. Nothing will be moved.`);
    const plan = await makePlan({ source: opt.source, dest: opt.dest, cachePath: join(opt.out, 'cache.json'), log: say });
    const day = new Date().toISOString().slice(0, 10);
    const planPath = join(opt.out, `plan-${day}.json`), reportPath = join(opt.out, `dry-run-${day}.html`);
    writeFileSync(planPath, JSON.stringify(plan, null, 1));
    writeFileSync(reportPath, renderReport(plan, planPath));
    const s = plan.summary;
    say(`
Would file ${s.move} PDFs (${mbs(s.moveBytes)}) into ${opt.dest}
Would send ${s.recycle} exact copies to the Recycle Bin (${mbs(s.recycleBytes)})
Would leave ${s.leave} files where they are
Nothing was changed.

Plan:   ${planPath}
Report: ${reportPath}
To carry it out: node autopilot.js --apply "${planPath}"`);
}
