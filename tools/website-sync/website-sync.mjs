// Website sync: Danfosal App <-> danfosal.com (AI Commerce Manager), once a day in the morning.
//
// 1. Sends AI Commerce the shop's products: code, name, stock, price, landed cost (net of VAT),
//    units sold in 90 days and units on order. AI Commerce compares them with the website and
//    shows what differs (stock, price, margin); fixes there are plans the owner confirms.
// 2. Reads the website's prices. When a website price differs from Danfosal's and the website
//    price is new (a discount, a change), it writes a proposal to `websitePriceProposals`.
//    Danfosal App asks the owner (Today and Stock > Website): Accept sets the product's price,
//    Ignore keeps it. Nothing here changes a price by itself.
// 3. Copies new website orders into `onlineOrders` (source "Web", wooOrderId), so they count in
//    sales and customers. They do not take stock: stockDeducted is false, and the order offers
//    "Take from stock" like any older order. An order the owner already typed in by hand is linked,
//    not copied twice.
// 4. Writes `websiteSync/status` (when, what happened, any error) for the app to show.
//
// Every request to the website is signed (HMAC-SHA256 of "<time>\n<body>") with the secret made in
// AI Commerce > Cilësimet. No Danfosal key ever goes to the web server.
//
//   node website-sync.mjs --dry-run     read everything, report, change nothing anywhere
//   node website-sync.mjs --push-only   only send the products to AI Commerce (no Firestore writes)
//   node website-sync.mjs               the daily run
//   node website-sync.mjs --daily       the same, skipped if today's run already succeeded
//
// Settings: website-sync.local.json next to this file (git-ignored): { "url": ".../sync.php",
// "secret": "<64 hex>" }. Reports: C:\Danfosal\Reports\website-sync\ (they name customers; this
// repo is public).

import { createHmac } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const PUSH_ONLY = args.has('--push-only');
const DAILY = args.has('--daily');          // the scheduled task: only the first good run of the day
const VAT = 1.2;
const DAY = 86400000;
const SALES_WINDOW_DAYS = 90;
const ORDER_WINDOW_DAYS = 45;          // website orders read back this far (status changes included)
const PRICE_TOLERANCE = 0.5;           // euros: rounding is not a price change
const REPORTS = 'C:\\Danfosal\\Reports\\website-sync';

const STATUS_MAP = {
    pending: 'Pending', 'on-hold': 'Pending', processing: 'Processing', completed: 'Paid',
    cancelled: 'Cancelled', failed: 'Cancelled', refunded: 'Returned'
};

const r2 = n => Math.round(n * 100) / 100;
const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const digits = s => String(s || '').replace(/\D+/g, '').slice(-8);
const toMs = t => t == null || t === '' ? NaN : typeof t.toMillis === 'function' ? t.toMillis() : typeof t.seconds === 'number' ? t.seconds * 1000 : typeof t === 'number' ? (t < 1e12 ? t * 1000 : t) : new Date(t).getTime();

let logFile = null;
function log(line) {
    console.log(line);
    if (logFile) try { appendFileSync(logFile, line + '\n'); } catch { }
}

function settings() {
    const path = join(here, 'website-sync.local.json');
    if (!existsSync(path)) throw new Error(`Settings missing: ${path} (see README.md)`);
    const s = JSON.parse(readFileSync(path, 'utf8'));
    if (!/^https?:\/\/.+\/sync\.php$/.test(s.url || '')) throw new Error('website-sync.local.json: "url" must end in /sync.php');
    if (!/^https:\/\//.test(s.url) && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(s.url)) throw new Error('The sync address must use https://');
    if (!/^[0-9a-f]{64}$/.test(s.secret || '')) throw new Error('website-sync.local.json: "secret" must be the 64-character key from AI Commerce > Cilësimet');
    return s;
}

async function website(s, payload) {
    const body = JSON.stringify(payload);
    const time = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', s.secret).update(`${time}\n${body}`).digest('hex');
    const response = await fetch(s.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Danfos-Time': time, 'X-Danfos-Signature': signature },
        body,
        signal: AbortSignal.timeout(120000)
    });
    const data = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
    if (!response.ok || !data.ok) throw new Error(`${payload.action}: ${data.error || 'HTTP ' + response.status}`);
    return data.data;
}

// ------------------------------------------------------------------ Danfosal side

const productNetCost = p => Number(p.baseCost) > 0 ? Number(p.baseCost) : Number(p.cost) > 0 ? Number(p.cost) / VAT : null;
const lineProductId = (item, ids) => (item.costProductId && ids.has(item.costProductId)) ? item.costProductId : (item.productId && ids.has(item.productId)) ? item.productId : (item.id && ids.has(item.id)) ? item.id : null;
// A product without a code is still linkable: by its Danfosal id.
const codeOf = p => String(p.code || '').trim() || `id:${p._id}`;

async function readDanfosal(db) {
    const all = async name => (await db.collection(name).get()).docs.map(d => ({ _id: d.id, ...d.data() }));
    const [products, sales, orders, toOrder] = await Promise.all([all('products'), all('storeSales'), all('onlineOrders'), all('toOrder')]);
    return { products, sales, orders, toOrder };
}

function snapshotFrom({ products, sales, orders, toOrder }) {
    const ids = new Set(products.map(p => p._id));
    const since = Date.now() - SALES_WINDOW_DAYS * DAY;
    const sold = {};
    const count = (list, timeOf, keep = () => true) => list.forEach(rec => {
        if (!keep(rec) || !(timeOf(rec) >= since)) return;
        (rec.items || []).forEach(item => {
            const pid = lineProductId(item, ids);
            if (pid) sold[pid] = (sold[pid] || 0) + (Number(item.quantity) || 1);
        });
    });
    count(sales, s => toMs(s.timestamp) || toMs(s.date));
    count(orders, o => toMs(o.timestamp) || toMs(o.orderDate), o => o.status !== 'Returned' && o.status !== 'Cancelled');

    const incoming = {};
    const byName = new Map(products.map(p => [fold(p.name), p]));
    toOrder.forEach(l => {
        const left = Math.max(0, (Number(l.quantity) || 0) - (Number(l.quantityReceived) || 0));
        const p = byName.get(fold(l.name));
        if (left > 0 && p) incoming[p._id] = (incoming[p._id] || 0) + left;
    });

    return products.filter(p => String(p.name || '').trim()).map(p => {
        const cost = productNetCost(p);
        return {
            code: codeOf(p),
            name: String(p.name).trim(),
            stock: Math.round(Number(p.stock) || 0),
            price: Number(p.price) > 0 ? r2(Number(p.price)) : null,
            cost_net: cost ? r2(cost) : null,
            sold_90: sold[p._id] || 0,
            incoming: incoming[p._id] || 0
        };
    });
}

// ------------------------------------------------------------------ price proposals

function priceProposals(catalogue, products, existing, lastSeen) {
    const byCode = new Map(products.map(p => [fold(codeOf(p)), p]));
    const out = { create: [], resolve: [], shared: [], shopMoved: [] };
    // Two website products linked to one shop product (a wrong link in AI Commerce) would take
    // turns writing the same proposal every morning. Leave that product out and say so instead.
    const uses = new Map();
    catalogue.forEach(w => { if (w.code) uses.set(fold(w.code), [...(uses.get(fold(w.code)) || []), w.name]); });
    uses.forEach((names, code) => { if (names.length > 1) out.shared.push({ code, names }); });
    for (const w of catalogue) {
        if (!w.code || w.price == null) continue;
        if ((uses.get(fold(w.code)) || []).length > 1) continue;
        const p = byCode.get(fold(w.code));
        if (!p) continue;
        const shopPrice = Number(p.price) || 0;
        const webPrice = Number(w.price);
        const current = existing.get(p._id);
        if (Math.abs(webPrice - shopPrice) <= PRICE_TOLERANCE) {
            if (current && current.status === 'pending') out.resolve.push(p._id);
            continue;
        }
        // Already asked about this exact website price: pending stays, ignored stays ignored.
        if (current && Math.abs(Number(current.websitePrice) - webPrice) <= PRICE_TOLERANCE && current.status !== 'resolved' && current.status !== 'accepted') continue;
        const seen = lastSeen[String(w.id)];
        // The website still has the price it had at the last run, so it is the shop's price that
        // moved (Stock › Prices, a delivery, the catalogue). That is a fix for the website - AI
        // Commerce › Produktet shows the difference - not a question for the shop.
        if (seen != null && Math.abs(Number(seen) - webPrice) <= PRICE_TOLERANCE) { out.shopMoved.push({ name: p.name, shopPrice, webPrice }); continue; }
        out.create.push({
            id: p._id,
            data: {
                productId: p._id, code: codeOf(p), name: p.name, wooId: w.id, websiteName: w.name, permalink: w.permalink || '',
                shopPrice, websitePrice: webPrice, regularPrice: w.regular_price, salePrice: w.sale_price, onSale: w.sale_price != null && w.sale_price > 0,
                previousWebsitePrice: seen == null ? null : Number(seen),
                status: 'pending', createdAt: new Date(), updatedAt: new Date()
            }
        });
    }
    return out;
}

// ------------------------------------------------------------------ website orders

function orderImports(webOrders, danfosalOrders, products) {
    const byCode = new Map(products.map(p => [fold(codeOf(p)), p]));
    const byWooId = new Map(danfosalOrders.filter(o => o.wooOrderId).map(o => [Number(o.wooOrderId), o]));
    const handTyped = danfosalOrders.filter(o => !o.wooOrderId);
    const plan = { create: [], update: [], link: [] };
    for (const w of webOrders) {
        const status = STATUS_MAP[w.status];
        if (!status) continue;                                       // checkout drafts and the like
        const known = byWooId.get(Number(w.id));
        if (known) {
            if (known.wooStatus !== w.status) plan.update.push({ id: known._id, from: known.status, status, wooStatus: w.status, number: w.number, log: Array.isArray(known.activityLog) ? known.activityLog : [] });
            continue;
        }
        const t = new Date(w.date_created).getTime();
        const same = handTyped.find(o => {
            const ot = toMs(o.timestamp) || toMs(o.orderDate);
            const nameMatch = fold(o.clientName || o.customerName) === fold(w.customer_name);
            const phoneMatch = digits(w.phone) && digits(o.telephone || o.phoneNumber) === digits(w.phone);
            return (nameMatch || phoneMatch) && Math.abs(ot - t) < 4 * DAY;
        });
        if (same) { plan.link.push({ id: same._id, wooOrderId: w.id, wooStatus: w.status, number: w.number }); continue; }
        const items = (w.items || []).map(i => {
            const p = i.code ? byCode.get(fold(i.code)) : null;
            const quantity = Number(i.quantity) || 1;
            return { name: p ? p.name : i.name, quantity, price: r2((Number(i.total) || 0) / quantity), ...(p ? { id: p._id, productId: p._id } : {}) };
        });
        plan.create.push({
            id: `web-${w.id}`,
            data: {
                clientName: w.customer_name || `Porosi web #${w.number}`, telephone: w.phone || '', address: w.address || '', city: w.city || '',
                items, shippingFee: r2(Number(w.shipping_total) || 0), price: r2(items.reduce((a, i) => a + i.price * i.quantity, 0)),
                total: r2(Number(w.total) || 0), status, source: 'Web', note: w.customer_note || '', paymentMethod: w.payment_method_title || '',
                timestamp: new Date(t), activityLog: [{ status, timestamp: new Date(t) }],
                wooOrderId: w.id, wooNumber: w.number, wooStatus: w.status, importedFrom: 'website', importedAt: new Date(),
                stockDeducted: false
            }
        });
    }
    return plan;
}

// ------------------------------------------------------------------ run

async function main() {
    try { mkdirSync(REPORTS, { recursive: true }); logFile = join(REPORTS, 'website-sync.log'); } catch { }
    const started = new Date();
    const today = started.toLocaleDateString('sv-SE');           // YYYY-MM-DD, local time
    const doneFile = join(REPORTS, 'last-success.txt');
    if (DAILY && existsSync(doneFile) && readFileSync(doneFile, 'utf8').trim() === today) return;
    // One run at a time: the 07:30 trigger and the logon trigger can fire together (17 Oct 2026).
    // A lock older than 15 minutes is left over from a crashed run and is taken over.
    const lockFile = join(REPORTS, 'running.lock');
    if (existsSync(lockFile) && Date.now() - statSync(lockFile).mtimeMs < 15 * 60000) return;
    try { writeFileSync(lockFile, String(process.pid)); } catch { }
    process.on('exit', () => { try { unlinkSync(lockFile); } catch { } });
    log(`\n=== ${started.toISOString()} ${DRY ? '(dry run)' : PUSH_ONLY ? '(push only)' : ''}`);
    const s = settings();
    const { initializeFirebase } = require('../../resources/app/firebase-admin-config.js');
    const db = initializeFirebase();
    // The AI Commerce panel lives next to sync.php: Danfosal App links to it from Stock > Website.
    const status = { lastRunAt: started, ok: false, dryRun: DRY, panelUrl: s.url.replace(/sync\.php$/, 'index.php') };
    try {
        const danfosal = await readDanfosal(db);
        const snapshot = snapshotFrom(danfosal);
        log(`Danfosal: ${snapshot.length} products, ${snapshot.filter(p => p.cost_net).length} with a cost, ${snapshot.filter(p => p.incoming).length} on order`);

        if (!DRY) {
            const pushed = await website(s, { action: 'push_snapshot', generated_at: started.toISOString(), products: snapshot });
            const sum = pushed.summary || {};
            log(`Sent to AI Commerce. Website: ${sum.products ?? '?'} products, ${sum.linked ?? '?'} linked, ${sum.stock_off ?? '?'} stock differences, ${sum.price_off ?? '?'} price differences, ${sum.below_cost ?? '?'} below cost`);
            status.website = sum;
        }
        if (PUSH_ONLY) { log('Push only: nothing written to Firestore.'); return; }

        const catalogue = (await website(s, { action: 'website_catalogue' })).products || [];
        const after = new Date(Date.now() - ORDER_WINDOW_DAYS * DAY).toISOString();
        const webOrders = (await website(s, { action: 'website_orders', after })).orders || [];
        log(`Website: ${catalogue.length} products (${catalogue.filter(c => c.code).length} linked), ${webOrders.length} orders since ${after.slice(0, 10)}`);

        const stateRef = db.collection('websiteSync').doc('state');
        const state = (await stateRef.get()).data() || {};
        const existing = new Map((await db.collection('websitePriceProposals').get()).docs.map(d => [d.id, d.data()]));
        const prices = priceProposals(catalogue, danfosal.products, existing, state.websitePrices || {});
        const orders = orderImports(webOrders, danfosal.orders, danfosal.products);
        prices.create.forEach(p => log(`  price: ${p.data.name}: shop ${p.data.shopPrice} € -> website ${p.data.websitePrice} €${p.data.onSale ? ' (offer)' : ''}`));
        prices.shared.forEach(x => log(`  CHECK LINKS in AI Commerce: ${x.names.join(' and ')} are linked to the same shop product; no price question for them until one is fixed`));
        prices.shopMoved.forEach(x => log(`  shop price changed: ${x.name}: shop ${x.shopPrice} €, website still ${x.webPrice} € (update it in AI Commerce › Produktet)`));
        orders.create.forEach(o => log(`  new order #${o.data.wooNumber}: ${o.data.items.length} item(s), ${o.data.total} €, ${o.data.status}`));
        orders.update.forEach(o => log(`  order #${o.number}: ${o.from} -> ${o.status}`));
        orders.link.forEach(o => log(`  order #${o.number} was already typed in: linked`));
        log(`Proposals: ${prices.create.length} new, ${prices.resolve.length} resolved. Orders: ${orders.create.length} new, ${orders.update.length} updated, ${orders.link.length} linked.`);

        if (DRY) { log('Dry run: nothing sent, nothing written.'); return; }

        const batch = db.batch();
        prices.create.forEach(p => batch.set(db.collection('websitePriceProposals').doc(p.id), p.data));
        prices.resolve.forEach(id => batch.set(db.collection('websitePriceProposals').doc(id), { status: 'resolved', updatedAt: new Date() }, { merge: true }));
        orders.create.forEach(o => batch.create(db.collection('onlineOrders').doc(o.id), o.data));
        orders.update.forEach(o => batch.update(db.collection('onlineOrders').doc(o.id), {
            status: o.status, wooStatus: o.wooStatus,
            activityLog: [...o.log, { status: o.status, timestamp: new Date(), by: 'website' }]
        }));
        orders.link.forEach(o => batch.set(db.collection('onlineOrders').doc(o.id), { wooOrderId: o.wooOrderId, wooStatus: o.wooStatus }, { merge: true }));
        batch.set(stateRef, { websitePrices: Object.fromEntries(catalogue.filter(c => c.price != null).map(c => [String(c.id), c.price])), updatedAt: new Date() });
        await batch.commit();

        Object.assign(status, {
            ok: true, proposalsNew: prices.create.length, proposalsResolved: prices.resolve.length,
            sharedLinks: prices.shared.map(x => x.names.join(' + ')), shopPricesMoved: prices.shopMoved.length,
            ordersNew: orders.create.length, ordersUpdated: orders.update.length, ordersLinked: orders.link.length,
            finishedAt: new Date()
        });
        try { writeFileSync(doneFile, today); } catch { }
        log('Done.');
    } catch (error) {
        status.error = String(error.message || error).slice(0, 500);
        log(`FAILED: ${status.error}`);
        process.exitCode = 1;
    } finally {
        if (!DRY && !PUSH_ONLY) await db.collection('websiteSync').doc('status').set(status).catch(e => log(`Could not write the status: ${e.message}`));
        // Close the connection so Node ends by itself (process.exit while sockets close crashes Node on Windows).
        await db.terminate().catch(() => { });
    }
}

main().catch(error => { log(`FAILED: ${error.message}`); process.exitCode = 1; });
