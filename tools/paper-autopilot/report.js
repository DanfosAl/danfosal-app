// The dry run's plan as a page to read: where every PDF would go and under what name, which
// files are exact copies, and what stays in Downloads and why. A local file, never published:
// it names customers and amounts.
import { basename } from 'node:path';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mb = n => `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;
const plural = (n, one, many) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

const AREAS = ['Kärcher', 'Sales invoices', 'Purchase invoices', 'Proformas and drafts', 'Offers', 'Bank', 'Tax', 'Customs',
    'Suppliers', 'Companies (QKB extracts)', 'Catalogues', 'Personal and HR', 'ADI'];
const LEFT = { scan: 'Scans with no text: reading them needs OCR, a later step', unknown: 'PDFs it did not recognise', unreadable: 'PDFs that could not be opened' };

export function renderReport(plan, planPath) {
    const s = plan.summary, moves = plan.actions.filter(a => a.action === 'move');
    const copies = plan.actions.filter(a => a.action === 'recycle').sort((a, b) => a.duplicateOf.localeCompare(b.duplicateOf));
    const left = plan.actions.filter(a => a.action === 'leave');
    const undated = moves.filter(a => a.undated).length;

    const areaOf = a => a.folder.split('/')[0];
    const areas = [...new Set([...AREAS, ...moves.map(areaOf)])].filter(x => moves.some(a => areaOf(a) === x));
    const byType = {};
    moves.forEach(a => { byType[a.label] = (byType[a.label] || 0) + 1; });

    const moveRows = list => list.sort((a, b) => a.to.localeCompare(b.to)).map(a => `
        <tr><td class="old">${esc(a.file)}</td>
            <td class="new">${esc(basename(a.to))}${a.note ? `<small>${esc(a.note)}</small>` : ''}</td>
            <td class="dir">${esc(a.folder)}</td></tr>`).join('');

    const area = name => {
        const list = moves.filter(a => areaOf(a) === name);
        const sensitive = list.some(a => a.sensitive);
        return `<details${sensitive ? '' : ' open'}><summary><b>${esc(name)}</b><span>${plural(list.length, 'file', 'files')}</span>${sensitive ? '<em>kept under their own names; nothing is read out of them</em>' : ''}</summary>
            <div class="scroll"><table><thead><tr><th>Now called</th><th>Would be called</th><th>Folder</th></tr></thead><tbody>${moveRows(list)}</tbody></table></div></details>`;
    };

    const leftGroups = Object.entries(LEFT).map(([type, title]) => {
        const list = left.filter(a => a.type === type);
        return list.length ? `<details><summary><b>${esc(title)}</b><span>${plural(list.length, 'file', 'files')}</span></summary>
            <ul class="names">${list.map(a => `<li>${esc(a.file)}${a.note ? ` <small>${esc(a.note)}</small>` : ''}</li>`).join('')}</ul></details>` : '';
    }).join('');
    const other = left.filter(a => a.type === 'not-pdf');
    const byExt = {};
    other.forEach(a => { const k = a.label.replace(/ file$/, ''); byExt[k] = byExt[k] || { n: 0, size: 0 }; byExt[k].n++; byExt[k].size += a.size; });
    const extRows = Object.entries(byExt).sort((a, b) => b[1].n - a[1].n)
        .map(([ext, v]) => `<tr><td>${esc(ext)}</td><td class="n">${v.n}</td><td class="n">${mb(v.size)}</td></tr>`).join('');

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paper Autopilot dry run</title>
<style>
:root { --bg:#f6f5f2; --card:#fff; --ink:#1d1d1b; --muted:#6b6a66; --line:#e4e2dc; --accent:#b8860b; --ok:#2e7d4f; --warn:#a15c00; }
@media (prefers-color-scheme: dark) { :root { --bg:#161614; --card:#1f1f1c; --ink:#ecebe6; --muted:#a3a19a; --line:#34332f; --accent:#e0b44a; --ok:#6cc08f; --warn:#e6a15a; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.45 "Segoe UI", system-ui, sans-serif; }
main { max-width:1180px; margin:0 auto; padding:28px 16px 60px; }
h1 { font-size:24px; margin:0 0 4px; } h2 { font-size:17px; margin:34px 0 10px; }
.lede { color:var(--muted); margin:0 0 20px; }
.lede b { color:var(--ok); }
.kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:10px; }
.kpi { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px 14px; }
.kpi small { color:var(--muted); display:block; } .kpi .v { font-size:26px; font-weight:600; display:block; } .kpi .d { color:var(--muted); font-size:12px; }
.chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; }
.chip { background:var(--card); border:1px solid var(--line); border-radius:99px; padding:3px 10px; font-size:12px; }
.chip b { color:var(--accent); }
details { background:var(--card); border:1px solid var(--line); border-radius:10px; margin:8px 0; }
summary { cursor:pointer; padding:10px 14px; display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; }
summary span { color:var(--muted); } summary em { color:var(--warn); font-size:12px; font-style:normal; }
.scroll { overflow-x:auto; border-top:1px solid var(--line); }
table { border-collapse:collapse; width:100%; }
th, td { text-align:left; padding:6px 14px; border-bottom:1px solid var(--line); vertical-align:top; }
th { color:var(--muted); font-weight:500; font-size:12px; }
td.old { color:var(--muted); word-break:break-word; width:36%; } td.new { word-break:break-word; width:42%; } td.dir { color:var(--muted); white-space:nowrap; font-size:12px; }
td small, li small { display:block; color:var(--warn); font-size:12px; }
td.n { text-align:right; font-variant-numeric:tabular-nums; }
ul.names { margin:0; padding:8px 14px 12px 32px; border-top:1px solid var(--line); columns:2 340px; }
ul.names li { break-inside:avoid; word-break:break-word; margin:2px 0; }
.small { max-width:420px; }
footer { color:var(--muted); font-size:12px; margin-top:36px; }
code { font-family:Consolas, monospace; font-size:12px; }
</style></head>
<body><main>
<h1>Paper Autopilot: dry run</h1>
<p class="lede"><b>Nothing has been moved, renamed or deleted.</b> This is what would happen to the ${plural(s.files, 'file', 'files')} in <code>${esc(plan.source)}</code>, filed into <code>${esc(plan.dest)}</code>. Read ${new Date(plan.createdAt).toLocaleString('en-GB')}.</p>

<div class="kpis">
  <div class="kpi"><small>Would be filed</small><span class="v">${s.move}</span><span class="d">PDFs named from their own text</span></div>
  <div class="kpi"><small>Exact copies</small><span class="v">${s.recycle}</span><span class="d">to the Recycle Bin, one copy kept · ${mb(s.recycleBytes)}</span></div>
  <div class="kpi"><small>Left in Downloads</small><span class="v">${s.leave}</span><span class="d">not recognised, scans, and non-PDF files</span></div>
  ${undated ? `<div class="kpi"><small>No date found</small><span class="v">${undated}</span><span class="d">filed in an "Undated" folder</span></div>` : ''}
</div>
<div class="chips">${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="chip"><b>${v}</b> ${esc(k)}</span>`).join('')}</div>

<h2>Where the PDFs would go</h2>
${areas.map(area).join('')}

<h2>Exact copies</h2>
<details><summary><b>Byte-for-byte the same as a file that stays</b><span>${plural(copies.length, 'file', 'files')} · ${mb(s.recycleBytes)}</span></summary>
<div class="scroll"><table><thead><tr><th>Copy</th><th>Same as</th></tr></thead><tbody>
${copies.map(a => `<tr><td class="old">${esc(a.file)}</td><td>${esc(a.duplicateOf)}</td></tr>`).join('')}
</tbody></table></div></details>

<h2>Left where they are</h2>
${leftGroups}
<details><summary><b>Other kinds of file</b><span>${plural(other.length, 'file', 'files')}: only PDFs are filed for now</span></summary>
<div class="scroll small"><table><thead><tr><th>Type</th><th class="n">Files</th><th class="n">Size</th></tr></thead><tbody>${extRows}</tbody></table></div></details>

<footer>The plan behind this page: <code>${esc(planPath)}</code>. It records each file's SHA-256, so the step that carries it out can refuse any file that has changed since it was read.</footer>
</main></body></html>`;
}
