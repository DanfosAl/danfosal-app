// Firestore read/write helpers shared across the Garanci screens. Each page creates its own
// Firebase app instance (same convention as the rest of Danfosal App) and passes `db` in here.
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export function toMillis(ts) {
    if (!ts) return 0;
    if (ts.toMillis) return ts.toMillis();
    if (ts.seconds) return ts.seconds * 1000;
    const parsed = new Date(ts).getTime();
    return isNaN(parsed) ? 0 : parsed;
}

// Keep the Albanian labels even when Electron's bundled ICU falls back to English.
export const shortWeekdaysAlb = ['Die', 'Hën', 'Mar', 'Mër', 'Enj', 'Pre', 'Sht'];
export function formatDayAlb(value) {
    const d = new Date(toMillis(value));
    if (!Number.isFinite(d.getTime())) return '';
    const days = ['E diel', 'E hënë', 'E martë', 'E mërkurë', 'E enjte', 'E premte', 'E shtunë'];
    const months = ['janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor', 'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor'];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// Best-effort city guess from the messy free-text `address` field on imported customer
// records (there is no dedicated city column) — takes the second-to-last comma segment,
// which is where "Elbasan", "Fier", "Tirane" etc. tend to land in EasyPOS-imported addresses.
// Known data-quality limitation, not solved here; returns '' when nothing plausible is found.
export function guessCity(address) {
    if (!address) return '';
    const parts = String(address).split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) return '';
    const candidate = parts[parts.length - 2];
    if (candidate && candidate.length <= 24 && !/\d/.test(candidate)) return candidate;
    return '';
}

export async function loadRecentInvoices(db, n = 5) {
    const [storeSnap, onlineSnap] = await Promise.all([
        getDocs(collection(db, 'storeSales')),
        getDocs(collection(db, 'onlineOrders'))
    ]);
    const all = [];
    storeSnap.forEach(d => all.push({ id: d.id, collectionName: 'storeSales', ...d.data() }));
    onlineSnap.forEach(d => all.push({ id: d.id, collectionName: 'onlineOrders', ...d.data() }));
    all.sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));
    return all.slice(0, n);
}

// Customer + purchase-history lookup, ported from service-tickets.html's loadCustomerData().
// Extended here with nipt/city since the claim screen's customer search needs them.
export async function loadCustomerDirectory(db) {
    const [ordersSnap, salesSnap, customersSnap] = await Promise.all([
        getDocs(collection(db, 'onlineOrders')),
        getDocs(collection(db, 'storeSales')),
        getDocs(collection(db, 'customers'))
    ]);
    const purchasesByName = {};
    const namesSeen = {};

    function ingest(docSnap, collectionName) {
        const data = docSnap.data();
        const name = (data.clientName || data.customerName || '').trim();
        if (!name) return;
        const key = name.toLowerCase();
        if (!purchasesByName[key]) purchasesByName[key] = [];
        (data.items || []).forEach((item, itemIndex) => {
            purchasesByName[key].push({
                name: item.name || item.product || 'Item',
                serialNumber: item.serialNumber || '',
                saleId: docSnap.id,
                collectionName,
                itemIndex,
                invoiceNumber: data.invoiceNumber || '',
                date: data.timestamp
            });
        });
        if (!namesSeen[key]) {
            namesSeen[key] = {
                name,
                phone: data.telephone || data.phoneNumber || data.clientPhone || '',
                nipt: '',
                city: guessCity(data.address || data.customerAddress || ''),
                customerId: null
            };
        }
    }

    ordersSnap.forEach(d => ingest(d, 'onlineOrders'));
    salesSnap.forEach(d => ingest(d, 'storeSales'));

    // customers/{id} profiles are authoritative for phone/nipt and the only source of a real
    // customerId to write back to — same precedence rule used in service-tickets.html.
    customersSnap.forEach(docSnap => {
        const data = docSnap.data();
        const name = (data.name || '').trim();
        if (!name) return;
        const key = name.toLowerCase();
        if (!namesSeen[key]) namesSeen[key] = { name, phone: '', nipt: '', city: guessCity(data.address || ''), customerId: null };
        if (data.phone) namesSeen[key].phone = data.phone;
        if (data.nipt) namesSeen[key].nipt = data.nipt;
        if (!namesSeen[key].city) namesSeen[key].city = guessCity(data.address || '');
        namesSeen[key].customerId = docSnap.id;
    });

    return { customerPurchases: purchasesByName, customerDirectory: Object.values(namesSeen) };
}

// Maps saleId -> warrantyCards doc, for the whole set of sales a customer's items came from.
// A card covers every item issued on the same invoice at once, so matching by saleId alone
// is a reasonable approximation (mixed-item sales issued only partially are rare here).
export async function loadWarrantyCardsBySaleIds(db, saleIds) {
    const uniqueIds = [...new Set(saleIds)].filter(Boolean);
    if (uniqueIds.length === 0) return {};
    const map = {};
    // Firestore 'in' queries cap at 30 values — chunk defensively even though a single
    // customer's purchase list will practically never exceed that.
    for (let i = 0; i < uniqueIds.length; i += 30) {
        const chunk = uniqueIds.slice(i, i + 30);
        const snap = await getDocs(query(collection(db, 'warrantyCards'), where('saleId', 'in', chunk)));
        snap.forEach(d => { map[d.data().saleId] = { id: d.id, ...d.data() }; });
    }
    return map;
}
