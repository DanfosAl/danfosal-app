// Sell > Import invoice: turn a PDF sales invoice (Platforma Qendrore e Faturave) into a sale.
//
// The reading and saving are the classic ManualPDFProcessor (manual-pdf-processor.js), with the
// fixes from 21 Sep 2026 (text layer first, buyer block, NIPT, EUR totals). This screen replaces
// only the page around it, and adds two guards the classic page lacked:
//  - an invoice number that is already a sale is refused unless the owner insists;
//  - a line set to "don't take from stock" really isn't (the processor used to fall back to a
//    loose name match and deduct stock anyway).
// Product matching is the classic page's findBestProductMatch, with its model-number guard.
import { db, collection, doc, getDocs, getDoc, addDoc, updateDoc, Timestamp } from './firebase.js';
import { esc, eur, int, icon, money2, fold, toast, openModal } from './ui.js';
import { customerKey, customerDirectory, saleInvoiceNumber, shortInvoice, rankProducts } from './data.js';

function loadScript(src, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.onload = () => resolve(window[globalName]);
        s.onerror = () => reject(new Error(`Couldn't load ${src.split('/').pop()}. Check the internet connection.`));
        document.head.appendChild(s);
    });
}

// Same line builder as the classic page: a gap wider than 3pt is a column break, not a word break.
function textItemsToLines(items) {
    const rows = [];
    for (const item of items) {
        const str = item.str || ''; if (!str.trim()) continue;
        const x = item.transform[4], y = item.transform[5];
        let row = rows.find(r => Math.abs(r.y - y) <= 2);
        if (!row) { row = { y, cells: [] }; rows.push(row); }
        row.cells.push({ x, str, width: item.width || 0 });
    }
    rows.sort((a, b) => b.y - a.y);
    return rows.map(row => {
        row.cells.sort((a, b) => a.x - b.x);
        let line = '', prevEnd = null;
        for (const c of row.cells) { if (prevEnd !== null && c.x - prevEnd > 3) line += ' '; line += c.str; prevEnd = c.x + c.width; }
        return line.replace(/\s+/g, ' ').trim();
    }).filter(Boolean).join('\n');
}

async function pdfText(file, status) {
    const lib = await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
    lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = '', ocr = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
        status(`Reading page ${n} of ${pdf.numPages}…`);
        const page = await pdf.getPage(n);
        let t = '';
        try { t = textItemsToLines((await page.getTextContent()).items); } catch { /* unreadable text layer */ }
        if (t.replace(/\s/g, '').length < 40) {
            ocr++;
            status(`Page ${n} is a scan: reading it with OCR…`);
            const T = await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js', 'Tesseract');
            const vp = page.getViewport({ scale: 2 });
            const canvas = Object.assign(document.createElement('canvas'), { width: vp.width, height: vp.height });
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
            t = (await T.recognize(canvas.toDataURL('image/png'), 'eng')).data.text;
        }
        text += `\n\n=== PAGE ${n} ===\n\n` + t;
    }
    return { text, ocr, pages: pdf.numPages };
}

// ------------------------------------------------------------------ matching (classic rules)

const modelNumbers = name => (name.match(/\d+(?:[/\-.,]\d+)*/g) || []).join(' ');
const stripProducer = name => name.replace(/^(k[aä]rcher|karcher|kaercher)\s+/i, '').trim();
function findBestProductMatch(products, searchName) {
    if (!searchName) return null;
    const bare = stripProducer(searchName.toLowerCase().trim()), model = modelNumbers(bare);
    let best = null, bestScore = 0;
    products.forEach(p => {
        const pb = stripProducer((p.name || '').toLowerCase().trim()); if (!pb) return;
        const pm = modelNumbers(pb);
        if (model && pm && model !== pm) return;
        let score = 0;
        if (pb === bare) score = 100;
        else if (pb.startsWith(bare)) score = 90;
        else if (bare.startsWith(pb)) score = 85;
        else if (pb.includes(bare)) score = 45;
        else if (bare.includes(pb)) score = 70;
        else {
            const sw = bare.split(/\s+/).filter(w => w.length >= 2), pw = pb.split(/\s+/).filter(w => w.length >= 2);
            const hit = sw.filter(w => pw.some(x => x === w || (w.length >= 4 && x.includes(w)) || (x.length >= 4 && w.includes(x))));
            if (hit.length && sw.length) score = (hit.length / sw.length) * 85 - Math.min((pw.length - hit.length) * 2, 10);
        }
        if (score > bestScore) { bestScore = score; best = p; }
    });
    return bestScore >= 50 ? best : null;
}

// ------------------------------------------------------------------ screen

const im = { data: null, confidence: 0, force: false, busy: false, status: '', fileName: '', text: '' };
let processor = null;

async function getProcessor() {
    if (processor) return processor;
    await loadScript('manual-pdf-processor.js', 'ManualPDFProcessor');
    processor = new window.ManualPDFProcessor(db, { collection, addDoc, getDocs, getDoc, updateDoc, doc, Timestamp });
    return processor;
}

export function renderImport(ctx) {
    ctx.setSub('Turn a PDF sales invoice into a sale: stock, customer and profit in one step');
    const actions = ctx.setActions(im.data ? `<button class="btn ghost" type="button" id="im-reset">${icon('restart_alt')}Start again</button>` : '');
    const reset = actions.querySelector('#im-reset');
    if (reset) reset.addEventListener('click', () => { Object.assign(im, { data: null, force: false }); renderImport(ctx); });
    if (!im.data) return renderPick(ctx);
    renderReview(ctx);
}

function renderPick(ctx) {
    ctx.body.innerHTML = `
        <label class="dropzone" id="im-drop" tabindex="0">${icon('document_scanner')}
            <b>Drop the invoice PDF here, or click to choose it</b>
            <span>Invoices from the Platforma Qendrore e Faturave are read from their exact text. You check every line before the sale is saved.</span>
            <input type="file" id="im-file" accept="application/pdf" hidden></label>
        <p class="empty" id="im-status" style="margin:0">${esc(im.status)}</p>`;
    const drop = ctx.body.querySelector('#im-drop'), input = ctx.body.querySelector('#im-file'), status = ctx.body.querySelector('#im-status');
    const take = async file => {
        if (!file || im.busy) return;
        im.busy = true; drop.classList.add('busy');
        try {
            const { text, ocr } = await pdfText(file, t => { status.textContent = t; });
            status.textContent = 'Reading the invoice…';
            const proc = await getProcessor();
            let result = await proc.extractAlbanianInvoiceFromText(text, {});
            if (!result.success && /conversion rate/i.test(result.error || '')) {
                const ok = await openModal({ title: 'Invoice in lek (ALL)', confirmLabel: 'Convert',
                    body: '<p>This invoice has no euro totals. Enter today’s rate to convert it.</p><label class="fld">Lek per euro<input id="im-rate" type="number" min="1" step="0.01" value="100"></label>',
                    validate: w => Number(w.querySelector('#im-rate').value) > 0 ? '' : 'Enter the rate.' });
                if (!ok) throw new Error('Import cancelled: no conversion rate.');
                result = await proc.extractAlbanianInvoiceFromText(text, { conversionRate: Number(ok.querySelector('#im-rate').value) });
            }
            if (!result.success) throw new Error(result.error || 'The invoice could not be read.');
            const d = result.data;
            d.items = (d.items || []).map(it => {
                const clean = String(it.itemName || it.name || '').replace(/\s*\d{1,5}[.,]\d{2}\s*$/g, '').trim();
                const p = findBestProductMatch(ctx.model.products, clean);
                return { ...it, itemName: clean || it.itemName, productId: p ? p._id : undefined, linkedProductName: p ? p.name : undefined, matchedBy: p ? 'auto' : null };
            });
            Object.assign(im, { data: d, confidence: result.confidence || 0, force: false, fileName: file.name, ocr, text });
            renderImport(ctx);
        } catch (e) { status.innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`; }
        finally { im.busy = false; drop.classList.remove('busy'); }
    };
    drop.addEventListener('click', e => { if (e.target !== input) input.click(); });
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => take(input.files[0]));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); take(e.dataTransfer.files[0]); });
}

function renderReview(ctx) {
    const d = im.data, products = ctx.model.products;
    const existing = ctx.model.sales.filter(s => shortInvoice(saleInvoiceNumber(s)) && shortInvoice(saleInvoiceNumber(s)) === shortInvoice(d.invoiceNumber));
    const dir = ctx.model._directory || (ctx.model._directory = customerDirectory(ctx.model));
    const nipt = String(d.customerNipt || '').toUpperCase().replace(/\s/g, '');
    const known = (nipt && dir.find(e => String(e.nipt || '').toUpperCase().replace(/\s/g, '') === nipt)) || dir.find(e => e.keys.has(customerKey(d.customerName)));
    const linesTotal = d.items.reduce((a, i) => a + (Number(i.lineTotal) || 0), 0);
    const problems = [];
    if (!String(d.invoiceNumber || '').trim()) problems.push('Enter the invoice number.');
    if (!d.items.length) problems.push('The invoice has no lines.');
    if (existing.length && !im.force) problems.push('This invoice is already a sale (see above).');

    ctx.body.innerHTML = `
        ${existing.length ? `<div class="error-box" style="align-items:flex-start">${icon('content_copy')}<div style="flex:1"><b>Invoice ${esc(shortInvoice(d.invoiceNumber))} is already saved as a sale</b>
            (${esc(existing[0].clientName || existing[0].customerName || '')}, €${money2(existing[0].total)}). Importing it again would count the sale twice and take its stock twice.
            <a href="sell.html?q=${encodeURIComponent(shortInvoice(d.invoiceNumber))}#sales" style="color:inherit">See it</a>
            <label class="check" style="margin-top:8px;background:transparent;padding:0"><input type="checkbox" id="im-force"${im.force ? ' checked' : ''}><span>It really is a different invoice with the same number</span></label></div></div>` : ''}
        <section class="panel">
            <div class="form-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
                <label class="fld">Invoice number<input id="im-no" value="${esc(d.invoiceNumber || '')}"></label>
                <label class="fld">Date<input id="im-date" value="${esc(d.date || '')}" placeholder="DD/MM/YYYY"></label>
                <label class="fld">Buyer NIPT<input id="im-nipt" value="${esc(d.customerNipt || '')}"></label>
                <label class="fld wide" style="grid-column:span 2">Buyer<input id="im-cust" value="${esc(d.customerName || '')}"></label>
                <label class="fld">Buyer address<input id="im-addr" value="${esc(d.customerAddress || '')}"></label>
            </div>
            <p class="empty" style="margin:8px 0 0">${known ? `${icon('person')} Existing customer: <b>${esc(known.name)}</b> (${int(known.count)} earlier purchases)` : `${icon('person_add')} New customer: a profile is created when you save`}
                · read ${im.ocr ? `with OCR on ${int(im.ocr)} page(s): check carefully` : 'from the exact text'} · ${esc(im.fileName)} · confidence ${int(im.confidence)}%
                ${d.hasDualCurrency ? ' · euro totals used (lek ignored)' : d.normalizedToEUR ? ` · converted from ${esc(d.originalCurrency)} at ${esc(d.conversionRate)}` : ''}</p>
            ${(d.warnings || []).length ? `<p class="empty" style="margin:6px 0 0;color:var(--warn)">${d.warnings.map(esc).join(' · ')}</p>` : ''}
        </section>
        <div class="table-wrap"><table class="dt"><thead><tr><th>On the invoice</th><th>Product (stock)</th><th class="n">Qty</th><th class="n">Price each, net</th><th class="n">Line total</th></tr></thead>
        <tbody id="im-lines">${d.items.map((it, i) => { const p = it.productId && products.find(x => x._id === it.productId); return `<tr data-i="${i}" style="cursor:default">
            <td class="name"><input class="inp" data-n="${i}" value="${esc(it.itemName)}" style="width:100%" aria-label="Name on the invoice"></td>
            <td>${p ? `<b style="font-weight:500">${esc(p.name)}</b> <span class="muted">${int(Number(p.stock) || 0)} in stock → ${int((Number(p.stock) || 0) - (Number(it.quantity) || 0))}</span>${it.matchedBy === 'auto' ? ' <span class="chip">auto</span>' : ''}`
                : it.noStock ? '<span class="muted">Not from stock (service or non-catalogue item)</span>' : '<span class="chip warn">not linked: pick one</span>'}
                <div style="margin-top:4px;display:flex;gap:6px"><button class="btn ghost small" type="button" data-pick="${i}">${icon('link')}${p ? 'Change' : 'Choose product'}</button>
                ${it.noStock ? '' : `<button class="btn ghost small" type="button" data-nostock="${i}">Not from stock</button>`}</div></td>
            <td class="n"><input class="inp" type="number" min="1" step="1" data-q="${i}" value="${Number(it.quantity) || 1}" style="width:66px;text-align:right" aria-label="Quantity"></td>
            <td class="n"><input class="inp" type="number" min="0" step="0.01" data-p="${i}" value="${Number(it.pricePerUnit) || 0}" style="width:96px;text-align:right" aria-label="Price each"></td>
            <td class="n">€${money2(it.lineTotal)}</td></tr>`; }).join('')}</tbody></table></div>
        <section class="panel" style="display:flex;gap:16px;align-items:end;flex-wrap:wrap">
            <label class="fld">Subtotal (net)<input id="im-sub" type="number" step="0.01" value="${Number(d.subtotal) || 0}"></label>
            <label class="fld">VAT<input id="im-tax" type="number" step="0.01" value="${Number(d.tax) || 0}"></label>
            <label class="fld">Total<input id="im-total" type="number" step="0.01" value="${Number(d.total) || 0}"></label>
            <span class="muted" style="font-size:12.5px;padding-bottom:10px">${Math.abs(linesTotal - (Number(d.subtotal) || 0)) > 0.05 ? `<span style="color:var(--warn)">Lines add up to €${money2(linesTotal)}, not the subtotal: check for a missed line.</span>` : 'Lines add up to the subtotal.'}</span>
            <button class="btn money" type="button" id="im-save" style="margin-left:auto"${problems.length ? ' disabled' : ''}>${icon('receipt_long')}Save sale</button>
        </section>
        ${problems.length ? `<p class="err" style="margin:0">${problems.map(esc).join(' ')}</p>` : ''}`;

    const $ = s => ctx.body.querySelector(s);
    const keep = () => {
        Object.assign(d, { invoiceNumber: $('#im-no').value.trim(), date: $('#im-date').value.trim(), customerName: $('#im-cust').value.trim(), customerAddress: $('#im-addr').value.trim(),
            customerNipt: $('#im-nipt').value.trim(), subtotal: Number($('#im-sub').value) || 0, tax: Number($('#im-tax').value) || 0, total: Number($('#im-total').value) || 0 });
    };
    ['#im-no', '#im-date', '#im-cust', '#im-addr', '#im-nipt', '#im-sub', '#im-tax', '#im-total'].forEach(s => $(s).addEventListener('change', () => { keep(); if (s === '#im-no' || s === '#im-cust' || s === '#im-nipt') { im.force = false; renderReview(ctx); } }));
    if ($('#im-force')) $('#im-force').addEventListener('change', e => { im.force = e.target.checked; renderReview(ctx); });
    const tb = $('#im-lines');
    tb.addEventListener('change', e => {
        const t = e.target, i = Number(t.dataset.n ?? t.dataset.q ?? t.dataset.p), it = d.items[i]; if (!it) return;
        if (t.dataset.n !== undefined) it.itemName = t.value.trim();
        if (t.dataset.q !== undefined) it.quantity = Math.max(1, Math.round(Number(t.value) || 1));
        if (t.dataset.p !== undefined) it.pricePerUnit = Number(t.value) || 0;
        it.lineTotal = Math.round((Number(it.quantity) || 0) * (Number(it.pricePerUnit) || 0) * 100) / 100;
        keep(); renderReview(ctx);
    });
    tb.addEventListener('click', async e => {
        const pk = e.target.closest('[data-pick]'), ns = e.target.closest('[data-nostock]');
        if (ns) { const it = d.items[Number(ns.dataset.nostock)]; delete it.productId; delete it.linkedProductName; it.noStock = true; keep(); renderReview(ctx); }
        if (pk) {
            const it = d.items[Number(pk.dataset.pick)];
            const p = await pickProduct(ctx, it.itemName);
            if (p) { it.productId = p._id; it.linkedProductName = p.name; it.noStock = false; it.matchedBy = 'owner'; keep(); renderReview(ctx); }
        }
    });
    $('#im-save').addEventListener('click', () => { keep(); save(ctx); });
}

async function pickProduct(ctx, text) {
    let chosen = null;
    const pr = openModal({ title: `Which product is “${text}”?`, confirmLabel: 'Link',
        body: `<label class="field-search" style="max-width:none">${icon('search')}<input id="ip-q" type="search" value="${esc(text)}" aria-label="Search products"></label><div class="results" id="ip-res" style="max-height:260px;overflow:auto"></div>`,
        validate: () => chosen ? '' : 'Pick a product from the list.' });
    const m = [...document.querySelectorAll('.modal-backdrop')].pop(), q = m.querySelector('#ip-q'), res = m.querySelector('#ip-res');
    let shown = [];
    const draw = () => { res.innerHTML = shown.map(p => `<div class="res" data-id="${esc(p._id)}" aria-selected="${chosen && chosen._id === p._id}"><div><b>${esc(p.name)}</b><span class="sub">${esc(p.code || '')}</span></div><span class="stk ${Number(p.stock) > 0 ? '' : 'zero'}">${int(Number(p.stock) || 0)} in stock</span><span class="pr">€${money2(p.price)}</span></div>`).join('') || '<p class="empty">No match. Try fewer words.</p>'; };
    const search = () => { shown = rankProducts(ctx.model.products, q.value, ctx.a.soldUnits, 8); if (!shown.length) { const b = findBestProductMatch(ctx.model.products, q.value); shown = b ? [b] : []; } draw(); };
    q.addEventListener('input', search); res.addEventListener('click', e => { const o = e.target.closest('[data-id]'); if (o) { chosen = ctx.model.products.find(p => p._id === o.dataset.id); draw(); } });
    search();
    return (await pr) ? chosen : null;
}

async function save(ctx) {
    const d = im.data;
    const fromStock = d.items.filter(i => i.productId);
    const unlinked = d.items.filter(i => !i.productId && !i.noStock);
    const ok = await openModal({ title: `Save invoice ${shortInvoice(d.invoiceNumber)} as a sale?`, confirmLabel: 'Save sale', confirmClass: 'money',
        body: `<p>€${money2(d.total)} for ${esc(d.customerName || 'the buyer')}. ${fromStock.length ? `Stock is taken for ${fromStock.map(i => `${int(i.quantity)} × ${esc(i.linkedProductName)}`).join(', ')}.` : 'No stock is taken.'}
            ${unlinked.length ? `<br><span style="color:var(--warn)">${unlinked.length} line(s) aren't linked: the classic rule will guess a product by name. Link them or mark them “Not from stock” to be sure.</span>` : ''}</p>` });
    if (!ok) return;
    const btn = ctx.body.querySelector('#im-save'); if (btn) btn.disabled = true;
    try {
        const result = await (await getProcessor()).saveToDatabase({ ...d });
        if (!result || result.success === false) throw new Error((result && result.error) || 'Save failed');
        toast(`Invoice ${shortInvoice(d.invoiceNumber)} saved as a sale`);
        Object.assign(im, { data: null, force: false, status: `Last saved: invoice ${shortInvoice(d.invoiceNumber)} for ${d.customerName}.` });
        await ctx.reload();
    } catch (e) { if (btn) btn.disabled = false; toast(`Couldn't save: ${e.message}`, { bad: true }); }
}
