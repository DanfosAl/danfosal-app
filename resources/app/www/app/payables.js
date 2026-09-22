// Recording a supplier invoice you'll pay later (Money > You owe). Shared by Money and by
// Stock > Receive delivery; kept apart from money.js because importing a workspace boots it.
// Classic shape: creditors/{id} {name}, creditors/{id}/invoices/{id} {invoiceNumber, totalAmount,
// date, timestamp, remainingBalance, paid, dueDate?}.
import { db, collection, addDoc } from './firebase.js';
import { customerKey } from './data.js';

const r2 = n => Math.round(n * 100) / 100;
const ymd = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export async function addSupplierInvoice({ supplier, invoiceNumber, totalAmount, date, dueDate, creditors }) {
    const existing = creditors.find(x => customerKey(x.name) === customerKey(supplier));
    const creditorId = existing ? existing._id : (await addDoc(collection(db, 'creditors'), { name: supplier })).id;
    await addDoc(collection(db, 'creditors', creditorId, 'invoices'), {
        invoiceNumber, totalAmount: r2(totalAmount), date: date || ymd(Date.now()), timestamp: Date.now(),
        remainingBalance: r2(totalAmount), paid: false, ...(dueDate ? { dueDate } : {})
    });
    return creditorId;
}
