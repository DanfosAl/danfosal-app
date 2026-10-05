// Reading the papers that aren't PDFs, and the PDFs that don't say so.
//
// - sniff(): what a file really is from its first bytes - a PDF saved without ".pdf" ("PDF (3)",
//   "piramida") is a PDF.
// - docxLines(): the text of a Word document, paragraph by paragraph, so the PDF rules can read
//   offers, contracts and data sheets written in Word.
// - bankStatement(): Raiffeisen's account turnover export, as XML (TransactionalAccountTurnoverALB)
//   or CSV ("Account:", "Period:"), which says which account and which dates it covers.
// - isSecret(): key and recovery-code files. Never read, never moved, never copied: they belong in a
//   password manager, and the owner is told so.
import { openSync, readSync, closeSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import JSZip from 'jszip';

export const isSecret = name => /adminsdk|service.?account|recovery.?codes|backup.?codes|\.(pem|key|p12|pfx|keystore|jks)$|id_rsa/i.test(name);

export function sniff(path) {
    const b = Buffer.alloc(8), fd = openSync(path, 'r');
    try { readSync(fd, b, 0, 8, 0); } finally { closeSync(fd); }
    if (b.subarray(0, 4).toString() === '%PDF') return 'pdf';
    if (b[0] === 0xFF && b[1] === 0xD8) return 'jpg';
    if (b.subarray(1, 4).toString() === 'PNG') return 'png';
    if (b.subarray(0, 2).toString() === 'PK') return 'zip';
    return '';
}

// The extension a file should have: its own, or ".pdf" for a PDF that lost it.
export function kindOf(path, name) {
    const ext = extname(name).toLowerCase();
    if (ext && ext.length <= 6 && !/\.\d+$/.test(ext)) return ext;
    return sniff(path) === 'pdf' ? '.pdf' : ext;
}

export async function docxLines(path) {
    const zip = await JSZip.loadAsync(readFileSync(path));
    const xml = await zip.file('word/document.xml')?.async('string');
    if (!xml) return [];
    return xml.split(/<\/w:p>/).map(p => (p.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''))
        .map(s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\s+/g, ' ').trim())
        .filter(Boolean);
}

// The column labels of a spreadsheet (its first rows that are mostly words), to tell a customs
// list from a packing list when the name says nothing. Only labels are read, never the data, and
// only from files under 3 MB: a big sheet is a data dump, not a paper.
export async function xlsxLabels(path, size) {
    if (size > 3 * 1048576) return [];
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path);
    const ws = wb.worksheets[0]; if (!ws) return [];
    const out = [];
    for (let r = 1; r <= Math.min(ws.rowCount, 8); r++) {
        const vals = (ws.getRow(r).values || []).filter(v => v !== null && v !== undefined && v !== '')
            .map(v => typeof v === 'object' ? (v.richText ? v.richText.map(t => t.text).join('') : '') : v);
        const words = vals.filter(v => typeof v === 'string' && /\p{L}{2,}/u.test(v) && !/\d{4,}/.test(v));
        if (vals.length >= 2 && words.length >= vals.length / 2) out.push(...words.map(String));
    }
    return out;
}

const ymd = s => { const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})|(\d{4})-(\d{2})-(\d{2})/); return !m ? '' : m[4] ? `${m[4]}-${m[5]}-${m[6]}` : `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; };

// {account (last 10 digits), from, to} or null.
export function bankStatement(path, ext) {
    const head = readFileSync(path, 'utf8').slice(0, 4000);
    if (ext === '.xml') {
        const h = head.match(/<Header\b[^>]*>/);
        if (!/TransactionalAccountTurnover/.test(head) || !h) return null;
        const attr = n => (h[0].match(new RegExp(`${n}="([^"]*)"`)) || [])[1] || '';
        return { account: attr('BeneficiaryAccount').replace(/\D/g, '').slice(-10), from: ymd(attr('FromDate')), to: ymd(attr('ToDate')) };
    }
    if (ext === '.csv') {
        const lines = head.split(/\r?\n/), i = lines.findIndex(l => /"Account: ?"/.test(l) && /"Period: ?"/.test(l));
        if (i < 0 || !lines[i + 1]) return null;
        const v = lines[i + 1], dates = v.match(/\d{1,2}\.\d{1,2}\.\d{4}/g) || [];
        return { account: ((v.match(/AL\d+/) || [''])[0]).slice(-10), from: ymd(dates[0]), to: ymd(dates[1]) };
    }
    return null;
}
