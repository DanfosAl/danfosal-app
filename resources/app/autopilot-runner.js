// Runs the Paper Autopilot for the desktop app's "Check Downloads now" button (Stock > Purchases,
// Receive delivery): the Monday sweep at once - file the new PDFs in Downloads, read the purchase
// papers into purchaseDocs, put new orders on the order list - returning the tool's JSON summary.
//
// The tool lives in the repository on this PC, like the EasyPOS watchdog, and runs on the PC's
// Node (falling back to Electron's own, as plain Node). One run at a time: a second press while one
// is going gets the same result. Kept apart from main.js so it can be tested with plain Node.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const AUTOPILOT = process.env.DANFOSAL_AUTOPILOT || 'E:\\DanfosalApp\\tools\\paper-autopilot\\autopilot.js';
let running = null;

function nodeBinary(execPath) {
    const system = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)
        .map(p => path.join(p, 'nodejs', 'node.exe')).find(p => fs.existsSync(p));
    return system ? { cmd: system, env: {} } : { cmd: execPath, env: { ELECTRON_RUN_AS_NODE: '1' } };
}

function runAutopilot({ script = AUTOPILOT, args = ['--now'], execPath = process.execPath, timeoutMs = 10 * 60 * 1000 } = {}) {
    if (!fs.existsSync(script)) return Promise.resolve({ ok: false, error: `The Paper Autopilot isn't at ${script}` });
    if (running) return running;
    running = new Promise(resolve => {
        const { cmd, env } = nodeBinary(execPath);
        const child = spawn(cmd, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', script, ...args],
            { cwd: path.dirname(script), env: { ...process.env, ...env }, windowsHide: true });
        let out = '', err = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { err += d; });
        const timer = setTimeout(() => child.kill(), timeoutMs);
        child.on('error', e => { clearTimeout(timer); resolve({ ok: false, error: e.message }); });
        child.on('close', code => {
            clearTimeout(timer);
            // The summary is the last JSON line; anything before it is the tool's own chatter.
            const last = out.trim().split(/\r?\n/).reverse().find(l => l.trim().startsWith('{'));
            try { resolve(JSON.parse(last)); }
            catch {
                // A crash prints a stack; the line that says what went wrong is the "...Error: ..." one.
                const text = err || out || '', said = text.match(/^\s*\w*Error:\s*.+$/m);
                resolve({ ok: false, error: (said ? said[0] : text || `stopped with code ${code}`).trim().slice(-400) });
            }
        });
    }).finally(() => { running = null; });
    return running;
}

module.exports = { runAutopilot, AUTOPILOT };
