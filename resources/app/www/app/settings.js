// Settings: the few preferences that do something on the desktop, a live data-health check that
// replaces the classic Check Firebase / Check duplicates / Fix stock tools, and the admin tools.
//
// Dropped on purpose (they did nothing in the dark, desktop app): themes, reading mode, pull to
// refresh, long-press menus, and the WhatsApp auto-send that no screen used.
import { bootWorkspace } from './workspace.js';
import { db, doc, setDoc, arrayRemove } from './firebase.js';
import { esc, eur, int, icon, plural, ago, day, fold, money2, toast, openModal } from './ui.js';
import { saleInvoiceNumber, shortInvoice, saleTime, orderTime, orderTotal, customerDirectory, lookalikeCustomers, VAT, productNetCost
} from './data.js';

const store = {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, String(v)); return true; } catch { return false; } }
};

// ================================================================== general

function renderGeneral(ctx) {
    ctx.setSub('Preferences for this computer, and lists you have built up');
    const services = ctx.model.receiptServices || [], notSame = ctx.model.notSameCustomers || [];
    ctx.body.innerHTML = `
        <div class="cols">
            <section class="panel" style="display:grid;gap:14px">
                <h2 class="panel-title" style="margin:0">This computer</h2>
                <label class="fld">Daily sales goal (€, incl. VAT)<input id="st-goal" type="number" min="0" step="50" value="${esc(store.get('dailyRevenueGoal', '500'))}"><span class="hint">Shown on Today as a progress bar.</span></label>
                <label class="check"><input type="checkbox" id="st-notif"${store.get('notificationsEnabled', 'true') !== 'false' ? ' checked' : ''}><span><b style="font-weight:500">Pop-up when a sale arrives</b><br><span class="empty" style="padding:0">A desktop notification for every new EasyPOS receipt.</span></span></label>
                <label class="check"><input type="checkbox" id="st-sound"${store.get('notificationSound', 'true') !== 'false' ? ' checked' : ''}><span><b style="font-weight:500">With a sound</b></span></label>
                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                    <button class="btn" type="button" id="st-update"${window.electronAPI?.checkForUpdates ? '' : ' disabled'}>${icon('system_update')}Check for updates</button>
                    <span class="muted" id="st-update-msg" style="font-size:12.5px">${window.electronAPI ? 'Danfosal App, desktop' : 'Web version: updates arrive when Hosting is deployed'}</span>
                </div>
            </section>
            <section class="panel" style="display:grid;gap:14px">
                <h2 class="panel-title" style="margin:0">Lists you have built up</h2>
                <div><b style="font-weight:500">Receipt names that are services</b> <span class="muted">(${int(services.length)})</span>
                    <p class="empty" style="margin:2px 0 6px">Marked in Stock › Link receipt items: they carry no stock cost.</p>
                    ${services.length ? `<div class="filters">${services.map(n => `<span class="chip vio">${esc(n)} <button type="button" class="btn ghost small" data-svc="${esc(n)}" aria-label="Remove ${esc(n)}" style="padding:0 2px">${icon('close')}</button></span>`).join('')}</div>` : '<p class="empty" style="margin:0">None yet.</p>'}</div>
                <div><b style="font-weight:500">Customers confirmed as different people</b> <span class="muted">(${int(notSame.length)})</span>
                    <p class="empty" style="margin:2px 0 6px">From Customers › Review names; these pairs aren't suggested again.</p>
                    ${notSame.length ? `<div class="filters">${notSame.map(k => `<span class="chip">${esc(k.replace('|', ' ≠ '))} <button type="button" class="btn ghost small" data-ns="${esc(k)}" aria-label="Suggest this pair again" style="padding:0 2px">${icon('close')}</button></span>`).join('')}</div>` : '<p class="empty" style="margin:0">None yet.</p>'}</div>
            </section>
        </div>`;
    const $ = s => ctx.body.querySelector(s);
    $('#st-goal').addEventListener('change', e => { const v = Math.max(0, Math.round(Number(e.target.value) || 0)); store.set('dailyRevenueGoal', v); toast(`Daily goal: ${eur(v)}`); });
    $('#st-notif').addEventListener('change', e => { store.set('notificationsEnabled', e.target.checked); toast(e.target.checked ? 'Sale pop-ups on' : 'Sale pop-ups off'); });
    $('#st-sound').addEventListener('change', e => { store.set('notificationSound', e.target.checked); });
    $('#st-update').addEventListener('click', async () => {
        const msg = $('#st-update-msg'); msg.textContent = 'Checking…';
        try { const info = await window.electronAPI.checkForUpdates(); msg.textContent = info && info.version ? `Version ${info.version} is available.` : 'You have the latest version.'; }
        catch (e) { msg.textContent = `Couldn't check: ${e.message}`; }
    });
    ctx.body.querySelectorAll('[data-svc]').forEach(b => b.addEventListener('click', async () => {
        if (!await openModal({ title: `“${b.dataset.svc}” is not a service?`, confirmLabel: 'Remove from services', body: '<p>Future receipts with this name will show up in Link receipt items again. Sale lines already marked keep their mark.</p>' })) return;
        try { await setDoc(doc(db, 'settings', 'receiptNames'), { services: arrayRemove(b.dataset.svc) }, { merge: true }); toast('Removed'); await ctx.reload(); }
        catch (e) { toast(`Couldn't save: ${e.message}`, { bad: true }); }
    }));
    ctx.body.querySelectorAll('[data-ns]').forEach(b => b.addEventListener('click', async () => {
        try { await setDoc(doc(db, 'settings', 'customerReview'), { notSame: arrayRemove(b.dataset.ns) }, { merge: true }); toast('This pair will be suggested again in Review names'); await ctx.reload(); }
        catch (e) { toast(`Couldn't save: ${e.message}`, { bad: true }); }
    }));
}

// ================================================================== data health

function renderHealth(ctx) {
    const m = ctx.model, a = ctx.a;
    const checks = [];
    const add = (sev, title, detail, action, rows = []) => checks.push({ sev, title, detail, action, rows });

    // Same invoice number saved twice (the till and PDF import used to allow it).
    // Same receipt number twice. A real duplicate has the same amount and was saved within a day;
    // otherwise the bridge's OCR misread one receipt's number (different day, amount and items) and
    // both are real sales - deleting one would lose a sale.
    const byInv = new Map();
    m.sales.forEach(s => { const full = saleInvoiceNumber(s); if (full) { if (!byInv.has(full)) byInv.set(full, []); byInv.get(full).push(s); } });
    const dupReal = [], misread = [];
    byInv.forEach((list, full) => {
        if (list.length < 2) return;
        const sorted = list.slice().sort((a, b) => saleTime(a) - saleTime(b));
        const twin = sorted.some((s, i) => i && Number(s.total) === Number(sorted[i - 1].total) && Math.abs(saleTime(s) - saleTime(sorted[i - 1])) < 86400000);
        (twin ? dupReal : misread).push([full, sorted]);
    });
    const invRow = ([full, l]) => { const n = shortInvoice(full); return { label: `${n} · ${l.length} sales`, sub: l.map(s => `${day(saleTime(s))}: €${money2(s.total)}${s.clientName && !/walk/i.test(s.clientName) ? ' ' + s.clientName : ''}`).join(' · '), href: `sell.html?q=${encodeURIComponent(n)}#sales` }; };
    add(dupReal.length ? 'warn' : 'ok', dupReal.length ? `${plural(dupReal.length, 'sale is', 'sales are')} saved twice` : 'No sale is saved twice',
        dupReal.length ? 'Same receipt number, same amount, within a day: one is a copy. Open it in Sell and delete the copy (its stock is restored).' : 'No receipt appears twice with the same amount.', null, dupReal.slice(0, 12).map(invRow));
    add(misread.length ? 'info' : 'ok', misread.length ? `${plural(misread.length, 'receipt number was', 'receipt numbers were')} read the same for different sales` : 'Every receipt number is unique',
        misread.length ? 'Different days and amounts: these are separate, real sales whose number the EasyPOS scanner misread. Nothing to delete; search Sell by date or amount instead of number.' : 'The scanner read every receipt number differently.', null, misread.slice(0, 12).map(invRow));

    // Online orders that look entered twice: same customer, same total, same day.
    const seen = new Map(), dupOrders = [];
    m.orders.forEach(o => { const k = `${fold(o.clientName || o.customerName)}|${orderTotal(o)}|${new Date(orderTime(o)).toDateString()}`; if (seen.has(k)) dupOrders.push([seen.get(k), o]); else seen.set(k, o); });
    add(dupOrders.length ? 'info' : 'ok', dupOrders.length ? `${plural(dupOrders.length, 'online order may be', 'online orders may be')} entered twice` : 'No duplicate online orders',
        dupOrders.length ? 'Same customer, same total, same day. It can also be two real orders: check the items before deleting either.' : 'No two orders share customer, total and day.', null,
        dupOrders.slice(0, 12).map(([x]) => ({ label: `${x.clientName || x.customerName} · €${money2(orderTotal(x))}`, sub: day(orderTime(x)), href: `sell.html#online` })));

    // Catalogue: one product under two records splits its stock and sales.
    const byName = new Map();
    m.products.forEach(p => { const k = fold(p.name).replace(/\s+/g, ' ').trim(); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(p); });
    const dupProducts = [...byName].filter(([, l]) => l.length > 1);
    add(dupProducts.length ? 'warn' : 'ok', dupProducts.length ? `${plural(dupProducts.length, 'product exists', 'products exist')} twice in the catalogue` : 'Every product exists once',
        dupProducts.length ? 'Stock and sales are split between the copies. Keep one: move its stock over, link its receipt names, delete the other.' : 'No two catalogue products share a name.', null,
        dupProducts.slice(0, 12).map(([, l]) => ({ label: l[0].name, sub: l.map(p => `${p.code || 'no code'}: ${int(Number(p.stock) || 0)} in stock`).join(' · '), href: `stock.html?q=${encodeURIComponent(l[0].name)}#catalogue` })));

    const negative = m.products.filter(p => Number(p.stock) < 0);
    add(negative.length ? 'bad' : 'ok', negative.length ? `${plural(negative.length, 'product has', 'products have')} stock below zero` : 'No negative stock',
        negative.length ? 'More was sold than was ever booked in. Count them and correct the stock in the catalogue.' : 'Every stock figure is zero or more.', null,
        negative.slice(0, 12).map(p => ({ label: p.name, sub: `${int(p.stock)} in stock`, href: `stock.html?q=${encodeURIComponent(p.name)}#catalogue` })));
    // Selling under what it cost you. Both of today's cases are accessories whose price was
    // typed once and never revisited, while the cost came from a Kaercher invoice.
    const underCost = m.products.map(p => {
        const cost = productNetCost(p), net = (Number(p.price) || 0) / VAT;
        return { p, cost, net, loss: cost && net ? cost - net : 0 };
    }).filter(x => x.loss > 0.5).sort((x, y) => y.loss - x.loss);
    add(underCost.length ? 'bad' : 'ok', underCost.length ? `${plural(underCost.length, 'product is', 'products are')} priced below cost` : 'No product is priced below cost',
        underCost.length ? 'Every one of these sold loses money. Check the price against the supplier invoice and raise it.' : 'Every price covers its cost.', null,
        underCost.slice(0, 12).map(x => ({ label: x.p.name, sub: `sells for €${money2(Number(x.p.price) || 0)} · costs €${money2(x.cost * VAT)} · loses €${money2(x.loss * VAT)} each`, href: `stock.html?q=${encodeURIComponent(x.p.name)}#catalogue` })));

    add(a.needsCount.length ? 'warn' : 'ok', a.needsCount.length ? `${plural(a.needsCount.length, 'product needs', 'products need')} a physical count` : 'No product needs a count', 'Flagged by the stock correction of 14 Sep 2026.', ['Show them', 'stock.html?filter=count#catalogue']);
    add(a.soldWithoutCost.length ? 'warn' : 'ok', a.soldWithoutCost.length ? `${plural(a.soldWithoutCost.length, 'product sold has', 'products sold have')} no cost price` : 'Every product you sell has a cost', 'Profit on those sales is unknown until a cost is entered.', ['Enter costs', 'stock.html?filter=nocost#catalogue']);
    add(a.unmatched.length ? 'warn' : 'ok', a.unmatched.length ? `${plural(a.unmatched.length, 'receipt name isn’t', 'receipt names aren’t')} linked to a product` : 'Every receipt item is linked', 'Unlinked lines neither reduce stock nor count toward profit.', ['Link them', 'stock.html#link']);
    const pairs = lookalikeCustomers(m._directory || (m._directory = customerDirectory(m)), m.notSameCustomers);
    add(pairs.length ? 'info' : 'ok', pairs.length ? `${plural(pairs.length, 'pair', 'pairs')} of customer names may be one customer` : 'No lookalike customer names', 'Merging keeps every sale; nothing is deleted.', ['Review', 'customers.html#review']);

    const easyposAge = a.lastEasypos ? ctx.a.now - a.lastEasypos : Infinity;
    const counts = [['Products', m.products.length], ['Sales', m.sales.length], ['Online orders', m.orders.length], ['Customers', m.customers.length], ['Repairs', m.tickets.length], ['Warranty cards', m.warranties.length], ['Debts', m.debts.length], ['Expenses', m.expenses.length]];
    const problems = checks.filter(c => c.sev !== 'ok').length;
    ctx.setSub(`${problems ? plural(problems, 'check needs', 'checks need') + ' attention' : 'Everything checks out'} · data loaded ${ago(m.loadedAt, ctx.a.now)}`);
    ctx.setActions(`<button class="btn" type="button" id="hl-reload">${icon('refresh')}Check again</button>`).querySelector('#hl-reload').addEventListener('click', () => ctx.reload());
    ctx.body.innerHTML = `
        <div class="kpis">
            <div class="kpi"><small>Database</small><span class="v" style="font-size:20px">${icon('cloud_done')} Connected</span><span class="d">signed in, read ${int(counts.reduce((x, c) => x + c[1], 0))} records</span></div>
            <div class="kpi"><small>EasyPOS receipts</small><span class="v" style="font-size:20px;${easyposAge > 3 * 86400000 ? 'color:var(--warn)' : ''}">${a.lastEasypos ? ago(a.lastEasypos, ctx.a.now) : 'none'}</span><span class="d">last one arrived</span></div>
            <div class="kpi" style="grid-column:span 2"><small>Records</small><span class="d" style="display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:4px">${counts.map(([l, n]) => `<span>${esc(l)} <b style="font-family:var(--mono);color:var(--ink)">${int(n)}</b></span>`).join('')}</span></div>
        </div>
        <div class="todo">${checks.sort((x, y) => ({ bad: 0, warn: 1, info: 2, ok: 3 })[x.sev] - ({ bad: 0, warn: 1, info: 2, ok: 3 })[y.sev]).map(c => `
            <div class="todo-item ${c.sev === 'bad' ? 'crit' : c.sev === 'ok' ? '' : c.sev}"><i style="${c.sev === 'ok' ? 'background:var(--ok)' : ''}"></i>
                <div><b>${c.sev === 'ok' ? icon('check_circle') + ' ' : ''}${esc(c.title)}</b><p>${esc(c.detail)}</p>
                ${c.rows.length ? `<div class="lines" style="margin-top:6px">${c.rows.map(r => `<div class="line"><div><b><a href="${esc(r.href)}" style="text-decoration:none">${esc(r.label)}</a></b><span>${esc(r.sub)}</span></div></div>`).join('')}</div>` : ''}</div>
                ${c.action && c.sev !== 'ok' ? `<a class="btn small" href="${esc(c.action[1])}">${esc(c.action[0])}</a>` : '<span></span>'}</div>`).join('')}</div>`;
}

// ================================================================== tools

function loadScript(src, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.onload = () => resolve(window[globalName]); s.onerror = () => reject(new Error(`Couldn't load ${src.split('/').pop()}.`));
        document.head.appendChild(s);
    });
}

function renderTools(ctx) {
    ctx.setSub('For the rare occasions something needs looking into');
    ctx.body.innerHTML = `
        <div class="cols">
            <section class="panel" style="display:grid;gap:10px">
                <h2 class="panel-title" style="margin:0">Read a file's text</h2>
                <p class="empty" style="margin:0">Shows exactly what the app reads from an invoice PDF or a receipt photo: the PDF's own text when it has one, otherwise OCR. Useful when an import picks up the wrong thing. (Replaces the classic OCR debug page.)</p>
                <label class="dropzone" id="tl-drop" tabindex="0" style="padding:22px">${icon('text_snippet')}<b>Choose a PDF or an image</b><input type="file" id="tl-file" accept="application/pdf,image/*" hidden></label>
                <p class="empty" id="tl-status" style="margin:0"></p>
                <textarea id="tl-out" rows="14" readonly hidden style="width:100%;background:var(--panel-2);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:10px;font-family:var(--mono);font-size:12px"></textarea>
                <div><button class="btn small" type="button" id="tl-copy" hidden>${icon('content_copy')}Copy text</button></div>
            </section>
            <section class="panel" style="display:grid;gap:10px">
                <h2 class="panel-title" style="margin:0">Backup</h2>
                <p class="empty" style="margin:0">Save everything this app reads (products, sales, orders, customers, repairs, warranties, debts, expenses, suppliers, plans) as one JSON file on this computer. The database itself is not changed.</p>
                <div><button class="btn" type="button" id="tl-backup">${icon('download')}Save a backup</button></div>
                <p class="chart-note">Firebase also keeps the data; this is your own copy, e.g. before a big clean-up.</p>
            </section>
        </div>`;
    const $ = s => ctx.body.querySelector(s);
    const input = $('#tl-file');
    $('#tl-drop').addEventListener('click', e => { if (e.target !== input) input.click(); });
    input.addEventListener('change', async () => {
        const file = input.files[0]; if (!file) return;
        const status = $('#tl-status'), out = $('#tl-out');
        try {
            let text = '';
            if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name)) {
                status.textContent = 'Reading the PDF text…';
                const lib = await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
                lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
                for (let n = 1; n <= pdf.numPages; n++) {
                    const items = (await (await pdf.getPage(n)).getTextContent()).items;
                    const rows = new Map();
                    items.forEach(i => { const y = Math.round(i.transform[5]); const k = [...rows.keys()].find(z => Math.abs(z - y) <= 2) ?? y; if (!rows.has(k)) rows.set(k, []); rows.get(k).push({ x: i.transform[4], s: i.str }); });
                    text += `=== page ${n} ===\n` + [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, r]) => r.sort((a, b) => a.x - b.x).map(z => z.s).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n') + '\n';
                }
                status.textContent = text.replace(/[=\s\w]*page \d+ ===/g, '').trim().length > 40 ? `Read from the PDF's own text: exact.` : 'This PDF has no text layer; it is a scan. Importing it will use OCR.';
            } else {
                status.textContent = 'Reading the image with OCR (this takes a little while)…';
                const T = await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js', 'Tesseract');
                text = (await T.recognize(file, 'eng')).data.text;
                status.textContent = 'Read with OCR: letters can be misread.';
            }
            out.value = text; out.hidden = false; $('#tl-copy').hidden = false;
        } catch (e) { status.innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`; }
    });
    $('#tl-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#tl-out').value); toast('Text copied'); } catch { toast('Couldn’t reach the clipboard.', { bad: true }); } });
    $('#tl-backup').addEventListener('click', () => {
        const m = ctx.model;
        const data = Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith('_') && k !== 'loadedAt'));
        const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 1)], { type: 'application/json' });
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `danfosal-backup-${new Date().toISOString().slice(0, 10)}.json` });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        toast('Backup file created');
    });
}

// ================================================================== boot

bootWorkspace({
    active: 'settings', title: 'Settings', defaultTab: 'general',
    tabs: [
        { id: 'general', label: 'General', icon: 'tune', render: renderGeneral },
        { id: 'health', label: 'Data health', icon: 'health_and_safety', render: renderHealth },
        { id: 'tools', label: 'Tools', icon: 'construction', render: renderTools }
    ]
});
