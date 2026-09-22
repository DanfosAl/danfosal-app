// Stock > Receive delivery: read a supplier invoice, check it, and book it into stock in one go.
//
// Kärcher invoices (Karcher d.o.o., Zagreb) have a real text layer, so they are read exactly from
// the PDF - no OCR guessing. Other suppliers fall back to the classic scanner's reader
// (smart-inventory-scanner.js), with OCR for photos and scanned PDFs. Nothing is written until the
// owner has checked every line.
//
// Writes keep the classic shapes: each product gets {stock +n, baseCost, cost = baseCost x 1.2,
// batches: +{quantity, cost, date, supplier, invoice}, lastRestockDate}; new products get the
// classic product shape. Order-list lines for the same products are ticked off, and an invoice to
// pay later goes to Money > You owe. Everything except the You owe record is one atomic batch.
// Fixes the classic page's duplicate batches (the same invoice saved three times on one product):
// an invoice number that is already booked is refused unless the owner insists.
import { db, collection, doc, writeBatch, increment, arrayUnion } from './firebase.js';
import { esc, eur, int, icon, plural, day, fold, money2, toast, openModal } from './ui.js';
import { VAT, productNetCost, suggestProducts, rankProducts } from './data.js';
import { loadOrderLines, outstanding, productForLine } from './orderlist.js';
import { addSupplierInvoice } from './payables.js';

const r2 = n => Math.round(n * 100) / 100;
const num = s => Number(String(s).replace(/\./g, '').replace(',', '.'));     // "1.360,00" -> 1360
const normCode = c => String(c || '').toLowerCase().replace(/[.\-\s]/g, '');
const MARKUP = 1.4;   // classic rule for a new product's price: cost incl. VAT + 40%

// ------------------------------------------------------------------ reading the invoice

function loadScript(src, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.onload = () => resolve(window[globalName]); s.onerror = () => reject(new Error(`Couldn't load ${src.split('/').pop()}. Check the internet connection.`));
        document.head.appendChild(s);
    });
}
async function pdfjs() {
    const lib = await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
    lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    return lib;
}

// The PDF's own text, as lines in reading order (items grouped by their baseline).
async function pdfLines(file) {
    const lib = await pdfjs();
    const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const out = [];
    for (let p = 1; p <= pdf.numPages; p++) {
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
    return { lines: out.filter(Boolean), pdf };
}

// OCR for photos and scanned PDFs, through the classic scanner's Tesseract setup.
async function ocrText(file, pdf) {
    const T = await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js', 'Tesseract');
    const worker = await T.createWorker('eng');
    let text = '';
    try {
        if (pdf) {
            for (let p = 1; p <= pdf.numPages; p++) {
                const page = await pdf.getPage(p), vp = page.getViewport({ scale: 2.5 });
                const canvas = Object.assign(document.createElement('canvas'), { width: vp.width, height: vp.height });
                await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
                text += (await worker.recognize(canvas)).data.text + '\n';
            }
        } else text = (await worker.recognize(file)).data.text;
    } finally { await worker.terminate(); }
    return text;
}

// Kärcher d.o.o. invoice: "0001 1.512-600.0 SC 2 EasyFix *EU * 16 PC 85,00 1.360,00".
// Numbers after the unit are unit price, an optional discount %, and the line total; the unit
// cost is taken from the total, so a discount is always included.
export function parseKarcher(lines) {
    if (!lines.some(l => /k[aä]rcher d\.o\.o\./i.test(l))) return null;
    const inv = { supplier: 'Karcher', invoiceNumber: '', date: '', net: 0, prepayPct: 0, prepayAmount: 0, items: [], reader: 'Kärcher invoice (exact text)' };
    const head = lines.find(l => /^ALBANIA \d{10}\b/i.test(l)) || '';
    inv.invoiceNumber = (head.match(/\b(\d{10})\b/) || [])[1] || (lines[0].match(/^\d{10}$/) || [])[0] || '';
    const dateLine = lines.find(l => /^\d\d\.\d\d\.\d{4}\s+\d\d:\d\d/.test(l));
    if (dateLine) { const [d, m, y] = dateLine.slice(0, 10).split('.'); inv.date = `${y}-${m}-${d}`; }
    // Units seen on Kärcher invoices: PC, ZSA (set), M (metre), L, KG... A line with no prices is
    // a free replacement (warranty), booked at cost 0.
    const itemRe = /^(\d{4}) (\d\.\d{3}-\d{3}\.\d) (.+?) (?:[*P] )?(\d+(?:,\d+)?) ([A-Z]{1,4})(?:\s+([\d.,\s]+))?$/;
    lines.forEach(l => {
        const m = l.match(itemRe); if (!m) return;
        const nums = (m[6] || '').trim().split(/\s+/).filter(Boolean).map(num);
        const qty = num(m[4]), total = nums.length ? nums[nums.length - 1] : 0;
        inv.items.push({ pos: m[1], code: m[2], name: m[3].replace(/\s+\*$/, '').trim(), quantity: qty, unit: m[5], listPrice: nums[0] || 0,
            discount: nums.length > 2 ? nums[1] : 0, total, unitCost: qty ? r2(total / qty) : 0, free: !nums.length });
    });
    const netIdx = lines.findIndex(l => /Net Amount/.test(l));
    if (netIdx >= 0 && lines[netIdx + 1]) { const n = lines[netIdx + 1].split(/\s+/).map(num).filter(x => !isNaN(x)); if (n.length >= 2) inv.net = n[1]; }
    const pre = lines.find(l => /Prepayment\s+\d+%/.test(l));
    if (pre) { const m = pre.match(/Prepayment\s+(\d+(?:,\d+)?)%\s+([\d.,]+)/); if (m) { inv.prepayPct = num(m[1]); inv.prepayAmount = num(m[2]); } }
    if (!inv.net) inv.net = r2(inv.items.reduce((a, i) => a + i.total, 0));
    return inv.items.length ? inv : null;
}

async function genericParse(text, ctx) {
    await loadScript('smart-inventory-scanner.js', 'SmartInventoryScanner');
    const reader = Object.assign(Object.create(window.SmartInventoryScanner.prototype), {
        knownSuppliers: [...new Set(ctx.model.products.map(p => p.producer).filter(Boolean))], productsCache: ctx.model.products
    });
    const d = reader.extractSupplierInvoiceData(text);
    return {
        supplier: d.supplier || '', invoiceNumber: d.invoiceNumber || '', date: d.date || '', net: Number(d.totalAmount) || 0, prepayPct: 0, prepayAmount: 0,
        reader: 'general reader (check every line)',
        items: (d.items || []).map(i => ({ code: i.code || '', name: i.name || '', quantity: Number(i.quantity) || 1, unitCost: Number(i.unitPrice) || 0, total: (Number(i.unitPrice) || 0) * (Number(i.quantity) || 1) }))
    };
}

async function readInvoice(file, ctx, status) {
    const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
    let lines = [], pdf = null;
    if (isPdf) {
        status('Reading the PDF…');
        ({ lines, pdf } = await pdfLines(file));
        const k = parseKarcher(lines);
        if (k) return k;
    }
    const text = lines.join('\n');
    if (text.replace(/\s/g, '').length > 200) { status('Reading the invoice text…'); return genericParse(text, ctx); }
    status('No text layer: reading the image with OCR (this takes a little while)…');
    return genericParse(await ocrText(file, pdf), ctx);
}

// ------------------------------------------------------------------ matching and review

function matchLine(item, products) {
    const byCode = item.code && products.find(p => p.code && normCode(p.code) === normCode(item.code));
    if (byCode) return { product: byCode, how: 'code' };
    const exact = products.find(p => fold(p.name) === fold(item.name));
    if (exact) return { product: exact, how: 'name' };
    const guess = suggestProducts(products, item.name, 1)[0];
    return { product: null, guess: guess || null, how: 'none' };
}

const rcv = { invoice: null, lines: null, prepay: false, pay: 'paid', due: '', force: false, busy: false, status: '' };

export function renderReceive(ctx) {
    ctx.setSub('Book a supplier delivery into stock from its invoice');
    const actions = ctx.setActions(rcv.invoice ? `<button class="btn ghost" type="button" id="rc-reset">${icon('restart_alt')}Start again</button>` : '');
    const reset = actions.querySelector('#rc-reset');
    if (reset) reset.addEventListener('click', () => { Object.assign(rcv, { invoice: null, lines: null, prepay: false, pay: 'paid', due: '', force: false }); renderReceive(ctx); });
    if (!rcv.invoice) return renderPick(ctx);
    renderReview(ctx);
}

function renderPick(ctx) {
    ctx.body.innerHTML = `
        <label class="dropzone" id="rc-drop" tabindex="0">
            ${icon('upload_file')}
            <b>Drop the supplier invoice here, or click to choose it</b>
            <span>Kärcher PDF invoices are read exactly. Other suppliers and photos are read as well as possible; you check every line before anything is saved.</span>
            <input type="file" id="rc-file" accept="application/pdf,image/*" hidden>
        </label>
        <p class="empty" id="rc-status" style="margin:0">${esc(rcv.status || '')}</p>
        <div class="panel" style="padding:12px 16px;display:flex;align-items:center;gap:12px">${icon('edit_note')}<span style="flex:1" class="muted">No invoice file? Enter the delivery by hand.</span>
            <button class="btn" type="button" id="rc-manual">Enter manually</button></div>`;
    const drop = ctx.body.querySelector('#rc-drop'), input = ctx.body.querySelector('#rc-file'), status = ctx.body.querySelector('#rc-status');
    const take = async file => {
        if (!file || rcv.busy) return;
        rcv.busy = true; drop.classList.add('busy');
        try {
            const inv = await readInvoice(file, ctx, t => { status.textContent = t; });
            if (!inv.items.length) throw new Error('No product lines were found on this invoice. Enter the delivery manually instead.');
            await startReview(ctx, { ...inv, fileName: file.name });
        } catch (e) { status.innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`; }
        finally { rcv.busy = false; drop.classList.remove('busy'); }
    };
    drop.addEventListener('click', e => { if (e.target !== input) input.click(); });
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => take(input.files[0]));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); take(e.dataTransfer.files[0]); });
    ctx.body.querySelector('#rc-manual').addEventListener('click', () => startReview(ctx, { supplier: 'Karcher', invoiceNumber: '', date: new Date().toISOString().slice(0, 10), net: 0, prepayPct: 0, prepayAmount: 0, items: [], reader: 'entered by hand' }));
}

async function startReview(ctx, inv) {
    let orderLines = [];
    try { orderLines = (await loadOrderLines()).filter(l => outstanding(l) > 0); } catch { /* the order list is optional here */ }
    rcv.invoice = inv; rcv.orderLines = orderLines; rcv.force = false;
    rcv.prepay = false; rcv.pay = 'paid'; rcv.due = '';
    rcv.lines = inv.items.map(it => {
        const m = matchLine(it, ctx.model.products);
        return { ...it, product: m.product, how: m.how, guess: m.guess, action: m.product ? 'stock' : 'new', newName: it.name, newPrice: 0 };
    });
    renderReceive(ctx);
}

function lineCost(l) { return r2(l.unitCost * (rcv.prepay && rcv.invoice.prepayPct ? 1 - rcv.invoice.prepayPct / 100 : 1)); }

// Two guards against booking the same delivery twice:
// - exact: a product already has a purchase with this invoice number;
// - likely: a product on this invoice already received the same quantity within ~2 months of the
//   invoice date under another number (the classic OCR scanner saved misread numbers such as
//   "11265/U1/0003", so the number alone can't catch those).
function alreadyBooked(ctx) {
    const no = String(rcv.invoice.invoiceNumber || '').trim();
    const exact = no ? ctx.model.products.filter(p => (p.batches || []).some(b => String(b.invoice || '').trim() === no)) : [];
    const t = rcv.invoice.date ? new Date(rcv.invoice.date + 'T12:00').getTime() : NaN;
    const likely = [];
    if (!isNaN(t)) rcv.lines.filter(l => l.action === 'stock' && l.product && !exact.includes(l.product)).forEach(l => {
        const b = (l.product.batches || []).find(b => Number(b.quantity) === l.quantity && b.invoice !== 'LEGACY_STOCK'
            && Number(b.date) >= t - 3 * 86400000 && Number(b.date) <= t + 60 * 86400000);
        if (b) likely.push({ p: l.product, b });
    });
    return { exact, likely, any: exact.length + likely.length > 0 };
}

function renderReview(ctx) {
    const inv = rcv.invoice, lines = rcv.lines;
    const booked = alreadyBooked(ctx), dup = booked.exact;
    const units = lines.filter(l => l.action !== 'skip').reduce((a, l) => a + l.quantity, 0);
    const total = lines.filter(l => l.action !== 'skip').reduce((a, l) => a + lineCost(l) * l.quantity, 0);
    const toPay = rcv.prepay && inv.prepayAmount ? inv.prepayAmount : inv.net || total;
    const orderHit = l => { const p = l.action === 'stock' ? l.product : null; if (!p) return null; return rcv.orderLines.find(o => productForLine([p], o)); };
    const problems = [];
    if (!inv.supplier.trim()) problems.push('Enter the supplier.');
    if (!String(inv.invoiceNumber).trim()) problems.push('Enter the invoice number.');
    if (!lines.some(l => l.action !== 'skip')) problems.push('Add at least one line.');
    if (lines.some(l => l.action === 'stock' && !l.product)) problems.push('Pick a product for every line set to “Add to stock”.');
    if (lines.some(l => l.action === 'new' && !(l.newName || '').trim())) problems.push('Give every new product a name.');
    if (booked.any && !rcv.force) problems.push('This delivery looks already booked (see above).');
    const diff = inv.net && Math.abs(inv.net - lines.reduce((a, l) => a + l.unitCost * l.quantity, 0)) > 0.05;

    ctx.body.innerHTML = `
        ${booked.any ? `<div class="error-box" style="align-items:flex-start">${icon('content_copy')}<div style="flex:1">
            ${dup.length ? `<b>Invoice ${esc(inv.invoiceNumber)} is already booked</b> on ${plural(dup.length, 'product', 'products')}: ${dup.slice(0, 4).map(p => esc(p.name)).join(', ')}${dup.length > 4 ? '…' : ''}. Booking it again would add the same stock twice.` : ''}
            ${booked.likely.length ? `<b>This delivery looks already booked</b> under another invoice number: ${booked.likely.slice(0, 4).map(x => `${esc(x.p.name)} got ${int(x.b.quantity)} on ${esc(day(Number(x.b.date)))} (as “${esc(x.b.invoice || '?')}”)`).join('; ')}${booked.likely.length > 4 ? '…' : ''}.` : ''}
            <label class="check" style="margin-top:8px;background:transparent;padding:0"><input type="checkbox" id="rc-force"${rcv.force ? ' checked' : ''}><span>It really is a separate delivery: book it</span></label></div></div>` : ''}
        <section class="panel">
            <div class="form-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
                <label class="fld">Supplier<input id="rc-sup" value="${esc(inv.supplier)}"></label>
                <label class="fld">Invoice number<input id="rc-no" value="${esc(inv.invoiceNumber)}"></label>
                <label class="fld">Invoice date<input id="rc-date" type="date" value="${esc(inv.date)}"></label>
                <label class="fld">Invoice net total<input value="${inv.net ? '€' + money2(inv.net) : '–'}" disabled></label>
            </div>
            <p class="empty" style="margin:8px 0 0">Read by: ${esc(inv.reader)}${inv.fileName ? ' · ' + esc(inv.fileName) : ''}${diff ? ` · <span style="color:var(--warn)">lines add up to €${money2(lines.reduce((a, l) => a + l.unitCost * l.quantity, 0))}, the invoice says €${money2(inv.net)}: check for a missed line</span>` : ''}</p>
            ${inv.prepayPct ? `<label class="check" style="margin-top:10px"><input type="checkbox" id="rc-prepay"${rcv.prepay ? ' checked' : ''}><span><b style="font-weight:500">Paid in advance: take the ${inv.prepayPct}% prepayment discount off the costs</b><br><span class="empty" style="padding:0">The invoice offers €${money2(inv.prepayAmount)} instead of €${money2(inv.net)} when paid in advance. Tick it if you paid that way, so each product's cost is what you really paid.</span></span></label>` : ''}
        </section>
        <div class="table-wrap"><table class="dt"><thead><tr><th>On the invoice</th><th class="n">Qty</th><th class="n">Unit cost</th><th>Book it as</th><th class="n">Cost change</th><th class="n">Stock after</th><th></th></tr></thead>
        <tbody id="rc-lines">${lines.map((l, i) => {
            const p = l.action === 'stock' ? l.product : null, old = p ? productNetCost(p) : null, c = lineCost(l);
            const change = old && c ? (c - old) / old : null, o = orderHit(l);
            return `<tr data-i="${i}" style="cursor:default${l.action === 'skip' ? ';opacity:.45' : ''}">
                <td class="name"><b>${esc(l.name || '(no description)')}</b><span>${esc([l.code, l.discount ? `${l.discount}% discount` : '', l.free ? 'free of charge (replacement)' : ''].filter(Boolean).join(' · '))}</span></td>
                <td class="n"><input class="inp" type="number" min="1" step="1" data-q="${i}" value="${l.quantity}" style="width:70px;text-align:right" aria-label="Quantity"></td>
                <td class="n"><input class="inp" type="number" min="0" step="0.01" data-c="${i}" value="${l.unitCost}" style="width:96px;text-align:right" aria-label="Unit cost">${rcv.prepay && inv.prepayPct ? `<span class="muted" style="display:block;font-size:11px">€${money2(c)} after ${inv.prepayPct}%</span>` : ''}</td>
                <td style="min-width:260px"><select class="inp" data-a="${i}" style="width:100%">
                        <option value="stock"${l.action === 'stock' ? ' selected' : ''}>${p ? `Add to stock: ${esc(p.name)}` : 'Add to stock: pick a product…'}</option>
                        <option value="pick">Choose a different product…</option>
                        <option value="new"${l.action === 'new' ? ' selected' : ''}>New product in the catalogue</option>
                        <option value="skip"${l.action === 'skip' ? ' selected' : ''}>Skip this line</option></select>
                    ${p ? `<span class="muted" style="display:block;font-size:11.5px;margin-top:3px">${l.how === 'code' ? 'matched by product code' : l.how === 'name' ? 'matched by name' : 'chosen by you'}${o ? ` · <span style="color:var(--violet-2)">on the order list (${outstanding(o)} waiting)</span>` : ''}</span>` : ''}
                    ${l.action === 'stock' && !p && l.guess ? `<button class="btn ghost small" type="button" data-guess="${i}" style="margin-top:3px">Use ${esc(l.guess.name)}?</button>` : ''}
                    ${l.action === 'new' ? `<div style="display:grid;grid-template-columns:minmax(0,1fr) 100px;gap:6px;margin-top:6px"><input class="inp" data-nn="${i}" value="${esc(l.newName)}" aria-label="New product name">
                        <input class="inp" type="number" min="0" step="0.01" data-np="${i}" value="${l.newPrice || r2(c * VAT * MARKUP)}" aria-label="Selling price incl. VAT" title="Selling price incl. VAT (cost + VAT + 40%)"></div>` : ''}</td>
                <td class="n">${change === null ? (l.action === 'new' ? '<span class="chip vio">new</span>' : '–') : Math.abs(change) < 0.005 ? '<span class="muted">same</span>' : `<span class="chip ${change > 0 ? 'bad' : 'ok'}" title="Was €${money2(old)}">${change > 0 ? '+' : ''}${Math.round(change * 100)}%</span>`}</td>
                <td class="n">${p ? `${int(Number(p.stock) || 0)} → <b>${int((Number(p.stock) || 0) + l.quantity)}</b>` : l.action === 'new' ? `<b>${int(l.quantity)}</b>` : '–'}</td>
                <td class="n"><button class="btn ghost small" type="button" data-rm="${i}" aria-label="Remove line">${icon('close')}</button></td></tr>`;
        }).join('')}</tbody></table>
        <div class="table-foot" style="display:flex;justify-content:space-between;align-items:center"><button class="btn small" type="button" id="rc-add">${icon('add')}Add a line</button><span>Costs are net of VAT, per unit.</span></div></div>
        <section class="panel" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
            <div class="summary"><span>Lines <b>${int(lines.filter(l => l.action !== 'skip').length)}</b></span><span>Units <b>${int(units)}</b></span><span>Stock value added <b>${eur(total, 2)}</b></span></div>
            <div class="seg" role="group" aria-label="Payment" style="margin-left:auto"><button type="button" data-pay="paid" aria-pressed="${rcv.pay === 'paid'}">Already paid</button><button type="button" data-pay="later" aria-pressed="${rcv.pay === 'later'}">Pay later</button></div>
            ${rcv.pay === 'later' ? `<label class="fld" style="grid-auto-flow:column;align-items:center;gap:8px">Due<input id="rc-due" type="date" value="${esc(rcv.due)}"></label><span class="muted" style="font-size:12.5px">€${money2(toPay)} goes to Money › You owe</span>` : ''}
            <button class="btn money" type="button" id="rc-save"${problems.length ? ' disabled' : ''}>${icon('move_to_inbox')}Book into stock</button>
        </section>
        ${problems.length ? `<p class="err" style="margin:0">${problems.map(esc).join(' ')}</p>` : ''}`;

    const $ = s => ctx.body.querySelector(s);
    const rerender = () => renderReview(ctx);
    $('#rc-sup').addEventListener('change', e => { inv.supplier = e.target.value.trim(); rerender(); });
    $('#rc-no').addEventListener('change', e => { inv.invoiceNumber = e.target.value.trim(); rcv.force = false; rerender(); });
    $('#rc-date').addEventListener('change', e => { inv.date = e.target.value; });
    if ($('#rc-force')) $('#rc-force').addEventListener('change', e => { rcv.force = e.target.checked; rerender(); });
    if ($('#rc-prepay')) $('#rc-prepay').addEventListener('change', e => { rcv.prepay = e.target.checked; rerender(); });
    if ($('#rc-due')) $('#rc-due').addEventListener('change', e => { rcv.due = e.target.value; });
    ctx.body.querySelectorAll('[data-pay]').forEach(b => b.addEventListener('click', () => { rcv.pay = b.dataset.pay; rerender(); }));
    const tb = $('#rc-lines');
    tb.addEventListener('change', async e => {
        const t = e.target, i = Number(t.dataset.q ?? t.dataset.c ?? t.dataset.a ?? t.dataset.nn ?? t.dataset.np); const l = lines[i]; if (!l) return;
        if (t.dataset.q !== undefined) l.quantity = Math.max(1, Math.round(Number(t.value) || 1));
        if (t.dataset.c !== undefined) l.unitCost = r2(Number(t.value) || 0);
        if (t.dataset.nn !== undefined) l.newName = t.value.trim();
        if (t.dataset.np !== undefined) l.newPrice = r2(Number(t.value) || 0);
        if (t.dataset.a !== undefined) {
            if (t.value === 'pick') { const p = await pickProduct(ctx, l); if (p) { l.product = p; l.how = 'chosen'; l.action = 'stock'; } }
            else l.action = t.value;
        }
        rerender();
    });
    tb.addEventListener('click', e => {
        const g = e.target.closest('[data-guess]'), rm = e.target.closest('[data-rm]');
        if (g) { const l = lines[Number(g.dataset.guess)]; l.product = l.guess; l.how = 'chosen'; rerender(); }
        if (rm) { lines.splice(Number(rm.dataset.rm), 1); rerender(); }
    });
    $('#rc-add').addEventListener('click', async () => {
        const p = await pickProduct(ctx, { name: '' });
        if (p) { lines.push({ code: p.code || '', name: p.name, quantity: 1, unitCost: r2(productNetCost(p) || 0), product: p, how: 'chosen', action: 'stock', newName: p.name, newPrice: 0 }); rerender(); }
    });
    $('#rc-save').addEventListener('click', () => save(ctx, toPay));
}

async function pickProduct(ctx, line) {
    let chosen = null;
    const initial = line.name ? suggestProducts(ctx.model.products, line.name, 6) : [];
    const pr = openModal({
        title: line.name ? `Which product is “${line.name}”?` : 'Add a product to this delivery', confirmLabel: 'Use this product',
        body: `<label class="field-search" style="max-width:none">${icon('search')}<input id="pp-q" type="search" placeholder="Search the catalogue" aria-label="Search products"></label>
            <div class="results" id="pp-res" role="listbox" style="max-height:260px;overflow:auto"></div>`,
        validate: () => chosen ? '' : 'Pick a product from the list.'
    });
    const m = [...document.querySelectorAll('.modal-backdrop')].pop(), res = m.querySelector('#pp-res'), q = m.querySelector('#pp-q');
    let shown = initial;
    const draw = () => { res.innerHTML = shown.map(p => `<div class="res" role="option" data-id="${esc(p._id)}" aria-selected="${chosen && chosen._id === p._id}"><div><b>${esc(p.name)}</b><span class="sub">${esc(p.code || '')}</span></div><span class="stk">${int(Number(p.stock) || 0)} in stock</span><span class="pr">${productNetCost(p) ? '€' + money2(productNetCost(p)) : ''}</span></div>`).join('') || '<p class="empty">Type to search.</p>'; };
    q.addEventListener('input', () => { shown = q.value.trim() ? rankProducts(ctx.model.products, q.value, ctx.a.soldUnits, 8) : initial; draw(); });
    res.addEventListener('click', e => { const o = e.target.closest('[data-id]'); if (o) { chosen = ctx.model.products.find(p => p._id === o.dataset.id); draw(); } });
    draw();
    return (await pr) ? chosen : null;
}

async function save(ctx, toPay) {
    const inv = rcv.invoice, when = inv.date ? new Date(inv.date + 'T12:00').getTime() : Date.now();
    const use = rcv.lines.filter(l => l.action !== 'skip');
    // Two invoice lines for the same product become one update.
    const perProduct = new Map();
    use.filter(l => l.action === 'stock').forEach(l => {
        const x = perProduct.get(l.product._id) || { p: l.product, qty: 0, value: 0, code: l.code };
        x.qty += l.quantity; x.value += lineCost(l) * l.quantity; perProduct.set(l.product._id, x);
    });
    const ok = await openModal({
        title: `Book invoice ${inv.invoiceNumber} into stock?`, confirmLabel: 'Book into stock', confirmClass: 'money',
        body: `<p>${[perProduct.size ? `${plural(perProduct.size, 'product gets', 'products get')} more stock` : '', use.some(l => l.action === 'new') ? `${plural(use.filter(l => l.action === 'new').length, 'new product is', 'new products are')} created` : ''].filter(Boolean).join(' and ')}; each keeps this delivery as a purchase record with its cost.${rcv.pay === 'later' ? ` €${money2(toPay)} is added to what you owe ${esc(inv.supplier)}.` : ''}</p>`
    });
    if (!ok) return;
    const batch = writeBatch(db);
    perProduct.forEach(x => {
        const unit = r2(x.value / x.qty);
        const update = { stock: increment(x.qty), baseCost: unit, cost: r2(unit * VAT), lastRestockDate: Date.now(),
            batches: arrayUnion({ quantity: x.qty, cost: unit, date: when, supplier: inv.supplier, invoice: inv.invoiceNumber }) };
        if (!x.p.code && x.code) update.code = x.code;
        batch.update(doc(db, 'products', x.p._id), update);
    });
    use.filter(l => l.action === 'new').forEach(l => {
        const c = lineCost(l);
        batch.set(doc(collection(db, 'products')), { code: l.code || '', name: l.newName, producer: inv.supplier, baseCost: c, cost: r2(c * VAT),
            price: l.newPrice || r2(c * VAT * MARKUP), stock: l.quantity, image: '', batches: [{ quantity: l.quantity, cost: c, date: when, supplier: inv.supplier, invoice: inv.invoiceNumber }], createdAt: Date.now() });
    });
    // Tick off the order list: oldest waiting line first, never beyond what was ordered.
    let ticked = 0;
    perProduct.forEach(x => {
        let left = x.qty;
        rcv.orderLines.filter(o => productForLine([x.p], o)).sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)).forEach(o => {
            const take = Math.min(left, outstanding(o)); if (take <= 0) return;
            batch.update(doc(db, 'toOrder', o._id), { quantityReceived: increment(take) }); left -= take; ticked++;
        });
    });
    try {
        await batch.commit();
        let owedNote = '';
        if (rcv.pay === 'later') {
            try { await addSupplierInvoice({ supplier: inv.supplier, invoiceNumber: inv.invoiceNumber, totalAmount: toPay, date: inv.date, dueDate: rcv.due, creditors: ctx.model.creditors }); owedNote = `, €${money2(toPay)} added to You owe`; }
            catch (e) { owedNote = `. Stock is booked, but the amount to pay couldn't be recorded (${e.message}): add it in Money › You owe`; }
        }
        toast(`Invoice ${inv.invoiceNumber} booked: ${plural(use.reduce((a, l) => a + l.quantity, 0), 'unit', 'units')}${ticked ? `, ${plural(ticked, 'order line', 'order lines')} ticked off` : ''}${owedNote}`);
        Object.assign(rcv, { invoice: null, lines: null, status: `Last booked: invoice ${inv.invoiceNumber} from ${inv.supplier}.` });
        await ctx.reload();
    } catch (e) { toast(`Couldn't book the delivery: ${e.message}`, { bad: true }); }
}
