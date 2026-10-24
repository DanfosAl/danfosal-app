// The EasyPOS price list: the prices to type into EasyPOS so the till charges what the app says.
//
// EasyPOS is the official fiscal till and nothing in this app changes it (owner's rule). So a price
// changed here - Stock › Prices, a delivery, the catalogue, a website price - goes on a printed list
// (or a PDF): the changed prices since the owner last marked the list entered, or every product's
// price with the changed ones marked. EasyPOS's own sales say which changes already reached it: a
// sale after the change at the new price.
//
// Writes only settings/pricing {easyposDoneAt} when the owner marks the list entered.
import { db, doc, setDoc } from './firebase.js';
import { esc, int, plural, day, fold, toast, openModal } from './ui.js';
import { productIdOfLine, saleTime } from './data.js';

const euro = v => { const x = Math.round(v * 100) / 100; return '€' + x.toLocaleString('en-US', Number.isInteger(x) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const longDay = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export const easyposDoneAt = m => Number(m.pricing && m.pricing.easyposDoneAt) || 0;

// What EasyPOS last charged for each product (VAT included, per unit) and when.
function lastEasypos(m) {
    const known = new Set(m.products.map(p => p._id));
    const out = new Map();
    m.sales.forEach(s => {
        if (s.type !== 'easypos' || s.isReturn) return;
        const t = saleTime(s); if (isNaN(t)) return;
        (s.items || []).forEach(it => {
            const id = productIdOfLine(it, known), price = Number(it.price) || 0;
            if (!id || !price || it.isService) return;
            const cur = out.get(id);
            if (!cur || t > cur.t) out.set(id, { t, price });
        });
    });
    return out;
}

// Each product whose price changed in the app since `since`: where it started, where it is now,
// and whether EasyPOS has already charged the new price since.
export function easyposChanges(m, since = easyposDoneAt(m)) {
    const sold = lastEasypos(m);
    const out = [];
    m.products.forEach(p => {
        const hist = (Array.isArray(p.priceHistory) ? p.priceHistory : []).filter(h => Number(h.at) > since).sort((a, b) => a.at - b.at);
        if (!hist.length) return;
        const was = Number(hist[0].was) || 0, price = Number(p.price) || 0, last = hist[hist.length - 1];
        if (was && Math.abs(price - was) < 0.01) return;   // changed and changed back
        const e = sold.get(p._id);
        out.push({ p, was, price, at: last.at, why: last.why || '', isNew: !was,
            seen: e && e.t > last.at && Math.abs(e.price - price) < 0.5 ? e : null });
    });
    return out;
}

// ------------------------------------------------------------------ the printed sheet

const codeOf = p => String(p.code || '').trim();
const tillNames = p => (Array.isArray(p.receiptNames) ? p.receiptNames : []).filter(n => fold(n) !== fold(p.name));
const nameCell = p => `${esc(p.name)}${tillNames(p).length ? `<span class="sub">In EasyPOS: ${tillNames(p).map(esc).join(' · ')}</span>` : ''}`;
const sorter = how => how === 'code' ? (a, b) => codeOf(a.p).localeCompare(codeOf(b.p), 'en', { numeric: true }) || fold(a.p.name).localeCompare(fold(b.p.name))
    : (a, b) => fold(a.p.name).localeCompare(fold(b.p.name), 'en', { numeric: true });

export function priceListHtml(m, { mode, inStock, sort }) {
    const since = easyposDoneAt(m), now = Date.now();
    const changes = easyposChanges(m, since);
    const changed = new Map(changes.map(c => [c.p._id, c]));
    const head = (title, note) => `<div class="ps-head"><div><b>Danfosal · ${esc(title)}</b><span>${esc(note)}</span></div>
        <span>${esc(longDay(now))}, ${new Date(now).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></div>`;
    if (mode === 'changed') {
        const rows = changes.slice().sort(sorter(sort));
        return `${head('Prices to type into EasyPOS', `${plural(rows.length, 'price', 'prices')} changed in the app${since ? ` since ${longDay(since)}` : ''}. Prices include VAT. Tick each one when it is in EasyPOS.`)}
            <table><thead><tr><th class="box"></th><th>Code</th><th>Product</th><th class="n">Was</th><th class="n">New price</th><th>Changed</th><th>EasyPOS</th></tr></thead>
            <tbody>${rows.map(c => `<tr><td class="box"><i></i></td><td class="code">${esc(codeOf(c.p))}</td><td>${nameCell(c.p)}</td>
                <td class="n">${c.isNew ? '<span class="tag">new product</span>' : `<span class="was">${euro(c.was)}</span>`}</td><td class="n new">${euro(c.price)}</td>
                <td class="when">${esc(day(c.at))}<span class="sub">${esc(c.why)}</span></td>
                <td class="when">${c.seen ? `✓ charged ${euro(c.seen.price)} on ${esc(day(c.seen.t))}` : ''}</td></tr>`).join('') || '<tr><td colspan="7">No price has changed in the app since the list was last entered.</td></tr>'}</tbody></table>
            <p class="ps-foot">✓ = EasyPOS has already charged the new price since the change. Printed from Danfosal App; mark the list entered in Stock › Prices once EasyPOS has every price.</p>`;
    }
    const sold = lastEasypos(m);
    const rows = m.products.filter(p => Number(p.price) > 0 && (!inStock || Number(p.stock) > 0)).map(p => ({ p })).sort(sorter(sort));
    let differ = 0;
    const body = rows.map(({ p }) => {
        const c = changed.get(p._id), e = sold.get(p._id), price = Number(p.price) || 0;
        const lastChange = (Array.isArray(p.priceHistory) ? p.priceHistory : []).reduce((x, h) => Math.max(x, Number(h.at) || 0), 0);
        // EasyPOS charged something else after the app's price was set: worth a look in EasyPOS
        // (it may also have been a discount at the till).
        const off = e && e.t > lastChange && Math.abs(e.price - price) >= 0.5;
        if (off) differ++;
        return `<tr${c ? ' class="chg"' : ''}><td class="box"><i></i></td><td class="code">${esc(codeOf(p))}</td><td>${nameCell(p)}</td>
            <td class="n new">${euro(price)}${c ? `<span class="sub">${c.isNew ? 'new product' : `was ${euro(c.was)}`}</span>` : ''}</td>
            <td class="n">${int(Number(p.stock) || 0)}</td>
            <td class="when">${e ? `${off ? '<b class="flag">≠</b> ' : ''}${euro(e.price)} on ${esc(day(e.t))}` : ''}</td></tr>`;
    }).join('');
    return `${head('Price list for EasyPOS', `${plural(rows.length, 'product', 'products')}${inStock ? ' in stock' : ''}, prices with VAT. ● ${plural(changes.length, 'price', 'prices')} changed in the app${since ? ` since ${longDay(since)}` : ''}${differ ? `; ≠ ${int(differ)} sold in EasyPOS at another price` : ''}.`)}
        <table><thead><tr><th class="box"></th><th>Code</th><th>Product</th><th class="n">Price</th><th class="n">Stock</th><th>Last EasyPOS sale</th></tr></thead><tbody>${body}</tbody></table>
        <p class="ps-foot">● Changed in the app (shaded): type the new price into EasyPOS. ≠ EasyPOS charged a different price on its last sale after this price was set - check it in EasyPOS (it may have been a discount).</p>`;
}

// Print it (web), save it as a PDF (desktop app), or show it (phone, which can't print).
async function outputSheet(html, name) {
    document.getElementById('print-sheet')?.remove();
    const sheet = Object.assign(document.createElement('div'), { id: 'print-sheet', className: 'print-sheet', innerHTML: html });
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
        await openModal({ title: 'Price list for EasyPOS', body: `<div class="sheet-view">${html}</div><p class="empty" style="margin:8px 0 0">Print or save it as a PDF from the computer.</p>`, confirmLabel: 'Close', cancelLabel: 'Back' });
        return;
    }
    document.body.appendChild(sheet);
    document.documentElement.classList.add('printing-sheet'); document.body.classList.add('printing-sheet');
    try {
        if (window.electronAPI && window.electronAPI.savePagePDF) {
            const r = await window.electronAPI.savePagePDF(name, { landscape: false, folder: 'Price lists' });
            if (r && r.saved) toast(`PDF saved: ${r.filePath}`);
        } else window.print();
    } catch (e) { toast(`Couldn't make the PDF: ${e.message}`, { bad: true }); }
    finally { document.documentElement.classList.remove('printing-sheet'); document.body.classList.remove('printing-sheet'); sheet.remove(); }
}

// The choice of list, then the sheet.
export async function printPriceList(m) {
    const changes = easyposChanges(m);
    const inStock = m.products.filter(p => Number(p.price) > 0 && Number(p.stock) > 0).length, all = m.products.filter(p => Number(p.price) > 0).length;
    const since = easyposDoneAt(m);
    const pending = openModal({
        title: 'Price list for EasyPOS', confirmLabel: window.electronAPI && window.electronAPI.savePagePDF ? 'Save PDF' : 'Print',
        body: `<div style="display:grid;gap:8px">
            <label class="check"><input type="radio" name="pl-mode" value="changed"${changes.length ? ' checked' : ''}><span><b style="font-weight:500">Changed prices to type in (${int(changes.length)})</b><br><span class="empty" style="padding:0">Changed in the app${since ? ` since you last marked the list entered, ${esc(longDay(since))}` : ''}: old and new price, and whether EasyPOS already charges it.</span></span></label>
            <label class="check"><input type="radio" name="pl-mode" value="all"${changes.length ? '' : ' checked'}><span><b style="font-weight:500">Every product's price</b><br><span class="empty" style="padding:0">The whole list to check EasyPOS against (${int(all)} products), changed prices marked, and what EasyPOS last charged.</span></span></label>
            <label class="check"><input type="checkbox" id="pl-stock"><span>Only products in stock (${int(inStock)})</span></label>
            <div class="seg" role="group" aria-label="Sort" style="justify-self:start"><button type="button" data-sort="name" aria-pressed="true">By name</button><button type="button" data-sort="code" aria-pressed="false">By code</button></div></div>`
    , validate: w => w.querySelector('input[name="pl-mode"]:checked') ? '' : 'Pick a list.' });
    const box = [...document.querySelectorAll('.modal-backdrop')].pop();
    box.dataset.sort = 'name';
    box.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => {
        box.dataset.sort = b.dataset.sort;
        box.querySelectorAll('[data-sort]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    }));
    const dlg = await pending;
    if (!dlg) return;
    const mode = dlg.querySelector('input[name="pl-mode"]:checked').value;
    const sort = dlg.dataset.sort || 'name';
    const html = priceListHtml(m, { mode, inStock: dlg.querySelector('#pl-stock').checked, sort });
    await outputSheet(html, `Danfosal ${mode === 'changed' ? 'EasyPOS price changes' : 'price list'} ${new Date().toISOString().slice(0, 10)}`);
}

// The "entered in EasyPOS" mark: the next list starts after it.
export async function markEntered(ctx, count) {
    const ok = await openModal({
        title: 'Mark the prices as entered in EasyPOS?', confirmLabel: 'They are in EasyPOS',
        body: `<p>${plural(count, 'changed price', 'changed prices')} leave the list. A price changed after this goes on the next one.</p>`
    });
    if (!ok) return;
    try { await setDoc(doc(db, 'settings', 'pricing'), { easyposDoneAt: Date.now() }, { merge: true }); toast('Marked entered in EasyPOS'); await ctx.reload(); }
    catch (e) { toast(`Couldn't save: ${e.message}`, { bad: true }); }
}

