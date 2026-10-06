// Adding new Danfos e-invoices to Sales on their own - what Sell > Import invoice does by hand.
//
// Every e-invoice the filer puts in "Sales invoices" (Danfos as the seller, from the Platforma
// Qendrore e Faturave) dated SALES_FROM or later is read with the app's own code: the same text
// builder and product matching (www/app/invoice-text.js) and the same ManualPDFProcessor, which
// reads the invoice and saves the sale - stock, customer, a matching online order - exactly as a
// manual import does. It is saved only when nothing needs a person:
//   - it isn't a sale already (same number AND an invoice-type sale or the same total: e-invoice
//     and till numbers share the "63/2026" form, so the number alone would fool it);
//   - every line is matched to a catalogue product; the lines add up to the subtotal;
//   - there is a buyer and a euro total (an invoice in lek needs the day's rate from the owner).
// Otherwise it waits in Sell > Import invoice, already read, with the reason. Each outcome is a
// record in `salesImports`. Older e-invoices are left alone: many were recorded other ways (a till
// sale, the 2025 import) and only a person can tell.
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, relative, basename } from 'node:path';
import { sha256 } from './plan.js';
import { pdfjs } from './pdftext.js';
import { textItemsToLines, pageText, cleanItemName, findBestProductMatch } from '../../resources/app/www/app/invoice-text.js';

const require = createRequire(import.meta.url);
export const SALES_FROM = '2026-10-01';

const walk = d => existsSync(d) ? readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; }) : [];
const short = n => String(n || '').split('/').slice(0, 2).join('/');
const saleNo = s => s.invoiceNumber || (s.easypos && s.easypos.invoiceNumber) || '';
const clean = o => JSON.parse(JSON.stringify(o));      // Firestore refuses undefined

// The processor was written for the browser's Firebase library; these are the same calls on the
// Admin SDK. The one difference that matters: the browser asks snap.exists(), Admin has snap.exists.
function adminCalls(admin) {
    const wrap = s => ({ id: s.id, ref: s.ref, exists: () => s.exists, data: () => s.data() });
    return {
        collection: (db, name) => db.collection(name),
        doc: (db, coll, id) => db.collection(coll).doc(id),
        addDoc: (ref, data) => ref.add(data),
        getDocs: ref => ref.get(),
        getDoc: async ref => wrap(await ref.get()),
        updateDoc: (ref, data) => ref.update(data),
        Timestamp: admin.firestore.Timestamp
    };
}

// The text exactly as Sell > Import invoice builds it: every page, "=== PAGE n ===" before each.
async function invoiceText(path) {
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await readFile(path)), verbosity: 0, isEvalSupported: false }).promise;
    try {
        let text = '';
        for (let n = 1; n <= pdf.numPages; n++) text += pageText(n, textItemsToLines((await (await pdf.getPage(n)).getTextContent()).items));
        return text;
    } finally { await pdf.destroy(); }
}

// "2026-10-02" or "02/10/2026" -> that day at 12:00 local time; null when it isn't a date.
function invoiceDay(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/) || String(s || '').match(/^(\d{2})[./](\d{2})[./](\d{4})/);
    if (!m) return null;
    const [y, mo, d] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]];
    const day = new Date(Number(y), Number(mo) - 1, Number(d), 12);
    return isNaN(day) ? null : day;
}

// The processor talks a lot; keep its chatter out of the summary the app reads.
async function quietly(fn) {
    const keep = [console.log, console.warn, console.info];
    console.log = console.warn = console.info = () => {};
    try { return await fn(); } finally { [console.log, console.warn, console.info] = keep; }
}

export async function importSales({ dest, out, dry = false, log = () => {} }) {
    const result = { added: [], review: [], already: [] };
    const files = walk(join(dest, 'Sales invoices')).filter(f => /E-invoice/i.test(basename(f)) && basename(f).slice(0, 10) >= SALES_FROM);
    if (!files.length) return result;
    const statePath = join(out, 'sales-import.json');
    let state = {};
    try { state = JSON.parse(readFileSync(statePath, 'utf8')); } catch { }

    const todo = [];
    for (const f of files) { const h = await sha256(f); if (!state[h]) todo.push({ f, h }); }
    if (!todo.length) return result;

    const { initializeFirebase } = require('../../resources/app/firebase-admin-config.js');
    const admin = require('../../resources/app/node_modules/firebase-admin');
    const Processor = require('../../resources/app/www/manual-pdf-processor.js');
    const db = await quietly(() => initializeFirebase());
    const proc = new Processor(db, adminCalls(admin));
    const products = (await db.collection('products').get()).docs.map(d => ({ _id: d.id, ...d.data() }));
    const sales = (await db.collection('storeSales').get()).docs.map(d => ({ id: d.id, ...d.data() }));

    for (const { f, h } of todo) {
        const file = relative(dest, f);
        const text = await invoiceText(f);
        const read = await quietly(() => proc.extractAlbanianInvoiceFromText(text, {}));
        const why = [];
        let d = null;
        if (!read.success) why.push(/conversion rate/i.test(read.error || '') ? 'invoice in lek: needs the day’s exchange rate' : (read.error || 'could not be read'));
        else {
            d = read.data;
            // E-invoices print a company's name in quotes ("ABC" SHPK); the customer is ABC.
            if (d.customerName) d.customerName = String(d.customerName).replace(/["“”„«»]/g, '').replace(/\s+/g, ' ').trim() || d.customerName;
            d.items = (d.items || []).map(it => {
                const name = cleanItemName(it.itemName || it.name);
                const p = findBestProductMatch(products, name);
                return { ...it, itemName: name || it.itemName, productId: p ? p._id : undefined, linkedProductName: p ? p.name : undefined, matchedBy: p ? 'auto' : null };
            });
            const dup = sales.find(s => short(saleNo(s)) === short(d.invoiceNumber) && (s.type === 'manual-invoice' || Math.abs((Number(s.total) || 0) - (Number(d.total) || 0)) < 0.06));
            if (dup) {
                result.already.push({ invoiceNumber: d.invoiceNumber, saleId: dup.id });
                if (!dry) { state[h] = 'already'; await db.collection('salesImports').doc(h.slice(0, 20)).set(clean({ status: 'already', invoiceNumber: d.invoiceNumber, customerName: d.customerName, total: d.total, file, saleId: dup.id, at: new Date().toISOString() })); }
                continue;
            }
            const unlinked = d.items.filter(i => !i.productId).map(i => i.itemName);
            if (!d.items.length) why.push('no lines read');
            if (unlinked.length) why.push(`not matched to a product: ${unlinked.join(', ')}`);
            const lines = d.items.reduce((s, i) => s + (Number(i.lineTotal) || 0), 0);
            if (Math.abs(lines - (Number(d.subtotal) || 0)) > 0.05) why.push(`lines add up to €${lines.toFixed(2)}, the subtotal says €${Number(d.subtotal || 0).toFixed(2)}`);
            if (!String(d.customerName || '').trim()) why.push('no buyer read');
            if (!(Number(d.total) > 0)) why.push('no total read');
        }
        const record = { invoiceNumber: d?.invoiceNumber || '', date: d?.date || basename(f).slice(0, 10), customerName: d?.customerName || '', customerNipt: d?.customerNipt || '',
            total: Number(d?.total) || 0, file, at: new Date().toISOString(), confidence: read.confidence || 0 };
        if (why.length) {
            result.review.push({ ...record, reason: why.join('; ') });
            if (!dry) { state[h] = 'review'; await db.collection('salesImports').doc(h.slice(0, 20)).set(clean({ ...record, status: 'needs-review', reason: why.join('; '), data: d })); }
            continue;
        }
        if (dry) { result.added.push({ ...record, items: d.items.map(i => `${i.quantity} × ${i.linkedProductName} @ ${i.pricePerUnit}`) }); continue; }
        const saved = await quietly(() => proc.saveToDatabase({ ...d, confidence: read.confidence || 0 }));
        if (saved && saved.success) {
            // The processor stamps a sale with the moment it is saved, which is right when the owner
            // imports by hand on the day. This runs days later (Monday), so the sale gets the
            // invoice's own day - at noon, as the e-invoice carries no time - or a 30 Sep invoice
            // filed on 6 Oct would count in October.
            const day = invoiceDay(d.date);
            if (day && day.getTime() < new Date().setHours(0, 0, 0, 0))
                await db.collection('storeSales').doc(saved.saleId).update({ timestamp: admin.firestore.Timestamp.fromDate(day) });
            result.added.push({ ...record, saleId: saved.saleId });
            state[h] = 'imported';
            await db.collection('salesImports').doc(h.slice(0, 20)).set(clean({ ...record, status: 'imported', saleId: saved.saleId, customerId: saved.customerId || null }));
            log(`sale added: invoice ${record.invoiceNumber} ${record.customerName} €${record.total}`);
        } else {
            result.review.push({ ...record, reason: `saving failed: ${saved?.error || 'unknown'}` });
            state[h] = 'review';
            await db.collection('salesImports').doc(h.slice(0, 20)).set(clean({ ...record, status: 'needs-review', reason: `saving failed: ${saved?.error || 'unknown'}`, data: d }));
        }
    }
    if (!dry) writeFileSync(statePath, JSON.stringify(state));
    return result;
}
