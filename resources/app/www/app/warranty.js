// Warranty card: the same record the classic till and Danfos Garanci read - warrantyCards
// {saleId, saleType, customerName, items[{name, serialNumber}], location, createdAt} - with the
// serials written back onto the sale (storeSales) or online order (onlineOrders), then the print page.
import { db, collection, doc, addDoc, updateDoc, Timestamp } from './firebase.js';
import { esc, int, toast, openModal } from './ui.js';
import { WALKIN, saleTime, orderTime } from './data.js';

export async function warrantyDialog(ctx, sale, { customer = '', saleType = 'storeSale', coll = 'storeSales' } = {}) {
    const items = sale.items || [];
    const ok = await openModal({
        title: 'Warranty card', confirmLabel: 'Save and print',
        body: `<div style="display:grid;gap:8px">${items.map((it, i) => `<label class="check"><input type="checkbox" data-wi="${i}" checked><span><b style="font-weight:500">${esc(it.name)}</b> × ${int(Number(it.quantity) || 1)}</span></label>`).join('')}</div>
            <label class="fld">Customer<input id="w-customer" value="${esc(customer || ((sale.clientName || sale.customerName) && !WALKIN.test(sale.clientName || sale.customerName) ? (sale.clientName || sale.customerName) : ''))}"></label>
            <label class="fld">Serial numbers<input id="w-serial" placeholder="One per machine, separated by commas" value="${esc(items.map(i => i.serialNumber).filter(Boolean).join(', '))}"><span class="hint">In the same order as the ticked items.</span></label>`,
        validate: m => !m.querySelectorAll('[data-wi]:checked').length ? 'Tick at least one item.' : !m.querySelector('#w-customer').value.trim() ? 'Enter the customer name.' : !m.querySelector('#w-serial').value.trim() ? 'Enter the serial number.' : ''
    });
    if (!ok) return;
    const picked = [...ok.querySelectorAll('[data-wi]:checked')].map(c => Number(c.dataset.wi));
    const customerName = ok.querySelector('#w-customer').value.trim();
    const serialText = ok.querySelector('#w-serial').value.trim();
    const serials = serialText.split(',').map(s => s.trim()).filter(Boolean);
    const cardItems = picked.map((idx, n) => ({ name: items[idx].name, serialNumber: serials[n] || (serials.length === 1 ? serials[0] : '') }));
    try {
        await addDoc(collection(db, 'warrantyCards'), { saleId: sale._id || null, saleType, customerName, items: cardItems, location: 'Danfos', createdAt: Timestamp.now() });
        if (sale._id) {
            const updated = items.map((it, i) => { const pos = picked.indexOf(i); return pos === -1 ? it : { ...it, serialNumber: cardItems[pos].serialNumber }; });
            await updateDoc(doc(db, coll, sale._id), { items: updated });
        }
        toast('Warranty card saved');
    } catch (e) { toast(`Couldn't save the warranty card: ${e.message}`, { bad: true }); return; }
    const dateStr = new Date(saleTime(sale) || orderTime(sale) || Date.now()).toLocaleDateString('en-GB');
    window.open(`warranty-card.html?product=${encodeURIComponent(cardItems.map(c => c.name).join(', '))}&serial=${encodeURIComponent(serialText)}&buyer=${encodeURIComponent(customerName)}&date=${dateStr}&location=Danfos`, '_blank');
    await ctx.reload();
}
