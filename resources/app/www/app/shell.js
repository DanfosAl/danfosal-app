// App shell: one sidebar, one search, the same on every new screen.
//
// Replaces three competing navigation systems (the dashboard's tile grid, Store Sales' own
// sidebar and Analytics' own sidebar). Until each workspace is rebuilt, its entries open the
// existing "classic" screens, which is why every flyout says so.
import { esc, icon, eur, int, ago, day } from './ui.js';
import { saleTime, saleInvoiceNumber, shortInvoice, WALKIN, customerKey, orderTotal, orderTime, productIdOfLine } from './data.js';

export const NAV = [
    { id: 'today', label: 'Today', icon: 'sunny', href: 'index.html' },
    { id: 'sell', label: 'Sell', icon: 'point_of_sale', href: 'sell.html', pages: [
        ['All sales', 'sell.html#sales', 'receipt_long'],
        ['New sale', 'sell.html#new', 'point_of_sale'],
        ['Import invoice (PDF)', 'albanian-invoice-scanner.html', 'document_scanner', 'classic'],
        ['Online orders', 'online-orders.html', 'shopping_bag', 'classic']] },
    { id: 'stock', label: 'Stock', icon: 'inventory_2', href: 'stock.html', pages: [
        ['Catalogue', 'stock.html#catalogue', 'inventory_2'],
        ['Reorder', 'stock.html#reorder', 'local_shipping'],
        ['Link receipt items', 'stock.html#link', 'link'],
        ['Order list', 'to_order.html', 'list_alt', 'classic'],
        ['Receive delivery', 'smart-inventory-scanner.html', 'move_to_inbox', 'classic'],
        ['Yearly plan', 'smart-prediction.html', 'event_note', 'classic']] },
    { id: 'customers', label: 'Customers', icon: 'group', href: 'customers.html', pages: [
        ['Customers', 'customers.html#all', 'group'],
        ['Review names', 'customers.html#review', 'merge']] },
    { id: 'service', label: 'Service', icon: 'build', href: 'service.html', pages: [
        ['Repairs', 'service.html#tickets', 'build'],
        ['Warranty cards', 'service.html#warranties', 'verified']] },
    { id: 'money', label: 'Money', icon: 'account_balance_wallet', href: 'debts.html', pages: [
        ['Debts', 'debts.html', 'account_balance_wallet', 'classic'],
        ['Expenses', 'expenses.html', 'payments', 'classic']] },
    { id: 'insights', label: 'Insights', icon: 'insights', href: 'analytics.html', pages: [
        ['Analytics', 'analytics.html', 'monitoring', 'classic'],
        ['Advanced analytics', 'advanced-analytics.html', 'query_stats', 'classic'],
        ['Forecasts', 'business-intelligence.html', 'trending_up', 'classic'],
        ['Executive report', 'executive-report.html', 'description', 'classic']] }
];
export const SETTINGS_NAV = { id: 'settings', label: 'Settings', icon: 'settings', href: 'settings.html', pages: [
    ['Settings', 'settings.html', 'settings', 'classic'],
    ['Fix stock', 'fix-stock.html', 'build_circle', 'classic'],
    ['Check duplicates', 'check-duplicates.html', 'content_copy', 'classic'],
    ['Check Firebase', 'check-firebase.html', 'cloud_done', 'classic'],
    ['OCR debug', 'debug-ocr-extraction.html', 'bug_report', 'classic'],
    ['Import sales history', 'import-sales-history.html', 'upload_file', 'classic'],
    ['Classic dashboard', 'classic-dashboard.html', 'dashboard', 'classic']] };

function navItem(item, active, counts) {
    const current = item.id === active ? ' aria-current="page"' : '';
    const count = counts[item.id];
    const badge = count ? `<span class="nav-count${count.hot ? ' hot' : ''}">${int(count.n)}</span>` : '';
    const anyClassic = (item.pages || []).some(p => p[3] === 'classic');
    const flyout = item.pages ? `
        <div class="flyout" role="menu" aria-label="${esc(item.label)}">
            <h4>${esc(item.label)}</h4>
            ${item.pages.map(([label, href, ic, kind]) => `<a role="menuitem" href="${href}">${icon(ic)}${esc(label)}${kind === 'classic' ? '<span class="tag">classic</span>' : ''}</a>`).join('')}
            ${anyClassic ? '<p class="note">Classic screens keep working until they are rebuilt.</p>' : ''}
        </div>` : '';
    return `<div class="nav-item">
        <a class="nav-link" href="${item.href}"${current}>${icon(item.icon)}${esc(item.label)}${badge}</a>${flyout}
    </div>`;
}

export function mountShell({ active = 'today', counts = {} } = {}) {
    const root = document.getElementById('app');
    root.innerHTML = `
    <div class="shell">
        <aside class="side" aria-label="Main">
            <a class="brand" href="index.html"><img src="assets/danfosal-logo.png" alt=""><span><b>Danfosal</b><small>Danfos Sh.P.K</small></span></a>
            <nav class="nav" id="nav">${NAV.map(i => navItem(i, active, counts)).join('')}</nav>
            <div class="side-foot">
                <nav class="nav">${navItem(SETTINGS_NAV, active, counts)}</nav>
                <div class="pipe" id="pipe" aria-live="polite"><b><span class="dot"></span>EasyPOS</b><span>Checking…</span></div>
            </div>
        </aside>
        <div class="main">
            <div class="topbar">
                <button class="search-trigger" id="open-search" type="button">${icon('search')}Search customers, products, invoices…<span class="kbd">Ctrl K</span></button>
                <span class="today-date">${esc(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</span>
            </div>
            <main id="content" tabindex="-1"></main>
        </div>
    </div>`;
    document.getElementById('open-search').addEventListener('click', openPalette);
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    });
    return document.getElementById('content');
}

// Sidebar badges, the same on every screen.
export function navCountsFor(a) {
    const stock = a.reorder.length + a.needsCount.length + a.unmatched.length;
    return {
        stock: stock ? { n: stock, hot: a.reorder.length > 0 } : null,
        service: a.openTickets.length ? { n: a.openTickets.length } : null
    };
}

export function setNavCounts(active, counts) {
    const nav = document.getElementById('nav');
    if (nav) nav.innerHTML = NAV.map(i => navItem(i, active, counts)).join('');
}

// Pipeline health from the data itself: the renderer can't see Windows services, but it can see
// when the last EasyPOS receipt arrived. The bridge once died for four days unnoticed.
export function setPipelineStatus(lastMs, now = Date.now()) {
    const el = document.getElementById('pipe'); if (!el) return;
    const hours = lastMs ? (now - lastMs) / 3600000 : Infinity;
    const state = hours < 48 ? 'ok' : hours < 96 ? 'warn' : 'bad';
    const label = state === 'ok' ? 'EasyPOS live' : state === 'warn' ? 'EasyPOS quiet' : 'EasyPOS silent';
    el.innerHTML = `<b><span class="dot ${state}"></span>${label}</b><span>Last receipt ${esc(ago(lastMs, now))}</span>`;
}

// ------------------------------------------------------------------ command palette (Ctrl K)

const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Words people actually type for each screen, in English and Albanian - "reorder" should find the
// Order list even though it isn't called that.
const SYNONYMS = {
    'sell.html#new': 'sell till pos cash register shitje arka new sale',
    'sell.html#sales': 'sales receipts invoices history shitjet fatura',
    'stock.html#catalogue': 'products stock inventory produkte magazina catalogue prices cost',
    'stock.html#reorder': 'reorder order purchase buy porosit furnizim unsold dead stock',
    'stock.html#link': 'link map receipt unmatched unlinked lidh',
    'store-sales.html': 'sell till pos cash register shitje arka',
    'albanian-invoice-scanner.html': 'pdf scan scanner fature e-invoice platforma',
    'online-orders.html': 'instagram porosi web',
    'products.html': 'products stock inventory produkte magazina',
    'to_order.html': 'reorder order purchase buy porosit furnizim',
    'smart-inventory-scanner.html': 'delivery supplier receive furnizues',
    'smart-prediction.html': 'forecast plan annual procurement',
    'customers.html#all': 'clients klient kliente vip loyalty segments regulars',
    'customers.html#review': 'duplicates merge lookalike spelling',
    'service.html#tickets': 'repair servis riparim ticket',
    'service.html#warranties': 'warranty garanci certificate',
    'debts.html': 'owed borxh debitor kredit',
    'expenses.html': 'shpenzime costs',
    'analytics.html': 'reports raporte charts',
    'executive-report.html': 'pdf report export',
    'fix-stock.html': 'count inventory correction'
};
let index = NAV.flatMap(n => (n.pages || [[n.label, n.href, n.icon]]).map(([label, href, ic]) => ({ group: 'Go to', label, sub: n.pages ? n.label : '', href, ic, text: fold(`${label} ${n.label} ${SYNONYMS[href] || ''}`) })))
    .concat(SETTINGS_NAV.pages.map(([label, href, ic]) => ({ group: 'Go to', label, sub: 'Settings', href, ic, text: fold(`${label} settings ${SYNONYMS[href] || ''}`) })));
const PAGES = index;

// Build the searchable index once data has loaded: products, customers and invoices.
export function setSearchData(model) {
    // How often each product has been sold, so equal matches list the one you actually sell first.
    const knownIds = new Set(model.products.map(p => p._id));
    const soldLines = {};
    model.sales.forEach(s => (s.items || []).forEach(it => {
        const pid = productIdOfLine(it, knownIds);
        if (pid) soldLines[pid] = (soldLines[pid] || 0) + 1;
    }));
    const products = model.products.map(p => ({
        popularity: soldLines[p._id] || 0,
        group: 'Products', label: p.name || '?', ic: 'inventory_2',
        sub: [p.code, `${int(Number(p.stock) || 0)} in stock`].filter(Boolean).join(' · '),
        end: Number(p.price) ? eur(p.price, 2) : '',
        href: `stock.html?q=${encodeURIComponent(p.name || '')}#catalogue`,
        text: fold(`${p.name} ${p.code || ''}`)
    }));
    const lastBuy = new Map();
    const remember = (name, t, amount) => {
        if (!name || WALKIN.test(name)) return;
        const k = customerKey(name); const prev = lastBuy.get(k);
        if (!prev || t > prev.t) lastBuy.set(k, { name: String(name).trim(), t, amount });
    };
    model.sales.forEach(s => remember(s.clientName || s.customerName, saleTime(s), Number(s.total) || 0));
    model.orders.forEach(o => remember(o.clientName || o.customerName, orderTime(o), orderTotal(o)));
    model.customers.forEach(c => { const k = customerKey(c.name); if (c.name && !lastBuy.has(k) && !WALKIN.test(c.name)) lastBuy.set(k, { name: c.name, t: NaN, amount: 0 }); });
    const customers = [...lastBuy.values()].map(c => ({
        group: 'Customers', label: c.name, ic: 'person',
        sub: isNaN(c.t) ? 'No purchases yet' : `Last purchase ${day(c.t)}`,
        end: c.amount ? eur(c.amount) : '',
        href: `customers.html?q=${encodeURIComponent(c.name)}#all`,
        text: fold(c.name)
    }));
    const invoices = model.sales.filter(s => saleInvoiceNumber(s)).map(s => {
        const who = s.clientName || s.customerName || '';
        const named = who && !WALKIN.test(who);
        const num = saleInvoiceNumber(s);
        return {
            group: 'Invoices', label: `${s.type === 'easypos' ? 'Receipt' : 'Invoice'} ${shortInvoice(num)}`, ic: 'receipt_long',
            sub: `${named ? who : 'Walk-in'} · ${isNaN(saleTime(s)) ? '' : day(saleTime(s))}`,
            end: eur(Number(s.total) || 0, 2),
            href: `sell.html?q=${encodeURIComponent(shortInvoice(num))}#sales`,
            text: fold(`${num} ${shortInvoice(num)} ${who}`)
        };
    });
    index = PAGES.concat(products, customers, invoices);
}

const LIMITS = { 'Go to': 5, Products: 6, Customers: 5, Invoices: 5 };

function search(query) {
    const q = fold(query).trim();
    if (!q) return PAGES.slice(0, 8);
    const terms = q.split(/\s+/);
    const scored = [];
    for (const item of index) {
        const hay = item.text || fold(`${item.label} ${item.sub}`);
        if (!terms.every(t => hay.includes(t))) continue;
        const label = fold(item.label);
        // Name matches first; among equals, the product you sell most; then the shorter name.
        scored.push({ item, score: (label.startsWith(q) ? 3 : 0) + (label.includes(q) ? 1 : 0) + Math.min(item.popularity || 0, 50) / 100 - label.length / 200 });
    }
    scored.sort((a, b) => b.score - a.score);
    const used = {};
    return scored.map(s => s.item).filter(it => (used[it.group] = (used[it.group] || 0) + 1) <= (LIMITS[it.group] || 5))
        .sort((a, b) => Object.keys(LIMITS).indexOf(a.group) - Object.keys(LIMITS).indexOf(b.group));
}

function openPalette() {
    if (document.getElementById('palette')) return;
    const opener = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'palette-backdrop'; wrap.id = 'palette';
    wrap.innerHTML = `
        <div class="palette" role="dialog" aria-modal="true" aria-label="Search">
            <div class="palette-input">${icon('search')}
                <input id="palette-q" type="text" placeholder="Search customers, products, invoices, screens" autocomplete="off"
                       role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list">
                <span class="kbd">Esc</span></div>
            <div class="palette-results" id="palette-list" role="listbox"></div>
            <div class="palette-foot"><span>↑ ↓ move</span><span>↵ open</span><span>Esc close</span></div>
        </div>`;
    document.body.appendChild(wrap);
    const input = wrap.querySelector('#palette-q');
    const list = wrap.querySelector('#palette-list');
    let results = [], selected = 0;

    const close = () => { wrap.remove(); if (opener && opener.focus) opener.focus(); };
    const go = i => { const r = results[i]; if (r) window.location.href = r.href; };
    const render = () => {
        results = search(input.value);
        selected = Math.min(selected, Math.max(results.length - 1, 0));
        if (!results.length) { list.innerHTML = `<div class="palette-empty">Nothing matches "${esc(input.value)}".</div>`; return; }
        let html = '', group = '';
        results.forEach((r, i) => {
            if (r.group !== group) { group = r.group; html += `<div class="palette-group">${esc(group)}</div>`; }
            html += `<div class="palette-opt" role="option" id="opt-${i}" data-i="${i}" aria-selected="${i === selected}">
                ${icon(r.ic)}<div><b>${esc(r.label)}</b>${r.sub ? `<span class="sub">${esc(r.sub)}</span>` : ''}</div><span class="end">${esc(r.end || '')}</span></div>`;
        });
        list.innerHTML = html;
        input.setAttribute('aria-activedescendant', `opt-${selected}`);
        const sel = list.querySelector(`[data-i="${selected}"]`); if (sel) sel.scrollIntoView({ block: 'nearest' });
    };
    input.addEventListener('input', () => { selected = 0; render(); });
    input.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(selected + 1, results.length - 1); render(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(selected - 1, 0); render(); }
        else if (e.key === 'Enter') { e.preventDefault(); go(selected); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    list.addEventListener('click', e => { const opt = e.target.closest('.palette-opt'); if (opt) go(Number(opt.dataset.i)); });
    // Hover only moves the highlight; re-rendering here would scroll the list under the pointer.
    list.addEventListener('mousemove', e => {
        const opt = e.target.closest('.palette-opt');
        if (!opt || Number(opt.dataset.i) === selected) return;
        const prev = list.querySelector(`[data-i="${selected}"]`); if (prev) prev.setAttribute('aria-selected', 'false');
        selected = Number(opt.dataset.i);
        opt.setAttribute('aria-selected', 'true');
        input.setAttribute('aria-activedescendant', `opt-${selected}`);
    });
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
    render();
    input.focus();
}
