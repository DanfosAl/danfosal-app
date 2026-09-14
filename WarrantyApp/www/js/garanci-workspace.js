// Pure helpers shared by the live workspace. Matching is deliberately per machine:
// a certificate for one invoice item does not cover every other item on that invoice.
const key = value => String(value ?? '').trim().toLocaleLowerCase();
const itemsOf = card => Array.isArray(card?.items) ? card.items : [];
export function timestampMillis(value) {
    if (value == null || value === '') return 0;
    const ms = typeof value.toMillis === 'function' ? value.toMillis() : typeof value.toDate === 'function' ? value.toDate().getTime() : typeof value.seconds === 'number' ? value.seconds * 1000 : new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
}
export function saleTypeOf(value) {
    if (value === 'storeSales' || value === 'storeSale') return 'storeSale';
    if (value === 'onlineOrders' || value === 'onlineOrder') return 'onlineOrder';
    return value || '';
}
export function repairMillis(repair) {
    if (repair.createdAt) return timestampMillis(repair.createdAt);
    const parts = String(repair.date || '').match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
    if (!parts) return timestampMillis(repair.date);
    const d = new Date(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1]));
    return d.getDate() === Number(parts[1]) && d.getMonth() === Number(parts[2]) - 1 ? d.getTime() : 0;
}
export function localDateKey(value = new Date()) {
    const d = value instanceof Date ? value : new Date(timestampMillis(value));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dateKeyMillis(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return 0;
    const date = new Date(`${value}T00:00:00`);
    return Number.isFinite(date.getTime()) && localDateKey(date) === value ? date.getTime() : 0;
}
export function isOpenTicket(ticket) { return ['received', 'in_progress', 'waiting_parts'].includes(ticket?.status || 'received'); }
export function getScheduledMillis(ticket) { return timestampMillis(ticket?.scheduledAt); }
export function getAttentionItems(tickets, now = Date.now()) {
    const nowMs = timestampMillis(now), today = localDateKey(nowMs);
    return (tickets || []).filter(isOpenTicket).map(ticket => {
        const delayed = (ticket.parts || []).filter(part => part.status !== 'received' && dateKeyMillis(part.expectedOn) && part.expectedOn < today);
        if (dateKeyMillis(ticket.promisedBy) && ticket.promisedBy < today) return { ticket, kind: 'overdue', label: 'Afati i premtuar ka kaluar', dueAt: dateKeyMillis(ticket.promisedBy), priority: 0 };
        if (delayed.length) return { ticket, kind: 'parts', label: `${delayed.length} pjesë në vonesë`, dueAt: Math.min(...delayed.map(part => dateKeyMillis(part.expectedOn))), priority: 1 };
        if (!key(ticket.tech) || key(ticket.tech) === 'pa caktuar') return { ticket, kind: 'unassigned', label: 'Caktoni teknikun', dueAt: timestampMillis(ticket.createdAt), priority: 2 };
        if (ticket.priority === 'Urgjent') return { ticket, kind: 'urgent', label: 'Kërkesë urgjente', dueAt: timestampMillis(ticket.createdAt), priority: 3 };
        const scheduled = getScheduledMillis(ticket);
        if (scheduled && scheduled < nowMs) return { ticket, kind: 'appointment', label: 'Kontrolloni takimin e kaluar', dueAt: scheduled, priority: 4 };
        return null;
    }).filter(Boolean).sort((a, b) => a.priority - b.priority || a.dueAt - b.dueAt);
}
function sameSale(card, machine) {
    const machineSaleId = machine.saleId || machine.sourceSaleId;
    if (!machineSaleId || !card.saleId || machineSaleId !== card.saleId) return false;
    const cardType = saleTypeOf(card.saleType), machineType = saleTypeOf(machine.sourceSaleType || machine.saleType || machine.collectionName);
    return !cardType || !machineType || cardType === machineType;
}
function customerMatches(card, machine) { return key(card.customerName) && key(card.customerName) === key(machine.customerName); }
function uniqueSourceName(machine) {
    if (Number.isInteger(machine.sameNameCount)) return machine.sameNameCount === 1;
    if (Array.isArray(machine.siblingItems)) return machine.siblingItems.filter(item => key(item.name || item.product) === key(machine.name || machine.productName)).length === 1;
    return false;
}
export function getWarrantyMatches(cards, machine) {
    if (!machine) return [];
    const serial = key(machine.serialNumber || machine.serial), name = key(machine.name || machine.productName);
    const directId = machine.warrantyCardId || machine.cardId;
    const directIndex = Number.isInteger(machine.warrantyCardItemIndex) ? machine.warrantyCardItemIndex : Number.isInteger(machine.cardItemIndex) ? machine.cardItemIndex : null;
    const result = [];
    for (const card of cards || []) {
        const entries = itemsOf(card).map((item, itemIndex) => ({ card, item, itemIndex }));
        const saleMatches = sameSale(card, machine);
        // A linked sale is a boundary, including for exact serials reused in old records.
        if ((machine.saleId || machine.sourceSaleId) && card.saleId && !saleMatches) continue;
        if (directId === card.id && directIndex !== null) {
            if (entries[directIndex]) result.push(entries[directIndex]);
            continue;
        }
        // Older tickets stored only the certificate ID. That is unambiguous only
        // when the certificate has one item belonging to the same customer.
        if (directId === card.id && entries.length === 1 && customerMatches(card, machine)) {
            result.push(entries[0]);
            continue;
        }
        if (!saleMatches && !customerMatches(card, machine)) continue;
        const indexed = saleMatches && Number.isInteger(machine.itemIndex) ? entries.filter(({ item }) => Number.isInteger(item.sourceItemIndex) && item.sourceItemIndex === machine.itemIndex) : [];
        if (indexed.length === 1) { result.push(indexed[0]); continue; }
        const serialMatches = serial ? entries.filter(({ item }) => key(item.serialNumber) === serial && (!Number.isInteger(item.sourceItemIndex) || !saleMatches || !Number.isInteger(machine.itemIndex) || item.sourceItemIndex === machine.itemIndex)) : [];
        if (serialMatches.length === 1) { result.push(serialMatches[0]); continue; }
        if (!saleMatches || !customerMatches(card, machine) || !name || !uniqueSourceName(machine)) continue;
        const names = entries.filter(({ item }) => key(item.name || item.product) === name);
        if (names.length !== 1) continue;
        const candidate = names[0];
        // null is an explicitly manual item; an integer belongs to a particular source row.
        if (Object.prototype.hasOwnProperty.call(candidate.item, 'sourceItemIndex')) continue;
        if (serial && key(candidate.item.serialNumber) && serial !== key(candidate.item.serialNumber)) continue;
        result.push(candidate);
    }
    return result.sort((a, b) => timestampMillis(b.card.createdAt) - timestampMillis(a.card.createdAt));
}
export function matchWarrantyForMachine(cards, machine) {
    const matches = getWarrantyMatches(cards, machine);
    return (matches.find(({ card }) => timestampMillis(card.warrantyUntil)) || matches[0])?.card || null;
}
export function buildMachineDirectory(sales, cards) {
    const machines = [];
    for (const sale of sales || []) {
        const sourceItems = Array.isArray(sale.items) ? sale.items : [];
        sourceItems.forEach((item, itemIndex) => machines.push({
            key: `${saleTypeOf(sale.collectionName || sale.saleType)}:${sale.id}:${itemIndex}`,
            saleId: sale.id, saleType: saleTypeOf(sale.collectionName || sale.saleType), collectionName: sale.collectionName,
            itemIndex, siblingItems: sourceItems, name: item.name || item.product || 'Makineri', modelCode: item.code || item.productCode || item.modelCode || '',
            serialNumber: item.serialNumber || '', customerName: sale.clientName || sale.customerName || 'Klient',
            invoiceNumber: sale.invoiceNumber || '', date: sale.timestamp, quantity: Number(item.quantity) || 1
        }));
    }
    const coveredItems = new Set();
    for (const machine of machines) for (const match of getWarrantyMatches(cards, machine)) coveredItems.add(`${match.card.id}:${match.itemIndex}`);
    for (const card of cards || []) itemsOf(card).forEach((item, cardItemIndex) => {
        if (coveredItems.has(`${card.id}:${cardItemIndex}`)) return;
        const serial = key(item.serialNumber);
        if (serial && machines.some(machine => !machine.saleId && key(machine.serialNumber) === serial && key(machine.customerName) === key(card.customerName) && (!machine.sourceSaleId || !card.saleId || machine.sourceSaleId === card.saleId))) return;
        machines.push({ key: `card:${card.id}:${cardItemIndex}`, cardId: card.id, warrantyCardId: card.id, cardItemIndex,
            sourceSaleId: card.saleId || null, sourceSaleType: card.saleType || null, saleId: null, saleType: 'manual', itemIndex: null,
            name: item.name || item.product || 'Makineri', serialNumber: item.serialNumber || '', modelCode: item.modelCode || item.code || '',
            customerName: card.customerName || 'Klient', invoiceNumber: card.invoiceNumber || '', date: card.purchaseDate || card.createdAt, quantity: 1
        });
    });
    return machines.sort((a, b) => timestampMillis(b.date) - timestampMillis(a.date) || a.key.localeCompare(b.key));
}
export function ticketMatchesMachine(ticket, machine, matches = []) {
    const saleId = machine.saleId || machine.sourceSaleId;
    const linkedId = ticket.linkedSaleId || ticket.saleId;
    const ticketType = saleTypeOf(ticket.linkedSaleType || ticket.saleType);
    const machineType = saleTypeOf(machine.sourceSaleType || machine.saleType || machine.collectionName);
    if (saleId && linkedId && (saleId !== linkedId || (ticketType && machineType && machineType !== 'manual' && ticketType !== machineType))) return false;
    if (ticket.warrantyCardId && Number.isInteger(ticket.warrantyCardItemIndex)) {
        return matches.some(({ card, itemIndex }) => card.id === ticket.warrantyCardId && itemIndex === ticket.warrantyCardItemIndex);
    }
    const sameLinkedSale = saleId && linkedId === saleId;
    if (sameLinkedSale && Number.isInteger(ticket.linkedItemIndex) && Number.isInteger(machine.itemIndex)) return ticket.linkedItemIndex === machine.itemIndex;
    const serial = key(machine.serialNumber), ticketSerial = key(ticket.serialNumber);
    if (serial && ticketSerial) return serial === ticketSerial && (sameLinkedSale || key(ticket.customerName) === key(machine.customerName));
    if (ticket.warrantyCardId && matches.some(({ card }) => card.id === ticket.warrantyCardId && itemsOf(card).length === 1)) return true;
    return !!sameLinkedSale && uniqueSourceName(machine) && key(ticket.customerName) === key(machine.customerName) && key(ticket.productName) === key(machine.name);
}
