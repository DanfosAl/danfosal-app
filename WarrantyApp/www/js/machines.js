import { collection, onSnapshot, getDocs } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { renderHeader, renderAuroraBackground, escapeHtml as esc, formatDateAlb, warrantyBadge, announceConnection } from './garanci-shared.js';
import { db, ready, showError } from './garanci-app.js';
import { buildMachineDirectory, getWarrantyMatches, ticketMatchesMachine, timestampMillis, saleTypeOf, isOpenTicket, repairMillis } from './garanci-workspace.js';
const $ = id => document.getElementById(id), normalize = value => String(value || '').trim().toLocaleLowerCase();
const STATUS = { received: 'Pa caktuar', in_progress: 'Në shqyrtim', waiting_parts: 'Në pritje të pjesëve', completed: 'Përfunduar', rejected: 'Refuzuar', cancelled: 'Anuluar' };
const sources = { storeSales: [], onlineOrders: [], warrantyCards: [], serviceTickets: [] }, loaded = new Set();
let machines = [], page = 0, filter = 'all', search = new URLSearchParams(location.search).get('q') || '', renderGeneration = 0;
$('header-slot').outerHTML = renderHeader('machines');
$('app-root').insertAdjacentHTML('afterbegin', renderAuroraBackground());
function matchesFor(machine) { return getWarrantyMatches(sources.warrantyCards, machine); }
function coverage(machine) {
    const issued = matchesFor(machine).filter(({ card }) => timestampMillis(card.warrantyUntil));
    const active = issued.find(({ card }) => timestampMillis(card.warrantyUntil) >= Date.now());
    const match = active || issued[0];
    return { badge: warrantyBadge(match?.card), state: active ? 'active' : issued.length ? 'expired' : 'none', match };
}
function machineUrl(machine, target = 'machines.html') {
    const params = new URLSearchParams(machine.saleId ? { saleId: machine.saleId, saleType: machine.saleType, itemIndex: String(machine.itemIndex) } : { cardId: machine.cardId, itemIndex: String(machine.cardItemIndex) });
    if (machine.serialNumber) params.set('serial', machine.serialNumber);
    return `${target}?${params}`;
}
function ticketUrl(ticket) { return `pending-detail.html?id=${encodeURIComponent(ticket.id)}`; }
function candidatesFromUrl() {
    const params = new URLSearchParams(location.search);
    if (params.has('saleId')) return machines.filter(machine => machine.saleId === params.get('saleId') && (!params.get('saleType') || machine.saleType === saleTypeOf(params.get('saleType'))) && (!params.has('itemIndex') || machine.itemIndex === Number(params.get('itemIndex'))) && (params.has('itemIndex') || !params.get('serial') || normalize(machine.serialNumber) === normalize(params.get('serial'))));
    if (params.has('cardId')) return machines.filter(machine => matchesFor(machine).some(({ card, itemIndex }) => card.id === params.get('cardId') && (!params.has('itemIndex') || itemIndex === Number(params.get('itemIndex')))));
    if (params.get('serial')) return machines.filter(machine => normalize(machine.serialNumber) === normalize(params.get('serial')));
    return null;
}
function render() {
    renderGeneration++;
    if (loaded.size < 4) return;
    $('machine-root').setAttribute('aria-busy', 'false');
    const candidates = candidatesFromUrl();
    if (candidates?.length === 1) renderPassport(candidates[0]);
    else renderDirectory(candidates);
}
function renderDirectory(candidates) {
    $('machine-root').innerHTML = `${candidates ? '<a class="gn-back-link" href="machines.html">← Të gjitha makineritë</a>' : ''}<div class="dg-heading"><div><div class="dg-eyebrow">DOSJET E MAKINERIVE</div><h1 style="margin-top:10px">Një dosje për çdo makineri.</h1><p>Blerja, garancia dhe historia e shërbimit, në një vend.</p></div><a class="dg-button dg-primary" href="claim.html">＋ Regjistro kërkesë</a></div>
    ${candidates ? `<div class="dg-insight">${candidates.length ? 'Zgjidhni makinerinë për të hapur historinë e saj.' : 'Makineria nuk u gjet me këto të dhëna. Kthehuni te lista dhe kërkoni sipas klientit ose serialit.'}</div>` : ''}
    <div class="mp-toolbar"><label class="dg-search"><span aria-hidden="true">⌕</span><input id="machine-search" type="search" placeholder="Kërko klient, model, serial ose faturë" aria-label="Kërko makineri" value="${esc(search)}"></label><select id="machine-filter" class="gn-input mp-filter" aria-label="Filtro mbulimin"><option value="all">Çdo mbulim</option><option value="active">Garanci aktive</option><option value="expired">Garanci të skaduara</option><option value="none">Pa garanci të lëshuar</option></select><span id="machine-count" class="dg-small dg-muted" aria-live="polite"></span></div><div id="machine-list" class="dg-machine-gallery"></div><div id="machine-pagination" class="mp-pagination"></div>`;
    $('machine-filter').value = filter;
    $('machine-search').addEventListener('input', event => { search = event.target.value; page = 0; renderRows(candidates); });
    $('machine-filter').addEventListener('change', event => { filter = event.target.value; page = 0; renderRows(candidates); });
    renderRows(candidates);
}
function renderRows(candidates) {
    const term = normalize(search), base = candidates || machines;
    const list = base.filter(machine => (!term || normalize([machine.name, machine.customerName, machine.serialNumber, machine.invoiceNumber, machine.modelCode].join(' ')).includes(term)) && (filter === 'all' || coverage(machine).state === filter));
    const pageSize = 40, totalPages = Math.max(1, Math.ceil(list.length / pageSize));
    page = Math.min(page, totalPages - 1);
    $('machine-count').textContent = `${list.length} makineri`;
    $('machine-list').innerHTML = list.slice(page * pageSize, (page + 1) * pageSize).map(machine => {
        const cover = coverage(machine);
        return `<button class="dg-machine-row" type="button" data-machine="${esc(machine.key)}"><span><span class="dg-machine-title" style="display:block">${esc(machine.name)}</span><span class="dg-row-meta mp-serial" style="display:block">${esc(machine.customerName)} · S/N ${esc(machine.serialNumber || 'Mungon')}</span><span class="dg-row-meta" style="display:block">${esc(machine.invoiceNumber || (machine.saleId ? 'Faturë pa numër' : 'Nga certifikata'))} · ${esc(formatDateAlb(machine.date) || 'Datë e paregjistruar')}</span></span><span class="dg-badge ${cover.state === 'active' ? 'dg-green' : cover.state === 'expired' ? 'dg-amber' : ''}">${esc(cover.badge.label)} ↗</span></button>`;
    }).join('') || '<div class="dg-panel mp-empty">Asnjë makineri nuk përputhet me kërkimin.</div>';
    $('machine-list').querySelectorAll('[data-machine]').forEach(button => button.addEventListener('click', () => {
        const machine = machines.find(item => item.key === button.dataset.machine);
        history.pushState({}, '', machineUrl(machine)); render(); window.scrollTo({ top: 0 });
    }));
    $('machine-pagination').innerHTML = list.length > pageSize ? `<button class="dg-button" id="machine-prev" ${page === 0 ? 'disabled' : ''}>← Mëparshme</button><span class="dg-small dg-muted">Faqja ${page + 1} / ${totalPages}</span><button class="dg-button" id="machine-next" ${page === totalPages - 1 ? 'disabled' : ''}>Tjetra →</button>` : '';
    $('machine-prev')?.addEventListener('click', () => { page--; renderRows(candidates); });
    $('machine-next')?.addEventListener('click', () => { page++; renderRows(candidates); });
}
function repairMatches(repair, machine, card, tickets) {
    if (repair.ticketId) return tickets.some(ticket => ticket.id === repair.ticketId);
    if (repair.serialNumber && machine.serialNumber) return normalize(repair.serialNumber) === normalize(machine.serialNumber);
    if (Number.isInteger(repair.sourceItemIndex) && Number.isInteger(machine.itemIndex)) return repair.sourceItemIndex === machine.itemIndex;
    return (card.items || []).length === 1;
}
function renderPassport(machine) {
    const matches = matchesFor(machine), cover = coverage(machine), cards = [...new Map(matches.map(match => [match.card.id, match.card])).values()];
    const tickets = sources.serviceTickets.filter(ticket => ticketMatchesMachine(ticket, machine, matches)).sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
    const active = tickets.filter(isOpenTicket);
    const historyRows = [];
    if (machine.saleId) historyRows.push({ at: timestampMillis(machine.date), title: 'Blerja e makinerisë', meta: [formatDateAlb(machine.date), machine.invoiceNumber].filter(Boolean).join(' · '), text: machine.customerName });
    cards.forEach(card => {
        historyRows.push({ at: timestampMillis(card.createdAt), title: card.certNo ? 'Garancia u lëshua' : 'Dosja e servisit u hap', meta: [card.certNo, formatDateAlb(card.createdAt)].filter(Boolean).join(' · '), text: card.invoiceNumber ? `Fatura: ${card.invoiceNumber}` : '' });
        (card.repairs || []).filter(repair => repairMatches(repair, machine, card, tickets)).forEach(repair => historyRows.push({ at: repairMillis(repair), title: 'Riparim i regjistruar', meta: String(repair.date || ''), text: repair.description || '', href: repair.ticketId ? `pending-detail.html?id=${encodeURIComponent(repair.ticketId)}` : '' }));
    });
    tickets.forEach(ticket => historyRows.push({ at: timestampMillis(ticket.createdAt), title: `${ticket.claimNo || 'Kërkesë servisi'} · ${STATUS[ticket.status] || ticket.status || 'Pa caktuar'}`, meta: [formatDateAlb(ticket.createdAt), ticket.tech || 'Teknik pa caktuar'].join(' · '), text: ticket.issueDescription || '', href: ticketUrl(ticket), timeline: ticket.timeline || [] }));
    historyRows.sort((a, b) => b.at - a.at);
    const sharedRepairs = cards.flatMap(card => (card.repairs || []).filter(repair => !repairMatches(repair, machine, card, tickets)).map(repair => ({ card, repair })));
    $('machine-root').innerHTML = `<a class="gn-back-link" href="machines.html">← Të gjitha makineritë</a><div class="dg-heading"><div><div class="dg-eyebrow">DOSJA E MAKINERISË</div><h1 style="margin-top:10px">${esc(machine.name)}</h1><p class="mp-serial">${esc(machine.customerName)} · S/N ${esc(machine.serialNumber || 'Mungon')}</p></div><span class="dg-badge ${cover.state === 'active' ? 'dg-green' : cover.state === 'expired' ? 'dg-amber' : ''}">${esc(cover.badge.label)}</span></div>
    <div class="mp-detail"><div class="mp-stack"><section class="dg-panel dg-inset"><div class="mp-card-heading"><h2>Historia e kësaj makinerie</h2><span class="dg-small dg-muted">${tickets.length} kërkesa</span></div><div class="dg-actions">${active.length ? `<a class="dg-button dg-primary" href="${ticketUrl(active[0])}">Hap kërkesën aktive ↗</a>` : ''}<a class="dg-button ${active.length ? '' : 'dg-primary'}" href="${esc(machineUrl(machine, 'claim.html'))}">＋ Kërkesë e re</a></div><ol class="mp-history">${historyRows.map(row => `<li><b>${esc(row.title)}</b><small>${esc(row.meta)}</small>${row.text ? `<p>${esc(row.text)}</p>` : ''}${row.timeline?.length ? `<details style="margin-top:10px"><summary class="dg-small dg-muted">Shiko ${row.timeline.length} hapa të servisit</summary>${row.timeline.map(step => `<p class="dg-small">${esc(step.title)}<small>${esc(step.when)} · ${esc(step.who)}</small></p>`).join('')}</details>` : ''}${row.href ? `<a class="dg-text-button" href="${row.href}" style="display:inline-block;margin-top:8px">Hap kërkesën ↗</a>` : ''}</li>`).join('') || '<li>Nuk ka ende histori të regjistruar.</li>'}</ol></section>
    ${sharedRepairs.length ? `<section class="dg-panel dg-inset"><h2>Shënime në certifikatën e përbashkët</h2><p class="mp-certificate-note">Këto riparime nuk kanë lidhje të verifikueshme me këtë makineri. Certifikata mbulon disa makineri.</p>${sharedRepairs.map(({ card, repair }) => `<div class="mp-ticket-intake"><b>${esc(card.certNo || 'Certifikatë')} · ${esc(repair.date || '')}</b><p>${esc(repair.description || 'Riparim')}</p></div>`).join('')}</section>` : ''}</div>
    <div class="mp-stack"><section class="dg-panel dg-inset"><div class="dg-eyebrow">MBULIMI</div>${cards.length ? cards.map(card => `<div class="mp-cert"><h3 style="margin-top:15px">${esc(card.certNo || 'Dosje servisi')}</h3><div class="dg-facts"><div class="dg-fact"><span>Pjesët</span><b>${card.partsMonths != null ? `${esc(card.partsMonths)} muaj` : 'Pa periudhë'}</b></div><div class="dg-fact"><span>Puna</span><b>${card.labourMonths != null ? `${esc(card.labourMonths)} muaj` : 'Pa periudhë'}</b></div></div><hr class="dg-rule"><div class="dg-small dg-muted">Garancia e pjesëve deri më</div><div class="dg-display" style="font-size:23px;margin-top:5px;color:var(--dg-cyan)">${esc(formatDateAlb(card.warrantyUntil) || 'Pa garanci të lëshuar')}</div>${card.certNo ? `<a class="dg-text-button" style="display:inline-block;margin-top:12px" href="${esc(printUrl(card, machine))}" target="_blank" rel="noopener">Hap certifikatën për printim ↗</a>` : ''}</div>`).join('') : '<p style="margin-top:15px">Nuk ka garanci të lëshuar për këtë makineri.</p><a class="dg-text-button" href="issue.html" style="display:inline-block;margin-top:12px">Lësho garanci ↗</a>'}</section>
    <section class="dg-panel dg-inset"><h2>Pranimi i pajisjes</h2>${tickets.length ? tickets.map(ticket => `<div class="mp-ticket-intake"><a href="${ticketUrl(ticket)}">${esc(ticket.claimNo || 'Kërkesë servisi')} ↗</a><p class="dg-small"><b>Gjendja:</b> ${esc(ticket.intake?.condition || 'E paregjistruar')}</p><p class="dg-small"><b>Aksesorët:</b> ${esc(ticket.intake?.accessories || 'Të paregjistruar')}</p><p class="dg-small dg-muted">${Number(ticket.photoCount) || 0} foto të pranimit</p>${Number(ticket.photoCount) > 0 ? `<button class="dg-text-button" data-photos="${esc(ticket.id)}" type="button">Shfaq fotot</button><div class="mp-photos" id="photos-${esc(ticket.id)}" aria-live="polite"></div>` : ''}</div>`).join('') : '<p class="dg-small dg-muted" style="margin-top:12px">Nuk ka pranim në servis për këtë makineri.</p>'}</section></div></div>`;
    $('machine-root').querySelectorAll('[data-photos]').forEach(button => button.addEventListener('click', () => loadPhotos(button)));
}
function printUrl(card, machine) {
    return `https://danfosal-app.web.app/warranty-card.html?${new URLSearchParams({ product: (card.items || []).map(item => item.name || item.product || '').join(', '), serial: (card.items || []).map(item => item.serialNumber || '').filter(Boolean).join(', '), buyer: card.customerName || machine.customerName, date: formatDateAlb(card.purchaseDate || machine.date || card.createdAt), location: card.location || 'Danfos', id: card.id })}`;
}
async function loadPhotos(button) {
    const ticketId = button.dataset.photos, target = $(`photos-${ticketId}`), generation = renderGeneration;
    button.disabled = true; button.textContent = 'Duke ngarkuar…';
    try {
        const snap = await getDocs(collection(db, 'serviceTickets', ticketId, 'photos'));
        if (generation !== renderGeneration) return;
        const photos = snap.docs.map(doc => doc.data()).filter(photo => /^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(photo.dataUrl || ''));
        target.innerHTML = photos.map(photo => `<figure><img src="${esc(photo.dataUrl)}" alt="${esc(photo.name || 'Foto pranimi')}" loading="lazy"><figcaption>${esc(photo.name || 'Foto pranimi')}</figcaption></figure>`).join('') || '<p class="dg-small dg-muted">Nuk ka foto të disponueshme.</p>';
        button.hidden = true;
    } catch (error) { console.error(error); if (generation === renderGeneration) { target.textContent = 'Fotot nuk u ngarkuan. Provoni përsëri.'; button.disabled = false; button.textContent = 'Provo përsëri'; } }
}
window.addEventListener('popstate', render);
ready.then(() => {
    const unsubscribers = Object.keys(sources).map(name => onSnapshot(collection(db, name), snap => {
        sources[name] = snap.docs.map(doc => ({ ...doc.data(), id: doc.id, ...(name === 'storeSales' || name === 'onlineOrders' ? { collectionName: name } : {}) }));
        loaded.add(name);
        if (loaded.size === 4) { machines = buildMachineDirectory([...sources.storeSales, ...sources.onlineOrders], sources.warrantyCards); $('machine-error').hidden = true; announceConnection('connected'); render(); }
    }, error => { $('machine-root').setAttribute('aria-busy', 'false'); showError($('machine-error'), error); }));
    window.addEventListener('pagehide', () => unsubscribers.forEach(unsubscribe => unsubscribe()), { once: true });
}).catch(error => { $('machine-root').setAttribute('aria-busy', 'false'); showError($('machine-error'), error); });
