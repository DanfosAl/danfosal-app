// A PDF's own text as lines in reading order, the same way Stock > Receive delivery reads it
// (www/app/receive.js, pdfLines): items grouped by their baseline, top to bottom, left to right.
// Same pdf.js version as the app (3.11.174), so parseKarcher() sees identical lines here.
import { readFile } from 'node:fs/promises';

// On load pdf.js warns that it can't find 'canvas' (it's for drawing pages, not reading text),
// and later about fonts it can't map. Neither matters here, so both are kept off the console.
const say = [console.log, console.warn];
console.log = console.warn = () => {};
const { default: pdfjs } = await import('pdfjs-dist/legacy/build/pdf.js');
[console.log, console.warn] = say;
const QUIET = pdfjs.VerbosityLevel.ERRORS;

export async function pdfLines(path, { maxPages = 6 } = {}) {
    const data = new Uint8Array(await readFile(path));
    const pdf = await pdfjs.getDocument({ data, verbosity: QUIET, isEvalSupported: false, useSystemFonts: false }).promise;
    const out = [];
    try {
        for (let p = 1; p <= Math.min(pdf.numPages, maxPages); p++) {
            const tc = await (await pdf.getPage(p)).getTextContent();
            const rows = new Map();
            tc.items.forEach(i => {
                const y = Math.round(i.transform[5]);
                const key = [...rows.keys()].find(k => Math.abs(k - y) <= 2) ?? y;
                if (!rows.has(key)) rows.set(key, []);
                rows.get(key).push({ x: i.transform[4], s: i.str });
            });
            [...rows.entries()].sort((a, b) => b[0] - a[0])
                .forEach(([, r]) => out.push(r.sort((a, b) => a.x - b.x).map(z => z.s).join(' ').replace(/\s+/g, ' ').trim()));
        }
        return { lines: out.filter(Boolean), pages: pdf.numPages };
    } finally {
        await pdf.destroy();
    }
}
