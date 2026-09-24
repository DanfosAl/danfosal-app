// Taking a machine off a warranty certificate when its invoice is cancelled.
//
// A cancelled invoice already gives the goods back to stock and records the refund. What it cannot
// do by itself is decide the paperwork: a certificate can cover several machines, and only the one
// that came back should come off it. That needs a person to say which serial number, so the app
// asks rather than guesses.
//
// What it keeps: the certificate number, the customer, and above all **the date it was issued**.
// A reprint is the same certificate minus one machine, not a new certificate - the remaining
// machine's warranty still runs from the day it was sold.
import { db, doc, updateDoc, arrayUnion, Timestamp } from './firebase.js';
import { esc, icon, toast, openModal, day } from './ui.js';
import { toMs, realSerial, squash } from './data.js';

const label = it => `${it.name || 'Item'}${realSerial(it.serialNumber) ? ` · S/N ${realSerial(it.serialNumber)}` : ' · no serial number'}`;

// The items on the card that look like the ones that came back, so they start ticked. Matched on
// the serial first (that is what identifies a machine), then on the name.
export function itemsComingBack(card, returnedNames = [], returnedSerials = []) {
    const serials = new Set(returnedSerials.map(squash).filter(Boolean));
    const names = returnedNames.map(squash).filter(Boolean);
    return (card.items || []).map((it, i) => {
        const s = squash(realSerial(it.serialNumber));
        const n = squash(it.name);
        const hit = (s && serials.has(s)) || names.some(x => x && n && (x === n || x.includes(n) || n.includes(x)));
        return { i, it, hit };
    });
}

// The ask: which machine came back. Everything else follows from the answer.
export async function warrantyRemoveDialog(ctx, { card, refund = null, onDone = null } = {}) {
    if (!card || !(card.items || []).length) { toast('That certificate has no items on it'); return; }
    const issued = toMs(card.purchaseDate) || toMs(card.createdAt);
    const marks = itemsComingBack(card,
        (refund && (refund.items || []).map(i => i.itemName || i.name)) || [],
        (refund && (refund.items || []).map(i => i.serialNumber)) || []);
    const anyHit = marks.some(m => m.hit);

    const ok = await openModal({
        title: `Take a machine off ${card.certNo || 'this certificate'}?`,
        confirmLabel: 'Take it off', confirmClass: 'money',
        body: `<p style="margin:0">${esc(card.customerName || 'No customer')}${issued ? ` · issued ${esc(day(issued))} ${new Date(issued).getFullYear()}` : ''}${refund ? ` · refund of €${Math.abs(Number(refund.total) || 0)}` : ''}.
                Tick what came back${anyHit ? ' – the machine from the cancelled invoice is already ticked' : ''}.</p>
            <div style="display:grid;gap:8px">${marks.map(m => `
                <label class="check"><input type="checkbox" data-ri="${m.i}"${m.hit ? ' checked' : ''}><span><b style="font-weight:500">${esc(m.it.name || 'Item')}</b>
                    <span class="muted">${realSerial(m.it.serialNumber) ? 'S/N ' + esc(realSerial(m.it.serialNumber)) : 'no serial number'}</span></span></label>`).join('')}</div>
            <p class="empty" style="margin:0">Whatever stays keeps this certificate, with <b>the date it was issued</b> – a reprint is the same certificate without the machine that came back. If nothing is left, the certificate is cancelled.</p>`,
        validate: m => !m.querySelectorAll('[data-ri]:checked').length ? 'Tick the machine that came back.' : ''
    });
    if (!ok) return;

    const take = [...ok.querySelectorAll('[data-ri]:checked')].map(c => Number(c.dataset.ri));
    const removed = (card.items || []).filter((_, i) => take.includes(i));
    const left = (card.items || []).filter((_, i) => !take.includes(i));
    const when = Timestamp.now();
    const why = refund ? `Invoice cancelled${refund.invoiceNumber && refund.invoiceNumber.length > 3 ? ' (' + refund.invoiceNumber + ')' : ''}` : 'Taken off by hand';

    try {
        const update = {
            items: left,
            removedItems: arrayUnion(...removed.map(it => ({ name: it.name || '', serialNumber: it.serialNumber || '', removedAt: when, reason: why }))),
            lastChangedAt: when
        };
        // Nothing left to cover: the certificate is cancelled, not deleted - it is a record that
        // it existed, and Service shows it as cancelled rather than active.
        if (!left.length) { update.cancelledAt = when; update.cancelReason = why; }
        await updateDoc(doc(db, 'warrantyCards', card._id), update);
        if (refund && refund._id) await updateDoc(doc(db, 'returns', refund._id), { warrantyHandledAt: when, warrantyCardId: card._id });
        toast(left.length
            ? `${removed.map(r => r.name).join(', ')} taken off ${card.certNo || 'the certificate'}`
            : `${card.certNo || 'The certificate'} cancelled – nothing left on it`);
    } catch (e) { toast(`Couldn't change the certificate: ${e.message}`, { bad: true }); return; }

    // Offer the reprint straight away: same certificate, same date, one machine fewer.
    if (left.length) {
        const print = await openModal({
            title: 'Print the certificate again?', confirmLabel: 'Print it', cancelLabel: 'Not now',
            body: `<p>${esc(card.certNo || 'The certificate')} now covers ${esc(left.map(label).join(', '))}.
                It prints with its original date${issued ? ` of ${esc(day(issued))} ${new Date(issued).getFullYear()}` : ''}, so the warranty still runs from the day of the sale.</p>`
        });
        if (print) window.open(`warranty-card.html?id=${encodeURIComponent(card._id)}`, '_blank');
    }
    if (onDone) await onDone();
    else await ctx.reload();
}
