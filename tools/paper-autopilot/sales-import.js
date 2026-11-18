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
//
// E-invoices made in easyPOS ("Faturë Elektronike", filed as "<date> Invoice <number> ...") go the
// same way, read by easypos-invoice.js: the app's text builder runs that layout's words together.
// Their lines are matched by item code first, then by name. One in lek is put in euros at
// easyPOS's own rate, the "Kursi" on the newest till receipt the EasyPOS bridge recorded up to the
// invoice's day; a rate more than a week older than the invoice sends it for a look. easyPOS's
// till receipts ("Faturë Tatimore") are the bridge's, which records them from the till's print.
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, relative, basename, resolve } from 'node:path';
import { sha256 } from './plan.js';
import { pdfjs, pdfLines } from './pdftext.js';
import { readEasyPOSInvoice, saleData } from './easypos-invoice.js';
import { textItemsToLines, pageText, cleanItemName, findBestProductMatch } from '../../resources/app/www/app/invoice-text.js';
import { prepaymentKind, prepareItems, prepaymentRefs, linkAfterSave } from '../../resources/app/www/app/prepayment.js';

const require = createRequire(import.meta.url);
export const SALES_FROM = '2026-10-01';
const RATE_DAYS = 7;

const walk = d => existsSync(d) ? readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; }) : [];
const isEasyPOS = f => /^\d{4}-\d{2}-\d{2} Invoice /i.test(basename(f));
const ms = t => t && t.toMillis ? t.toMillis() : Number(t) || Date.parse(t) || 0;
const day10 = t => new Date(t).toISOString().slice(0, 10);
const codeKey = s => String(s || '').toLowerCase().replace(/[^0-9a-z]/g, '');
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

// The same rule as the app's lineNetCost (www/app/data.js), which can't be imported under Node.
const netCostOf = i => i.isService ? 0 : i.isPrepaymentDeduction ? (i.netCost == null || isNaN(Number(i.netCost)) ? null : Number(i.netCost))
    : Number(i.netCost) > 0 ? Number(i.netCost) : Number(i.cost) > 0 ? Number(i.cost) / 1.2 : null;

// easyPOS's lek rate on a day: the "Kursi" on the newest till receipt the bridge recorded up to
// the end of that day. null when no recorded receipt carries one.
export function tillRate(sales, day) {
    const end = new Date(day).setHours(24, 0, 0, 0);
    let best = null;
    for (const s of sales) {
        const rate = Number(s.easypos && s.easypos.lekPerEur), t = ms(s.timestamp);
        if (rate > 1 && t && t < end && (!best || t > best.t)) best = { rate, t };
    }
    return best;
}

// An easyPOS e-invoice as the processor's reader would give it: { success, data | error }, with
// the rate used and anything about it a person should check.
function easyPOSRead(inv, sales) {
    if (inv.currency === 'ALL') {
        const day = invoiceDay(inv.date) || new Date(), till = tillRate(sales, day);
        if (!till) return { success: false, error: 'invoice in lek: needs the day’s exchange rate (no till receipt with a rate yet)' };
        const data = saleData(inv, till.rate);
        if (!data) return { success: false, error: 'no total read' };
        const old = day.getTime() - till.t > RATE_DAYS * 86400000;
        return { success: true, data, confidence: 1, rate: till.rate, rateFrom: day10(till.t),
            notes: old ? [`invoice in lek: converted at ${till.rate}, the till’s newest rate, from ${day10(till.t)}: check it`] : [] };
    }
    const data = saleData(inv);
    return data ? { success: true, data, confidence: 1 } : { success: false, error: inv.currency && inv.currency !== 'EUR' ? `invoice in ${inv.currency}` : 'no total read' };
}

// include: older e-invoices the owner asked for by name (a prepayment from before SALES_FROM).
export async function importSales({ dest, out, dry = false, log = () => {}, include = [] }) {
    const result = { added: [], review: [], already: [] };
    const wanted = new Set(include.map(p => resolve(dest, p).toLowerCase()));
    // Oldest first, so a prepayment is in Sales before the final invoice that deducts it.
    const files = walk(join(dest, 'Sales invoices')).filter(f => (/E-invoice/i.test(basename(f)) || isEasyPOS(f)) && (basename(f).slice(0, 10) >= SALES_FROM || wanted.has(resolve(f).toLowerCase())))
        .sort((a, b) => basename(a).localeCompare(basename(b)));
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
        let text, read;
        if (isEasyPOS(f)) {
            const { lines } = await pdfLines(f, { maxPages: 10 });
            const inv = readEasyPOSInvoice(lines);
            // A till receipt is the bridge's; a credit note is recorded by hand, as the platform's
            // are. Neither is a new sale, and the paper isn't read again.
            if (inv.kind !== 'e-invoice' || inv.docType === '381') { if (!dry) state[h] = inv.kind === 'e-invoice' ? 'credit-note' : inv.kind || 'not-easypos'; continue; }
            text = lines.join('\n');
            read = easyPOSRead(inv, sales);
        } else {
            text = await invoiceText(f);
            read = await quietly(() => proc.extractAlbanianInvoiceFromText(text, {}));
        }
        const why = [...(read.notes || [])];
        let d = null, kind = null;
        if (!read.success) why.push(/conversion rate/i.test(read.error || '') ? 'invoice in lek: needs the day’s exchange rate' : (read.error || 'could not be read'));
        else {
            d = read.data;
            // E-invoices print a company's name in quotes ("ABC" SHPK); the customer is ABC.
            if (d.customerName) d.customerName = String(d.customerName).replace(/["“”„«»]/g, '').replace(/\s+/g, ' ').trim() || d.customerName;
            d.items = (d.items || []).map(it => {
                const name = cleanItemName(it.itemName || it.name);
                // easyPOS prints each line's item code: an exact catalogue code beats a name match.
                const p = (codeKey(it.code).length >= 3 && products.find(x => codeKey(x.code) === codeKey(it.code))) || findBestProductMatch(products, name);
                return { ...it, itemName: name || it.itemName, productId: p ? p._id : undefined, linkedProductName: p ? p.name : undefined, matchedBy: p ? 'auto' : null };
            });
            // A prepayment, or a final invoice taking one off (prepayment.js): those lines are no
            // product and never touch stock; a final invoice waits until its prepayment is in Sales.
            kind = prepaymentKind(d, text);
            d = prepareItems(d, kind);
            if (kind === 'final') d.items.filter(i => i.noStock).flatMap(i => prepaymentRefs(i.itemName)).forEach(ref => {
                if (!sales.some(s => short(saleNo(s)) === ref && (s.prepayment || (s.items || []).some(x => x.isPrepayment))))
                    why.push(`it deducts prepayment ${ref}, which isn't in Sales`);
            });
            const dup = sales.find(s => short(saleNo(s)) === short(d.invoiceNumber) && (s.type === 'manual-invoice' || Math.abs((Number(s.total) || 0) - (Number(d.total) || 0)) < 0.06));
            if (dup) {
                result.already.push({ invoiceNumber: d.invoiceNumber, saleId: dup.id });
                if (!dry) { state[h] = 'already'; await db.collection('salesImports').doc(h.slice(0, 20)).set(clean({ status: 'already', invoiceNumber: d.invoiceNumber, customerName: d.customerName, total: d.total, file, saleId: dup.id, at: new Date().toISOString() })); }
                continue;
            }
            const unlinked = d.items.filter(i => !i.productId && !i.noStock).map(i => i.itemName);
            if (!d.items.length) why.push('no lines read');
            if (unlinked.length) why.push(`not matched to a product: ${unlinked.join(', ')}`);
            const lines = d.items.reduce((s, i) => s + (Number(i.lineTotal) || 0), 0);
            if (Math.abs(lines - (Number(d.subtotal) || 0)) > 0.05) why.push(`lines add up to €${lines.toFixed(2)}, the subtotal says €${Number(d.subtotal || 0).toFixed(2)}`);
            if (!String(d.customerName || '').trim()) why.push('no buyer read');
            if (!(Number(d.total) > 0)) why.push('no total read');
        }
        const record = { invoiceNumber: d?.invoiceNumber || '', date: d?.date || basename(f).slice(0, 10), customerName: d?.customerName || '', customerNipt: d?.customerNipt || '',
            total: Number(d?.total) || 0, file, at: new Date().toISOString(), confidence: read.confidence || 0, ...(kind ? { kind } : {}),
            ...(isEasyPOS(f) ? { from: 'easyPOS' } : {}), ...(read.rate ? { lekPerEur: read.rate, rateFrom: read.rateFrom } : {}) };
        if (why.length) {
            result.review.push({ ...record, reason: why.join('; ') });
            if (!dry) { state[h] = 'review'; await db.collection('salesImports').doc(h.slice(0, 20)).set(clean({ ...record, status: 'needs-review', reason: why.join('; '), data: d })); }
            continue;
        }
        if (dry) { result.added.push({ ...record, items: d.items.map(i => `${i.quantity} × ${i.noStock ? i.itemName + ' (no stock)' : i.linkedProductName} @ ${i.pricePerUnit}`) }); continue; }
        const saved = await quietly(() => proc.saveToDatabase({ ...d, confidence: read.confidence || 0 }));
        if (saved && saved.success) {
            // The processor stamps a sale with the moment it is saved, which is right when the owner
            // imports by hand on the day. This runs days later (Monday), so the sale gets the
            // invoice's own day - at noon, as the e-invoice carries no time - or a 30 Sep invoice
            // filed on 6 Oct would count in October.
            const day = invoiceDay(d.date);
            if (day && day.getTime() < new Date().setHours(0, 0, 0, 0))
                await db.collection('storeSales').doc(saved.saleId).update({ timestamp: admin.firestore.Timestamp.fromDate(day) });
            // Still "Manual PDF ...": the app reads that as line prices without VAT (data.js).
            if (isEasyPOS(f)) await db.collection('storeSales').doc(saved.saleId).update({ source: 'Manual PDF - easyPOS e-invoice' });
            // Tag the prepayment, or link the final invoice to its prepayment and share the cost.
            let link = null;
            if (kind) {
                const store = {
                    getSale: async id => { const x = await db.collection('storeSales').doc(id).get(); return x.exists ? { id: x.id, ...x.data() } : null; },
                    salesByInvoice: async no => (await db.collection('storeSales').where('invoiceNumber', '==', no).get()).docs.map(x => ({ id: x.id, ...x.data() })),
                    updateSale: (id, patch) => db.collection('storeSales').doc(id).update(clean(patch))
                };
                link = await linkAfterSave(store, saved.saleId, kind, { products, match: findBestProductMatch, netCostOf });
                if (kind === 'prepayment') sales.push({ id: saved.saleId, invoiceNumber: d.invoiceNumber, customerNipt: d.customerNipt, prepayment: { status: 'open' } });
            }
            result.added.push({ ...record, saleId: saved.saleId, ...(link ? { link } : {}) });
            state[h] = 'imported';
            await db.collection('salesImports').doc(h.slice(0, 20)).set(clean({ ...record, status: 'imported', saleId: saved.saleId, customerId: saved.customerId || null, ...(link ? { link } : {}) }));
            log(`sale added: invoice ${record.invoiceNumber} ${record.customerName} €${record.total}${read.rate ? ` (from lek at ${read.rate}, the till's rate of ${read.rateFrom})` : ''}`);
        } else {
            result.review.push({ ...record, reason: `saving failed: ${saved?.error || 'unknown'}` });
            state[h] = 'review';
            await db.collection('salesImports').doc(h.slice(0, 20)).set(clean({ ...record, status: 'needs-review', reason: `saving failed: ${saved?.error || 'unknown'}`, data: d }));
        }
    }
    if (!dry) writeFileSync(statePath, JSON.stringify(state));
    return result;
}
