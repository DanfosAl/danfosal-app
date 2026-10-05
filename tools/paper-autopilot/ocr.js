// Reading a scan: a PDF whose pages are pictures (the shop's scanner, a faxed supplier invoice).
//
// pdf.js decodes the page's image itself - CCITT fax, JPEG, whatever the scanner wrote - so no
// drawing library is needed; the pixels become a plain greyscale PGM, which Tesseract reads. The
// engine and its English data are the ones Danfosal App already ships (resources/app), so nothing
// is downloaded. Only the first page is read: enough to tell what a paper is and whose it is.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const APP = join(dirname(fileURLToPath(import.meta.url)), '../../resources/app');
let worker = null;

async function tesseract() {
    if (worker) return worker;
    const { createWorker } = require(join(APP, 'node_modules/tesseract.js'));
    worker = await createWorker('eng', 1, { langPath: APP, gzip: false, cacheMethod: 'none', logger: () => {} });
    return worker;
}
export async function closeOcr() { if (worker) { await worker.terminate(); worker = null; } }

// pdf.js image data -> 8-bit greyscale PGM (kind 1: 1 bit per pixel, rows padded to bytes;
// kind 2: RGB; kind 3: RGBA).
function toPgm({ width, height, kind, data }) {
    const out = Buffer.alloc(width * height);
    if (kind === 1) {
        const row = (width + 7) >> 3;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
            out[y * width + x] = (data[y * row + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
    } else {
        const step = kind === 3 ? 4 : 3;
        for (let i = 0, p = 0; i < width * height; i++, p += step) out[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
    }
    return Buffer.concat([Buffer.from(`P5\n${width} ${height}\n255\n`), out]);
}

// The biggest picture on page 1 (the scanned page itself, not a logo), read as text lines.
export async function ocrFirstPage(path, pdfjs) {
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await readFile(path)), verbosity: 0, isEvalSupported: false }).promise;
    try {
        const page = await pdf.getPage(1);
        const ops = await page.getOperatorList();
        const ids = ops.fnArray.map((fn, i) => fn === pdfjs.OPS.paintImageXObject ? ops.argsArray[i][0] : null).filter(Boolean);
        let best = null;
        for (const id of ids) {
            const store = id.startsWith('g_') ? page.commonObjs : page.objs;
            const img = await new Promise(res => { try { store.get(id, res); } catch { res(null); } });
            if (img && img.data && (!best || img.width * img.height > best.width * best.height)) best = img;
        }
        if (!best || best.width * best.height < 200 * 200) return [];
        const { data } = await (await tesseract()).recognize(toPgm(best));
        return data.text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 1);
    } finally { await pdf.destroy(); }
}
