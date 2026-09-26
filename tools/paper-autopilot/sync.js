// Putting the purchase paperwork where the app can see it.
//
// Reads every filed purchasing document in the archive (Kärcher orders, invoices, credit notes and
// statements, customs declarations, payments to suppliers and customs) and writes what it says to
// Firestore `purchaseDocs`, one document per paper, keyed by the file's SHA-256. The app links
// them (www/app/purchasing.js). A file already synced is skipped; nothing is ever deleted.
//
// A new order - one that arrived in the last 60 days and has no invoice yet - also goes onto the
// order list (`toOrder`), line by line with its order number, so Stock > Order list shows it
// waiting and, once paid, prepaid. Older orders are left for the owner to add from Purchases.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { sha256 } from './plan.js';
import { pdfLines } from './pdftext.js';
import * as R from './purchase-read.js';

const require = createRequire(import.meta.url);
const NEW_ORDER_DAYS = 60;

// Where the filer puts each kind of paper, and which reader reads it.
const PLACES = [
    ['Kärcher/Orders', f => /proforma/i.test(f) ? R.readKarcherProforma : R.readKarcherOrderConfirmation],
    ['Kärcher/Invoices', () => R.readKarcherInvoice],
    ['Kärcher/Credit notes', () => R.readKarcherCreditNote],
    ['Customs', f => /Customs declaration/i.test(f) ? R.readCustoms : null],
    ['Bank/Payments', () => R.readPayment]
];
const walk = d => existsSync(d) ? readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; }) : [];
const clean = o => JSON.parse(JSON.stringify(o));      // Firestore refuses undefined; NaN becomes null

// resync: read every paper again and rewrite its record (after a reader got better). Records are
// keyed by the file's hash, so this overwrites, never duplicates.
export async function syncPurchases({ dest, downloads, out, resync = false, log = () => {} }) {
    const statePath = join(out, 'purchases-sync.json');
    let state = { synced: {} };
    try { if (!resync) state = JSON.parse(readFileSync(statePath, 'utf8')); } catch { }

    const { initializeFirebase } = require('../../resources/app/firebase-admin-config.js');
    const db = initializeFirebase();

    // 1. The papers not synced yet.
    const jobs = [];
    for (const [place, pick] of PLACES) for (const f of walk(join(dest, place)).filter(f => /\.pdf$/i.test(f))) jobs.push({ f, read: pick(f) });
    const statements = [...walk(join(dest, 'Kärcher/Statements')), ...readdirSync(downloads).map(n => join(downloads, n))]
        .filter(f => /\.xlsx$/i.test(f) && /balance|statement|kartel/i.test(f));
    const fresh = [];
    for (const job of [...jobs, ...statements.map(f => ({ f, statement: true }))]) {
        if (!job.statement && !job.read) continue;
        const hash = await sha256(job.f);
        const where = job.f.startsWith(dest) ? relative(dest, job.f) : job.f;
        if (state.synced[hash]) {
            // Same paper, new place (the statement filed out of Downloads): keep its location current.
            const was = state.synced[hash];
            if (was.kind !== 'none' && was.file !== where) {
                await db.collection('purchaseDocs').doc(hash.slice(0, 20)).set({ file: where }, { merge: true });
                was.file = where;
            }
            continue;
        }
        let rec = null;
        try {
            if (job.statement) {
                rec = await R.readKarcherStatement(job.f);
                const d = job.f.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);          // "balance cart 30.07.2026"
                if (rec && d) rec.date = `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`;
            } else rec = job.read((await pdfLines(job.f, { maxPages: 60 })).lines);
        } catch (e) { log(`  could not read ${job.f}: ${e.message}`); continue; }
        state.synced[hash] = { kind: rec ? rec.kind : 'none', file: where };
        if (!rec) continue;
        const id = hash.slice(0, 20);
        await db.collection('purchaseDocs').doc(id).set(clean({ ...rec, file: where, sha256: hash, syncedAt: new Date().toISOString() }));
        fresh.push({ id, ...rec });
    }
    writeFileSync(statePath, JSON.stringify(state));

    // 2. New orders onto the order list.
    const added = await orderLinesFor(db, fresh.filter(r => r.kind === 'order'), log);
    return { synced: fresh.length, byKind: fresh.reduce((m, r) => (m[r.kind] = (m[r.kind] || 0) + 1, m), {}), orderLines: added };
}

async function orderLinesFor(db, orders, log) {
    if (!orders.length) return 0;
    const cutoff = new Date(Date.now() - NEW_ORDER_DAYS * 86400000).toISOString().slice(0, 10);
    const all = (await db.collection('purchaseDocs').get()).docs.map(d => d.data());
    const invoicedOrders = new Set(all.flatMap(d => d.kind === 'invoice' ? d.orderNos || [] : d.kind === 'statement' ? (d.lines || []).filter(l => l.type === 'RV').map(l => l.orderNo) : []));
    const onList = new Set((await db.collection('toOrder').get()).docs.map(d => d.data().orderNo).filter(Boolean));
    const products = (await db.collection('products').get()).docs.map(d => ({ _id: d.id, ...d.data() }));
    const norm = c => String(c || '').replace(/[.\-\s]/g, '');
    let added = 0;
    const seen = new Set();
    for (const o of orders.filter(o => o.orderNo && o.date >= cutoff && o.items.length).sort((a, b) => b.items.length - a.items.length)) {
        if (seen.has(o.orderNo) || onList.has(o.orderNo) || invoicedOrders.has(o.orderNo)) continue;
        seen.add(o.orderNo);
        const batch = db.batch();
        for (const it of o.items) {
            const p = products.find(x => x.code && norm(x.code) === norm(it.code));
            batch.set(db.collection('toOrder').doc(), clean({ name: p ? p.name : it.name, code: it.code, quantity: it.qty, supplier: 'Karcher', quantityReceived: 0,
                smartSuggestion: false, estimatedCost: Math.round(it.total * 100) / 100, addedAt: Date.now(), orderNo: o.orderNo, orderSource: o.source, productId: p ? p._id : null }));
            added++;
        }
        await batch.commit();
        log(`  order ${o.orderNo} (${o.date}) put on the order list: ${o.items.length} line(s)`);
    }
    return added;
}
