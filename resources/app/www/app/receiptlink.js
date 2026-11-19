// Writes the links between online orders and their easyPOS receipts (Finding #87). The pairs are
// found in orderreceipts.js when the data loads; this puts them in the database: both sides
// linked, an order that was still open moved to Processing ("being prepared", the receipt was
// printed), and stock given back when the order had taken it and the receipt took it again.
// One transaction per pair, so two devices opening the app at once can't do it twice.
import { db, doc, runTransaction, increment, updateDoc, setDoc, deleteField, arrayUnion } from './firebase.js';
import { linkUpdates } from './orderreceipts.js';

async function writeLink(m, o, s, how) {
    const knownIds = new Set((m.products || []).map(p => p._id));
    return runTransaction(db, async tx => {
        const oRef = doc(db, 'onlineOrders', o._id), sRef = doc(db, 'storeSales', s._id);
        const oSnap = await tx.get(oRef), sSnap = await tx.get(sRef);
        if (!oSnap.exists() || !sSnap.exists()) return false;
        const fresh = { _id: o._id, ...oSnap.data() }, freshSale = { _id: s._id, ...sSnap.data() };
        if (fresh.receiptSaleId || freshSale.onlineOrderId) return false;          // done already
        const u = linkUpdates(fresh, freshSale, Date.now(), { knownIds });
        tx.update(oRef, { ...u.order, receiptLinkedBy: how });
        tx.update(sRef, u.sale);
        u.stockBack.forEach(b => tx.update(doc(db, 'products', b.productId), { stock: increment(b.qty) }));
        Object.assign(o, u.order, { receiptLinkedBy: how }); Object.assign(s, u.sale);
        return true;
    });
}

// The automatic pairs of this load (strong / exact). Returns how many were written.
export async function linkNewReceipts(m) {
    if (!m || !m.receiptPairs) return 0;
    const orders = new Map(m.orders.map(o => [o._id, o])), sales = new Map(m.sales.map(s => [s._id, s]));
    let n = 0;
    for (const [oid, p] of m.receiptPairs.pairs) {
        if (p.how === 'linked') continue;
        const o = orders.get(oid), s = sales.get(p.saleId);
        if (!o || !s) continue;
        try { if (await writeLink(m, o, s, p.how)) n++; } catch (e) { console.warn('Couldn’t link an online order to its receipt', e); }
    }
    return n;
}

// The owner's own choices in Online orders.
export const linkReceipt = (m, o, s) => writeLink(m, o, s, 'owner');

export async function unlinkReceipt(o, saleId) {
    await updateDoc(doc(db, 'onlineOrders', o._id), { receiptSaleId: deleteField(), receiptLinkedAt: deleteField(), receiptLinkedBy: deleteField() });
    await updateDoc(doc(db, 'storeSales', saleId), { onlineOrderId: deleteField() });
    await notSamePair(o._id, saleId);
}

export const notSamePair = (orderId, saleId) => setDoc(doc(db, 'settings', 'orderReceipts'), { notSame: arrayUnion(`${orderId}|${saleId}`) }, { merge: true });
