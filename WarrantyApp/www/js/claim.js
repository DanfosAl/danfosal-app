import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, collection, doc, addDoc, getDocs, runTransaction, Timestamp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { firebaseConfig, renderHeader, renderAuroraBackground, escapeHtml, initials, formatDateAlb, nextSequenceNumber, warrantyBadge, confirmAction, announceConnection } from './garanci-shared.js';
import { loadCustomerDirectory, toMillis } from './garanci-data.js';
import { matchWarrantyForMachine, getWarrantyMatches } from './garanci-workspace.js';
import { findSimilarClaims } from './garanci-similarity.js';

document.getElementById('header-slot').outerHTML = renderHeader('claim');
document.getElementById('app-root').insertAdjacentHTML('afterbegin', renderAuroraBackground());
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const el = id => document.getElementById(id);
const keyOf = value => String(value || '').trim().toLowerCase();
let customerPurchases = {}, customerDirectory = [], profiles = {}, cards = [], allTickets = [];
let selectedCustomer = null, selectedMachine = null, customerMachines = [];
let customerDraft = { phone: '', city: '', nipt: '' };
let custEditOpen = false, editingSerialIndex = null, serialDraft = '';
let priority = 'Normal', mode = 'Në terren', busy = false, claimed = false;

function cardFor(machine) {
    const sameNameCount = customerMachines.filter(candidate => candidate.saleId === machine.saleId && candidate.collectionName === machine.collectionName && keyOf(candidate.name) === keyOf(machine.name)).length;
    return matchWarrantyForMachine(cards, { ...machine, customerName: selectedCustomer?.name || machine.customerName, sameNameCount });
}
function cardItemIndex(card, machine) {
    if (!card) return -1;
    const items = card.items || [];
    if (machine.warrantyCardId === card.id && Number.isInteger(machine.cardItemIndex)) return machine.cardItemIndex;
    const indexed = items.map((item, i) => ({ item, i })).filter(({ item }) => Number.isInteger(item.sourceItemIndex) && item.sourceItemIndex === machine.itemIndex);
    if (indexed.length === 1) return indexed[0].i;
    const serial = keyOf(machine.serialNumber);
    const matches = items.map((item, i) => ({ item, i })).filter(({ item }) => serial ? keyOf(item.serialNumber) === serial : keyOf(item.name || item.product) === keyOf(machine.name));
    return matches.length === 1 ? matches[0].i : -1;
}
function renderResults() {
    const term = keyOf(el('search-input').value);
    const matches = customerDirectory.filter(c => !term || [c.name, c.phone, c.nipt, c.city].some(value => keyOf(value).includes(term))).slice(0, 12);
    el('results-list').innerHTML = matches.length ? matches.map((customer, i) => `<button class="gn-glass" data-customer="${i}" style="display:flex;align-items:center;gap:12px;width:100%;padding:15px;text-align:left;cursor:pointer;border-radius:18px;border:1px solid var(--dg-edge);background:var(--dg-surface)"><span class="gn-avatar gn-avatar-sm">${escapeHtml(initials(customer.name))}</span><span style="min-width:0;flex:1"><b style="display:block;color:#fff">${escapeHtml(customer.name)}</b><span style="display:block;margin-top:5px;font-size:12px;color:var(--dg-muted)">${escapeHtml([customer.phone || 'Telefoni mungon', customer.city].filter(Boolean).join(' · '))}</span><span style="display:block;margin-top:5px;font-size:11px;color:var(--dg-muted)">${(customerPurchases[keyOf(customer.name)] || []).length} makineri</span></span></button>`).join('') : '<p class="dg-empty">Asnjë klient i gjetur. Provoni emrin, telefonin, NIPT-in ose qytetin.</p>';
    el('results-list').querySelectorAll('[data-customer]').forEach(button => button.addEventListener('click', () => selectCustomer(matches[Number(button.dataset.customer)])));
}
function selectCustomer(customer) {
    if (busy) return;
    selectedCustomer = { ...customer };
    customerDraft = { phone: customer.phone || '', city: customer.city || '', nipt: customer.nipt || '' };
    customerMachines = (customerPurchases[keyOf(customer.name)] || []).map(machine => ({ ...machine })).sort((a, b) => toMillis(b.date) - toMillis(a.date));
    selectedMachine = null;
    editingSerialIndex = null;
    serialDraft = '';
    custEditOpen = false;
    claimed = false;
    el('claimed-panel').hidden = true;
    el('claimed-panel').style.display = 'none';
    el('submit-claim-btn').disabled = false;
    el('submit-claim-btn').textContent = 'Rishiko dhe regjistro kërkesën';
    el('cust-edit-toggle').classList.remove('active');
    el('search-input').value = customer.name;
    el('synced-banner').style.display = 'none';
    renderResults();
    renderCustomerPanel();
}
function renderCustomerPanel() {
    if (!selectedCustomer) return;
    el('customer-panel').style.display = 'block';
    el('cust-avatar').textContent = initials(selectedCustomer.name);
    el('cust-name').textContent = selectedCustomer.name;
    el('cust-meta').textContent = [selectedCustomer.phone || 'Telefoni mungon', selectedCustomer.city].filter(Boolean).join(' · ');
    el('phone-missing-flag').style.display = selectedCustomer.phone ? 'none' : 'inline-block';
    for (const field of ['phone', 'city', 'nipt']) el(`cust-${field}-input`).value = customerDraft[field];
    el('cust-edit-grid').style.display = custEditOpen ? 'grid' : 'none';
    renderMachineList();
    renderWriteback();
    updateDefectVisibility();
}
function renderMachineList() {
    el('machine-list').innerHTML = customerMachines.length ? customerMachines.map((machine, i) => {
        const badge = warrantyBadge(cardFor(machine));
        const selected = selectedMachine === machine;
        return `<div class="gn-glass" style="padding:15px 17px;border-radius:18px;border:1px solid ${selected ? 'rgba(167,139,250,.65)' : 'rgba(255,255,255,.10)'};background:${selected ? 'rgba(139,92,246,.12)' : 'rgba(255,255,255,.025)'}"><button data-machine="${i}" aria-pressed="${selected}" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;width:100%;border:0;background:none;text-align:left;padding:0;cursor:pointer;color:inherit"><span><b style="display:block;font-size:15px;color:#fff">${escapeHtml(machine.name)}</b><span style="display:block;margin-top:6px;font-size:12px;color:var(--dg-muted)">S/N ${escapeHtml(machine.serialNumber || '—')} · ${machine.saleId ? 'blerë' : 'certifikatë'} ${escapeHtml(formatDateAlb(machine.date))}${machine.invoiceNumber ? ' · ' + escapeHtml(machine.invoiceNumber) : ''}</span></span><span class="${badge.className}">${escapeHtml(badge.label)}</span></button>${editingSerialIndex === i ? `<div style="margin-top:12px"><label class="gn-field-label" for="serial-draft-input">Numri serial</label><input id="serial-draft-input" class="gn-input" value="${escapeHtml(serialDraft)}" placeholder="Shkruani numrin serial" /></div>` : `<button class="gn-chip" data-start-serial="${i}" style="margin-top:12px;font-size:11px">${machine.serialNumber ? 'Redakto serialin' : '+ Shto numrin serial'}</button>`}</div>`;
    }).join('') : '<p class="dg-empty">Ky klient ende nuk ka makineri të regjistruara në fatura ose certifikata.</p>';
    el('machine-list').querySelectorAll('[data-machine]').forEach(button => button.addEventListener('click', () => {
        if (busy) return;
        const machine = customerMachines[Number(button.dataset.machine)];
        if (selectedMachine !== machine) {
            claimed = false;
            el('claimed-panel').style.display = 'none';
            el('submit-claim-btn').disabled = false;
            el('submit-claim-btn').textContent = 'Rishiko dhe regjistro kërkesën';
        }
        selectedMachine = machine;
        renderMachineList();
        updateDefectVisibility();
        renderSimilarClaims();
    }));
    el('machine-list').querySelectorAll('[data-start-serial]').forEach(button => button.addEventListener('click', () => {
        if (busy) return;
        const index = Number(button.dataset.startSerial);
        if (editingSerialIndex !== null && serialDraft.trim() !== (customerMachines[editingSerialIndex].serialNumber || '')) {
            alert('Përfundoni ndryshimin e serialit aktual para se të redaktoni një tjetër.');
            return;
        }
        editingSerialIndex = index;
        serialDraft = customerMachines[index].serialNumber || '';
        renderMachineList();
        el('serial-draft-input').focus();
    }));
    el('serial-draft-input')?.addEventListener('input', event => { serialDraft = event.target.value; renderWriteback(); });
}
function pendingChanges() {
    if (!selectedCustomer) return [];
    const changes = ['phone', 'city', 'nipt'].filter(field => customerDraft[field].trim() !== (selectedCustomer[field] || '')).map(field => ({ field, old: selectedCustomer[field] || '', value: customerDraft[field].trim(), label: { phone: 'Telefoni', city: 'Qyteti', nipt: 'NIPT' }[field] }));
    if (editingSerialIndex !== null && serialDraft.trim() !== (customerMachines[editingSerialIndex].serialNumber || '')) changes.push({ field: 'serialNumber', old: customerMachines[editingSerialIndex].serialNumber || '', value: serialDraft.trim(), label: `Seriali · ${customerMachines[editingSerialIndex].name}`, machineIndex: editingSerialIndex });
    return changes;
}
function renderWriteback() {
    const changes = pendingChanges();
    const prompt = el('writeback-prompt');
    prompt.style.display = changes.length ? 'block' : 'none';
    if (!changes.length) return;
    el('synced-banner').style.display = 'none';
    prompt.innerHTML = `<div class="gn-banner-warn"><b style="color:#fff">Rishikoni të dhënat e ndryshuara</b><div style="display:grid;gap:7px;font-size:12px">${changes.map(change => `<span>${escapeHtml(change.label)}: ${escapeHtml(change.old || '—')} → <b>${escapeHtml(change.value || '—')}</b></span>`).join('')}</div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="gn-btn gn-btn-primary" id="sync-profile-btn">Ruaji në sistem</button><button class="gn-btn gn-btn-glass" id="dismiss-sync-btn">Vetëm për këtë kërkesë</button></div></div>`;
    el('sync-profile-btn').addEventListener('click', () => applyWriteback(true));
    el('dismiss-sync-btn').addEventListener('click', () => applyWriteback(false));
}
async function applyWriteback(persist) {
    if (busy) return;
    const changes = pendingChanges();
    if (!changes.length) return;
    const customer = selectedCustomer;
    const profileChanges = changes.filter(change => change.field !== 'serialNumber');
    const serialChange = changes.find(change => change.field === 'serialNumber');
    const machine = serialChange ? customerMachines[serialChange.machineIndex] : null;
    const card = machine ? cardFor(machine) : null;
    const itemPosition = cardItemIndex(card, machine || {});
    busy = true;
    try {
        if (persist) {
            const destination = [profileChanges.length ? 'Profili i klientit' : '', machine?.saleId ? 'Seriali në faturë' : '', card && itemPosition >= 0 ? 'Seriali në certifikatën e garancisë' : ''].filter(Boolean).join(', ');
            const confirmed = await confirmAction({ title: 'Konfirmo përditësimin e të dhënave', body: `${customer.name}\n\n${changes.map(change => `${change.label}: ${change.old || '—'} → ${change.value || '—'}`).join('\n')}\n\nDo të përditësohen: ${destination || 'vetëm të dhënat e kësaj kërkese'}.`, confirmLabel: 'Konfirmo dhe ruaj' });
            if (!confirmed) return;
            const profileRef = profileChanges.length ? (customer.customerId ? doc(db, 'customers', customer.customerId) : doc(collection(db, 'customers'))) : null;
            const saleRef = machine?.saleId ? doc(db, machine.collectionName, machine.saleId) : null;
            const cardRef = card && itemPosition >= 0 ? doc(db, 'warrantyCards', card.id) : null;
            await runTransaction(db, async tx => {
                const profileSnap = profileRef && customer.customerId ? await tx.get(profileRef) : null;
                const saleSnap = saleRef ? await tx.get(saleRef) : null;
                const cardSnap = cardRef ? await tx.get(cardRef) : null;
                let saleItems, cardItems;
                if (profileSnap) {
                    const baseline = profiles[customer.customerId] || {};
                    if (!profileSnap.exists() || profileChanges.some(change => (profileSnap.data()[change.field] || '') !== (baseline[change.field] || ''))) throw new Error('Profili ka ndryshuar ndërkohë. Ringarkoni faqen para përditësimit.');
                }
                if (saleRef) {
                    if (!saleSnap.exists()) throw new Error('Fatura nuk ekziston më.');
                    saleItems = [...(saleSnap.data().items || [])];
                    const current = saleItems[machine.itemIndex];
                    if (!current || keyOf(current.name || current.product) !== keyOf(machine.name) || (current.serialNumber || '') !== serialChange.old) throw new Error('Makineria në faturë ka ndryshuar. Ringarkoni faqen.');
                    saleItems[machine.itemIndex] = { ...current, serialNumber: serialChange.value };
                }
                if (cardRef) {
                    if (!cardSnap.exists()) throw new Error('Certifikata nuk ekziston më.');
                    cardItems = [...(cardSnap.data().items || [])];
                    const current = cardItems[itemPosition];
                    const baseline = card.items[itemPosition];
                    if (!current || keyOf(current.name || current.product) !== keyOf(baseline.name || baseline.product) || (current.serialNumber || '') !== (baseline.serialNumber || '')) throw new Error('Certifikata ka ndryshuar. Ringarkoni faqen.');
                    cardItems[itemPosition] = { ...current, serialNumber: serialChange.value };
                }
                const patch = Object.fromEntries(profileChanges.map(change => [change.field, change.value]));
                if (profileRef && customer.customerId) tx.update(profileRef, patch);
                else if (profileRef) tx.set(profileRef, { name: customer.name, phone: customer.phone || '', nipt: customer.nipt || '', city: customer.city || '', email: '', address: '', status: 'Active', image: '', ...patch });
                if (saleRef) tx.update(saleRef, { items: saleItems });
                if (cardRef) tx.update(cardRef, { items: cardItems });
            });
            if (profileRef) {
                customer.customerId = profileRef.id;
                profiles[profileRef.id] = { ...(profiles[profileRef.id] || {}), ...Object.fromEntries(profileChanges.map(change => [change.field, change.value])) };
            }
            if (card && itemPosition >= 0) card.items[itemPosition] = { ...card.items[itemPosition], serialNumber: serialChange.value };
        }
        for (const change of profileChanges) customer[change.field] = change.value;
        if (persist) {
            const directoryEntry = customerDirectory.find(entry => keyOf(entry.name) === keyOf(customer.name));
            if (directoryEntry) Object.assign(directoryEntry, customer);
        }
        if (serialChange) {
            // Preserve the selected reference before replacing the edited row.
            const wasSelected = selectedMachine === machine;
            const updated = { ...machine, serialNumber: serialChange.value, warrantyCardId: card?.id || machine.warrantyCardId || null, cardItemIndex: itemPosition >= 0 ? itemPosition : machine.cardItemIndex ?? null };
            customerMachines[serialChange.machineIndex] = updated;
            if (wasSelected) selectedMachine = updated;
            if (persist) {
                const original = (customerPurchases[keyOf(customer.name)] || []).find(entry => machine.saleId ? entry.saleId === machine.saleId && entry.collectionName === machine.collectionName && entry.itemIndex === machine.itemIndex : entry.warrantyCardId === machine.warrantyCardId && entry.cardItemIndex === machine.cardItemIndex);
                if (original) original.serialNumber = serialChange.value;
            }
        }
        editingSerialIndex = null;
        serialDraft = '';
        renderCustomerPanel();
        renderResults();
        el('synced-banner').style.display = 'block';
        el('synced-banner').innerHTML = `<div class="gn-banner-success"><span class="gn-check-badge">✓</span><span>${persist ? 'Ndryshimet u ruajtën në sistem.' : 'Ndryshimet do të përdoren vetëm në këtë kërkesë.'}</span></div>`;
    } catch (error) {
        console.error('Profile update failed:', error);
        alert('Përditësimi dështoi: ' + error.message);
    } finally { busy = false; }
}
function renderChips() {
    el('priority-chips').innerHTML = ['E ulët', 'Normal', 'Urgjent'].map(value => `<button class="gn-chip${value === priority ? ' active' : ''}" data-priority="${value}" aria-pressed="${value === priority}">${value}</button>`).join('');
    el('mode-chips').innerHTML = ['Në terren', 'Në servis'].map(value => `<button class="gn-chip${value === mode ? ' active' : ''}" data-mode="${value}" aria-pressed="${value === mode}">${value}</button>`).join('');
    el('priority-chips').querySelectorAll('[data-priority]').forEach(button => button.addEventListener('click', () => { if (!busy) { priority = button.dataset.priority; renderChips(); } }));
    el('mode-chips').querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { if (!busy) { mode = button.dataset.mode; renderChips(); } }));
}
function updateDefectVisibility() {
    el('defect-card').style.display = selectedMachine ? 'block' : 'none';
    el('submit-row').style.display = selectedMachine ? 'flex' : 'none';
    if (selectedMachine) el('claim-summary').textContent = `Për: ${selectedMachine.name}`;
}
function renderSimilarClaims() {
    const matches = findSimilarClaims(allTickets, selectedMachine?.name || '', el('issue-text').value, null);
    el('similar-claims').style.display = matches.length ? 'block' : 'none';
    el('similar-claims').innerHTML = `<div style="padding:16px;border-radius:16px;border:1px solid rgba(139,92,255,.25);background:rgba(139,92,255,.07)"><b style="font-size:12px;color:#d9caff">${matches.length} kërkesa të ngjashme</b>${matches.map(({ ticket }) => `<a style="display:block;margin-top:10px;color:inherit;font-size:12px" href="pending-detail.html?id=${encodeURIComponent(ticket.id)}"><b>${escapeHtml(ticket.productName || '')}</b><span style="display:block;margin-top:4px">${escapeHtml(ticket.issueDescription || '')}</span></a>`).join('')}</div>`;
}
el('submit-claim-btn').addEventListener('click', async () => {
    if (busy || claimed) return;
    const issueDescription = el('issue-text').value.trim();
    if (!selectedMachine || !issueDescription) { alert('Zgjidhni makinerinë dhe përshkruani defektin.'); return; }
    if (pendingChanges().length) { alert('Zgjidhni ku do të përdoren ndryshimet e klientit ose serialit para se të vazhdoni.'); return; }
    const customer = { ...selectedCustomer }, machine = { ...selectedMachine };
    const card = cardFor(machine);
    const ticketPriority = priority, ticketMode = mode;
    const coverage = warrantyBadge(card);
    busy = true;
    el('submit-claim-btn').disabled = true;
    try {
        const confirmed = await confirmAction({ title: 'Rishiko kërkesën e shërbimit', body: `Klienti: ${customer.name}\nTelefoni: ${customer.phone || '—'}\nQyteti: ${customer.city || '—'}\nNIPT: ${customer.nipt || '—'}\n\nMakineria: ${machine.name}\nSeriali: ${machine.serialNumber || '—'}\n${coverage.label}\n\nProblemi: ${issueDescription}\n\nPrioriteti: ${ticketPriority}\nTrajtimi: ${ticketMode}`, confirmLabel: 'Konfirmo dhe regjistro' });
        if (!confirmed) return;
        const claimNo = await nextSequenceNumber(db, 'claimNo', 'KRK');
        const now = Timestamp.now();
        const warrantyOk = !!(card && toMillis(card.warrantyUntil) >= Date.now());
        const when = formatDateAlb(now) + ' ' + new Date().toLocaleTimeString('sq-AL', { hour: '2-digit', minute: '2-digit' });
        const ticket = await addDoc(collection(db, 'serviceTickets'), {
            claimNo, customerName: customer.name, customerPhone: customer.phone || '', customerCity: customer.city || '', customerNipt: customer.nipt || '',
            productName: machine.name, serialNumber: machine.serialNumber || '', issueDescription, priority: ticketPriority, mode: ticketMode,
            status: 'received', notes: '', tech: '', linkedSaleId: machine.saleId || null,
            linkedSaleType: machine.saleId ? (machine.collectionName === 'onlineOrders' ? 'onlineOrder' : 'storeSale') : 'manual',
            linkedItemIndex: Number.isInteger(machine.itemIndex) ? machine.itemIndex : null,
            warrantyCardId: card?.id || null,
            warrantyCardItemIndex: card && cardItemIndex(card, machine) >= 0 ? cardItemIndex(card, machine) : null,
            timeline: [{ title: 'Kërkesa u regjistrua', when, who: 'Recepsioni' }, { title: warrantyOk ? 'Garancia aktive u verifikua për këtë makineri' : 'Nuk u gjet garanci aktive për këtë makineri', when, who: 'Sistemi' }],
            createdAt: now, updatedAt: now
        });
        claimed = true;
        el('submit-claim-btn').textContent = 'Kërkesa u regjistrua';
        el('claimed-panel').hidden = false;
        el('claimed-panel').className = 'gn-banner-issued';
        el('claimed-panel').style.display = 'grid';
        el('claimed-panel').innerHTML = `<b>Kërkesa ${escapeHtml(claimNo)} u regjistrua.</b><span>Shtoni fotografitë e pranimit, teknikun dhe orarin nga dosja e servisit.</span><a class="gn-btn gn-btn-primary" href="pending-detail.html?id=${encodeURIComponent(ticket.id)}">Hap dosjen e servisit →</a><a class="gn-btn gn-btn-glass" href="claim.html">Kërkesë tjetër</a>`;
    } catch (error) {
        console.error('Claim creation failed:', error);
        alert('Kërkesa nuk u regjistrua: ' + error.message);
    } finally { busy = false; el('submit-claim-btn').disabled = claimed; }
});
el('cust-edit-toggle').addEventListener('click', () => { if (!busy) { custEditOpen = !custEditOpen; el('cust-edit-toggle').classList.toggle('active', custEditOpen); renderCustomerPanel(); } });
for (const field of ['phone', 'city', 'nipt']) el(`cust-${field}-input`).addEventListener('input', event => { customerDraft[field] = event.target.value; renderWriteback(); });
el('search-input').addEventListener('input', renderResults);
let similarTimer;
el('issue-text').addEventListener('input', () => { clearTimeout(similarTimer); similarTimer = setTimeout(renderSimilarClaims, 250); });
renderChips();

async function init() {
    el('results-list').innerHTML = '<p class="dg-empty">Duke ngarkuar klientët dhe garancitë…</p>';
    const [directory, cardsSnap, ticketsSnap, profilesSnap] = await Promise.all([loadCustomerDirectory(db), getDocs(collection(db, 'warrantyCards')), getDocs(collection(db, 'serviceTickets')), getDocs(collection(db, 'customers'))]);
    customerPurchases = directory.customerPurchases;
    customerDirectory = directory.customerDirectory;
    cards = cardsSnap.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
    allTickets = ticketsSnap.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
    profiles = Object.fromEntries(profilesSnap.docs.map(snapshot => [snapshot.id, snapshot.data()]));
    customerDirectory.forEach(customer => { if (profiles[customer.customerId]?.city) customer.city = profiles[customer.customerId].city; });
    const coveredItems = new Set();
    for (const customer of customerDirectory) {
        const purchases = customerPurchases[keyOf(customer.name)] || [];
        for (const machine of purchases) {
            const sameNameCount = purchases.filter(candidate => candidate.saleId === machine.saleId && candidate.collectionName === machine.collectionName && keyOf(candidate.name) === keyOf(machine.name)).length;
            for (const match of getWarrantyMatches(cards, { ...machine, customerName: customer.name, sameNameCount })) coveredItems.add(`${match.card.id}:${match.itemIndex}`);
        }
    }
    for (const card of cards) {
        const name = String(card.customerName || '').trim();
        if (!name) continue;
        const key = keyOf(name);
        if (!customerDirectory.some(customer => keyOf(customer.name) === key)) customerDirectory.push({ name, phone: '', nipt: '', city: '', customerId: null });
        if (!customerPurchases[key]) customerPurchases[key] = [];
        (card.items || []).forEach((item, index) => {
            if (coveredItems.has(`${card.id}:${index}`)) return;
            customerPurchases[key].push({ name: item.name || item.product || 'Makineri', serialNumber: item.serialNumber || '', saleId: null, collectionName: null, itemIndex: null, cardItemIndex: index, warrantyCardId: card.id, invoiceNumber: card.invoiceNumber || '', date: card.purchaseDate || card.createdAt });
        });
    }
    customerDirectory.sort((a, b) => a.name.localeCompare(b.name, 'sq'));
    renderResults();
    announceConnection('connected');
    const params = new URLSearchParams(location.search);
    if (params.get('saleId') || params.get('cardId') || params.get('serial')) {
        for (const customer of customerDirectory) {
            const match = (customerPurchases[keyOf(customer.name)] || []).find(machine => params.get('cardId') ? machine.warrantyCardId === params.get('cardId') && (!params.has('itemIndex') || machine.cardItemIndex === Number(params.get('itemIndex'))) : params.get('saleId') ? machine.saleId === params.get('saleId') && (!params.has('itemIndex') || machine.itemIndex === Number(params.get('itemIndex'))) : keyOf(machine.serialNumber) === keyOf(params.get('serial')));
            if (match) { selectCustomer(customer); selectedMachine = customerMachines.find(machine => machine.saleId === match.saleId && machine.itemIndex === match.itemIndex && machine.warrantyCardId === match.warrantyCardId && machine.cardItemIndex === match.cardItemIndex); renderCustomerPanel(); break; }
        }
    }
}
function reportError(error) {
    console.error('Failed to load claim screen:', error);
    announceConnection('error');
    el('page-error').hidden = false;
    el('page-error').textContent = 'Të dhënat nuk u ngarkuan. Kontrolloni lidhjen dhe ringarkoni faqen.';
    el('results-list').innerHTML = '';
}
auth.onAuthStateChanged(user => { if (user) init().catch(reportError); else signInAnonymously(auth).catch(reportError); });
