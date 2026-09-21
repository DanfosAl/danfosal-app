// Global search / command palette. Opens with Ctrl+K (or Cmd+K on Mac).
// Self-contained: injects its own UI and styles, does its own Firestore reads.
// Safe to include on any page via: <script type="module" src="global-search.js" defer></script>

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyDUtblUqNiSCmC4kRjikE7D2kba0Mhxej4",
    authDomain: "danfosal-app.firebaseapp.com",
    projectId: "danfosal-app",
    storageBucket: "danfosal-app.appspot.com",
    messagingSenderId: "565855692028",
    appId: "1:565855692028:web:c7cb647497cb3df9452379",
    measurementId: "G-50JPG2KKEC"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Static page index — every real, user-facing destination in the app.
const PAGES = [
    { name: 'Today', file: 'index.html', icon: 'home' },
    { name: 'Sell: all sales', file: 'sell.html#sales', icon: 'receipt_long' },
    { name: 'Sell: new sale (till)', file: 'sell.html#new', icon: 'point_of_sale' },
    { name: 'Online Orders', file: 'online-orders.html', icon: 'shopping_cart' },
    { name: 'Stock: catalogue', file: 'stock.html#catalogue', icon: 'inventory_2' },
    { name: 'Stock: reorder', file: 'stock.html#reorder', icon: 'local_shipping' },
    { name: 'Customers', file: 'customers.html', icon: 'people' },
    { name: 'Service: repairs', file: 'service.html#tickets', icon: 'build' },
    { name: 'Service: warranty cards', file: 'service.html#warranties', icon: 'shield' },
    { name: 'Money: owed to you', file: 'money.html#owed', icon: 'balance' },
    { name: 'Insights', file: 'insights.html', icon: 'insights' },
    { name: 'To Order / Procurement', file: 'to_order.html', icon: 'playlist_add_check' },
    { name: 'Annual Prediction', file: 'smart-prediction.html', icon: 'insights' },
    { name: 'Settings', file: 'settings.html', icon: 'settings' },
    { name: 'Forecasts', file: 'business-intelligence.html', icon: 'psychology' },
    { name: 'Expenses & Profit', file: 'expenses.html', icon: 'payments' },
    { name: 'Creditors', file: 'creditors_list.html', icon: 'balance' },
    { name: 'Import Sales History', file: 'import-sales-history.html', icon: 'upload_file' },
    { name: 'Albanian Invoice Scanner', file: 'albanian-invoice-scanner.html', icon: 'document_scanner' },
    { name: 'Smart Inventory Scanner', file: 'smart-inventory-scanner.html', icon: 'document_scanner' },
];

let dataLoaded = false;
let products = [];
let customers = [];
let debtors = [];
let creditors = [];

async function loadDataOnce() {
    if (dataLoaded) return;
    dataLoaded = true;
    try {
        const [productsSnap, customersSnap, debtorsSnap, creditorsSnap] = await Promise.all([
            getDocs(collection(db, 'products')),
            getDocs(collection(db, 'customers')),
            getDocs(collection(db, 'debtors')),
            getDocs(collection(db, 'creditors')),
        ]);
        products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        customers = customersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        debtors = debtorsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        creditors = creditorsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error('Global search: failed to load data', err);
    }
    renderResults(input.value);
}

function search(term) {
    const t = term.trim().toLowerCase();
    if (!t) {
        return PAGES.slice(0, 8).map(p => ({ type: 'page', label: p.name, sub: 'Page', icon: p.icon, action: () => go(p.file) }));
    }

    const results = [];

    PAGES.forEach(p => {
        if (p.name.toLowerCase().includes(t)) {
            results.push({ type: 'page', label: p.name, sub: 'Page', icon: p.icon, action: () => go(p.file) });
        }
    });

    products.forEach(p => {
        const name = (p.name || '').toLowerCase();
        const code = (p.code || '').toLowerCase();
        if (name.includes(t) || code.includes(t)) {
            results.push({
                type: 'product', label: p.name || 'Unnamed product', sub: `Product${p.code ? ' · ' + p.code : ''}`, icon: 'inventory_2',
                action: () => go(`stock.html?q=${encodeURIComponent(p.name || '')}#catalogue`)
            });
        }
    });

    customers.forEach(c => {
        if ((c.name || '').toLowerCase().includes(t)) {
            results.push({
                type: 'customer', label: c.name, sub: 'Customer', icon: 'person',
                action: () => go(`customers.html?q=${encodeURIComponent(c.name)}#all`)
            });
        }
    });

    debtors.forEach(d => {
        if ((d.customerName || d.name || '').toLowerCase().includes(t)) {
            results.push({
                type: 'debtor', label: d.customerName || d.name, sub: 'Debtor', icon: 'balance',
                action: () => go('money.html#owed')
            });
        }
    });

    creditors.forEach(c => {
        if ((c.name || '').toLowerCase().includes(t)) {
            results.push({
                type: 'creditor', label: c.name, sub: 'Creditor', icon: 'balance',
                action: () => go(`creditor_detail.html?id=${c.id}`)
            });
        }
    });

    return results.slice(0, 10);
}

function go(url) {
    window.location.href = url;
}

// --- UI ---
const style = document.createElement('style');
style.textContent = `
#gs-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 99999; display: none; align-items: flex-start; justify-content: center; padding-top: 12vh; font-family: 'Inter', Arial, sans-serif; }
#gs-overlay.open { display: flex; }
#gs-panel { width: 90%; max-width: 560px; background: #1e293b; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); overflow: hidden; }
#gs-input { width: 100%; box-sizing: border-box; padding: 16px 18px; font-size: 16px; background: transparent; border: none; outline: none; color: #f8fafc; border-bottom: 1px solid rgba(255,255,255,0.08); }
#gs-input::placeholder { color: #64748b; }
#gs-results { max-height: 50vh; overflow-y: auto; padding: 6px; }
.gs-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; cursor: pointer; color: #e2e8f0; }
.gs-item.active, .gs-item:hover { background: rgba(99,102,241,0.2); }
.gs-item .material-symbols-outlined { font-size: 20px; color: #94a3b8; }
.gs-item-label { font-weight: 600; font-size: 14px; }
.gs-item-sub { font-size: 12px; color: #94a3b8; }
#gs-empty { padding: 24px; text-align: center; color: #64748b; font-size: 14px; }
#gs-hint { padding: 8px 14px; font-size: 11px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.08); }
`;
document.head.appendChild(style);

const overlay = document.createElement('div');
overlay.id = 'gs-overlay';
overlay.innerHTML = `
  <div id="gs-panel">
    <input id="gs-input" type="text" placeholder="Search pages, products, customers, debtors, creditors...">
    <div id="gs-results"></div>
    <div id="gs-hint">↑↓ to navigate · Enter to select · Esc to close</div>
  </div>
`;
document.body.appendChild(overlay);

const input = document.getElementById('gs-input');
const resultsEl = document.getElementById('gs-results');
let activeIndex = 0;
let currentResults = [];

function renderResults(term) {
    currentResults = search(term);
    activeIndex = 0;
    if (currentResults.length === 0) {
        resultsEl.innerHTML = `<div id="gs-empty">No matches. Try a different term.</div>`;
        return;
    }
    resultsEl.innerHTML = currentResults.map((r, i) => `
        <div class="gs-item${i === 0 ? ' active' : ''}" data-index="${i}">
            <span class="material-symbols-outlined">${r.icon}</span>
            <div>
                <div class="gs-item-label">${r.label}</div>
                <div class="gs-item-sub">${r.sub}</div>
            </div>
        </div>
    `).join('');
}

function setActive(index) {
    const items = resultsEl.querySelectorAll('.gs-item');
    items.forEach(el => el.classList.remove('active'));
    if (items[index]) {
        items[index].classList.add('active');
        items[index].scrollIntoView({ block: 'nearest' });
    }
    activeIndex = index;
}

function openPalette() {
    overlay.classList.add('open');
    input.value = '';
    renderResults('');
    input.focus();
    loadDataOnce();
}

function closePalette() {
    overlay.classList.remove('open');
}

document.addEventListener('keydown', (e) => {
    const isCmdK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
    if (isCmdK) {
        e.preventDefault();
        overlay.classList.contains('open') ? closePalette() : openPalette();
        return;
    }
    if (!overlay.classList.contains('open')) return;

    if (e.key === 'Escape') {
        e.preventDefault();
        closePalette();
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(Math.min(activeIndex + 1, currentResults.length - 1));
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (currentResults[activeIndex]) currentResults[activeIndex].action();
    }
});

input.addEventListener('input', (e) => renderResults(e.target.value));

resultsEl.addEventListener('click', (e) => {
    const item = e.target.closest('.gs-item');
    if (item) {
        const idx = parseInt(item.dataset.index);
        if (currentResults[idx]) currentResults[idx].action();
    }
});

overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePalette();
});
