import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { renderHeader, renderAuroraBackground, escapeHtml as esc, formatDateAlb, announceConnection } from './garanci-shared.js';
import { db, ready, showError } from './garanci-app.js';
import { isOpenTicket, getScheduledMillis, timestampMillis, localDateKey, dateKeyMillis } from './garanci-workspace.js';
import { formatDayAlb, shortWeekdaysAlb } from './garanci-data.js';
const $ = id => document.getElementById(id), noTech = ticket => !String(ticket.tech || '').trim() || String(ticket.tech).trim().toLowerCase() === 'pa caktuar';
const statusLabels = { received: 'Pa caktuar', in_progress: 'Në shqyrtim', waiting_parts: 'Në pritje të pjesëve', completed: 'Përfunduar', cancelled: 'Anuluar', rejected: 'Refuzuar' };
let tickets = [], selectedDate = localDateKey(), selectedTech = 'all', includeClosed = false, loaded = false;
const urlDate = new URLSearchParams(location.search).get('date'); if (dateKeyMillis(urlDate)) selectedDate = urlDate;
$('header-slot').outerHTML = renderHeader('schedule'); $('app-root').insertAdjacentHTML('afterbegin', renderAuroraBackground());
$('schedule-date').value = selectedDate;
const ticketUrl = ticket => `pending-detail.html?id=${encodeURIComponent(ticket.id)}`;
const matchesTech = ticket => selectedTech === 'all' || (selectedTech === 'unassigned' ? noTech(ticket) : String(ticket.tech || '').trim() === selectedTech.slice(5));
function setDate(date) { if (!dateKeyMillis(date)) return; selectedDate = date; $('schedule-date').value = date; history.replaceState({}, '', `schedule.html?date=${encodeURIComponent(date)}`); render(); }
$('schedule-date').addEventListener('change', event => setDate(event.target.value));
$('schedule-today').addEventListener('click', () => setDate(localDateKey()));
$('schedule-tech').addEventListener('change', event => { selectedTech = event.target.value; render(); });
$('schedule-closed').addEventListener('change', event => { includeClosed = event.target.checked; render(); });
function updateTechnicians() {
    const techs = [...new Set(tickets.filter(ticket => !noTech(ticket)).map(ticket => String(ticket.tech).trim()))].sort((a, b) => a.localeCompare(b, 'sq'));
    $('schedule-tech').innerHTML = '<option value="all">Të gjithë teknikët</option><option value="unassigned">Pa teknik</option>' + techs.map(tech => `<option value="${esc('tech:' + tech)}">${esc(tech)}</option>`).join('');
    if (selectedTech !== 'all' && selectedTech !== 'unassigned' && !techs.includes(selectedTech.slice(5))) selectedTech = 'all';
    $('schedule-tech').value = selectedTech;
}
function renderWeek() {
    const first = new Date(`${selectedDate}T12:00:00`); first.setDate(first.getDate() - (first.getDay() + 6) % 7);
    $('schedule-week').innerHTML = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(first); date.setDate(date.getDate() + index); const dateKey = localDateKey(date);
        const count = tickets.filter(ticket => matchesTech(ticket) && (includeClosed || isOpenTicket(ticket)) && getScheduledMillis(ticket) && localDateKey(getScheduledMillis(ticket)) === dateKey).length;
        return `<button class="sp-day ${dateKey === localDateKey() ? 'sp-today' : ''}" data-day="${dateKey}" type="button" aria-pressed="${dateKey === selectedDate}" aria-label="${esc(formatDayAlb(date))}, ${count} takime"><small>${shortWeekdaysAlb[date.getDay()]}</small><strong>${date.getDate()}</strong><small>${count} takime</small><span class="sp-dots" aria-hidden="true">${'<i></i>'.repeat(Math.min(5, count))}</span></button>`;
    }).join('');
    $('schedule-week').querySelectorAll('[data-day]').forEach(button => button.addEventListener('click', () => setDate(button.dataset.day)));
}
function partsBadge(ticket) {
    const parts = Array.isArray(ticket.parts) ? ticket.parts : [], missing = parts.filter(part => part.status !== 'received');
    if (!parts.length) return '<span class="dg-badge">Pjesët: pa të dhëna</span>';
    if (!missing.length) return '<span class="dg-badge dg-green">Pjesët gati</span>';
    const overdue = missing.some(part => dateKeyMillis(part.expectedOn) && part.expectedOn < localDateKey());
    return `<span class="dg-badge dg-amber">${overdue ? 'Pjesë në vonesë' : `${missing.length} pjesë në pritje`}</span>`;
}
function render() {
    renderWeek(); if (!loaded) return;
    const active = tickets.filter(ticket => isOpenTicket(ticket) && matchesTech(ticket));
    const appointments = tickets.filter(ticket => matchesTech(ticket) && (includeClosed || isOpenTicket(ticket)) && getScheduledMillis(ticket) && localDateKey(getScheduledMillis(ticket)) === selectedDate).sort((a, b) => getScheduledMillis(a) - getScheduledMillis(b));
    const unscheduled = active.filter(ticket => !getScheduledMillis(ticket)).sort((a, b) => timestampMillis(a.createdAt) - timestampMillis(b.createdAt));
    const due = active.filter(ticket => ticket.promisedBy === selectedDate);
    const today = localDateKey();
    const delayedParts = active.flatMap(ticket => (ticket.parts || []).filter(part => part.status !== 'received' && dateKeyMillis(part.expectedOn) && part.expectedOn < today).map(part => ({ ticket, part }))).sort((a, b) => a.part.expectedOn.localeCompare(b.part.expectedOn));
    const arrivingParts = active.flatMap(ticket => (ticket.parts || []).filter(part => part.status !== 'received' && part.expectedOn === selectedDate).map(part => ({ ticket, part })));
    const dayLabel = formatDayAlb(new Date(`${selectedDate}T12:00:00`));
    $('schedule-root').setAttribute('aria-busy', 'false');
    $('schedule-root').innerHTML = `${delayedParts.length ? `<div class="dg-insight"><span aria-hidden="true">◷</span><span>${delayedParts.length} pjesë kanë kaluar datën e pritshme. Kontrolloni mbërritjen para takimit.</span></div>` : ''}<div class="sp-columns"><div class="sp-stack"><section class="dg-panel"><div class="dg-panel-head"><h2>${esc(dayLabel)}</h2><span class="dg-small dg-muted">${appointments.length} takime</span></div>${appointments.map(ticket => `<div class="dg-schedule-row"><div class="dg-schedule-time">${new Date(getScheduledMillis(ticket)).toLocaleTimeString('sq-AL', { hour: '2-digit', minute: '2-digit' })}</div><div><h3>${esc(ticket.productName || 'Makineri')} · ${esc(ticket.customerName || 'Klient')}</h3><div class="dg-row-meta">${esc(ticket.tech || 'Pa teknik')} · ${esc(ticket.mode || 'Në servis')}</div><div class="dg-row-meta">${esc(ticket.claimNo || '')} · ${esc(statusLabels[ticket.status] || ticket.status || 'Pa caktuar')}</div><div class="sp-inline">${partsBadge(ticket)}${ticket.promisedBy ? `<span class="dg-badge ${ticket.promisedBy < today && isOpenTicket(ticket) ? 'dg-amber' : ''}">Afati: ${esc(formatDateAlb(new Date(`${ticket.promisedBy}T12:00:00`)))}</span>` : ''}</div></div><a class="dg-button" href="${ticketUrl(ticket)}">Detajet ↗</a></div>`).join('') || '<p class="sp-empty">Nuk ka takime të planifikuara për këtë ditë. Hapni një kërkesë për të caktuar takimin dhe teknikun.</p>'}</section>
    <section class="dg-panel"><div class="dg-panel-head"><h2>Afatet e kësaj dite</h2><span class="dg-small dg-muted">${due.length}</span></div>${due.map(ticket => `<a class="sp-unscheduled" href="${ticketUrl(ticket)}"><b>${esc(ticket.productName)} · ${esc(ticket.customerName)}</b><p>${esc(ticket.claimNo || '')} · ${esc(ticket.tech || 'Pa teknik')} · ${esc(statusLabels[ticket.status] || ticket.status)}</p><span class="dg-text-button">Kontrollo ecurinë ↗</span></a>`).join('') || '<p class="sp-empty">Nuk ka afate të premtuara për këtë ditë.</p>'}</section>
    <section class="dg-panel"><div class="dg-panel-head"><h2>Pa takim</h2><span class="dg-small dg-muted">${unscheduled.length} kërkesa aktive</span></div>${unscheduled.map(ticket => `<a class="sp-unscheduled" href="${ticketUrl(ticket)}"><b>${esc(ticket.productName || 'Makineri')} · ${esc(ticket.customerName || 'Klient')}</b><p>${esc(ticket.claimNo || '')} · ${esc(ticket.tech || 'Pa teknik')} · hapur ${esc(formatDateAlb(ticket.createdAt))}</p><span class="dg-text-button">Cakto takim ↗</span></a>`).join('') || '<p class="sp-empty">Çdo kërkesë aktive ka një takim të caktuar.</p>'}</section></div>
    <div class="sp-stack">${partsPanel('Pjesët që priten këtë ditë', arrivingParts, 'Nuk ka pjesë me mbërritje të planifikuar për këtë ditë.')}${partsPanel('Pjesë në vonesë', delayedParts, 'Nuk ka pjesë me afat të kaluar.')}
    <div class="sp-info">Takimet, tekniku, pjesët dhe afati i premtuar përditësohen brenda detajeve të kërkesës.</div></div></div>`;
}
function partsPanel(title, records, empty) {
    return `<section class="dg-panel"><div class="dg-panel-head"><h2>${title}</h2><span class="dg-small dg-muted">${records.length}</span></div>${records.map(({ ticket, part }) => `<div class="sp-part"><div><b>${esc(part.name || 'Pjesë')} × ${Number(part.quantity) || 1}</b><p>${esc(ticket.productName)} · ${esc(ticket.customerName)}</p><small>Pritet: ${esc(formatDateAlb(new Date(`${part.expectedOn}T12:00:00`)))} · ${part.status === 'ordered' ? 'Porositur' : 'Nevojitet'}</small></div><a class="dg-text-button" href="${ticketUrl(ticket)}">Hap ↗</a></div>`).join('') || `<p class="sp-empty">${empty}</p>`}</section>`;
}
renderWeek();
ready.then(() => {
    const unsubscribe = onSnapshot(collection(db, 'serviceTickets'), snap => {
        tickets = snap.docs.map(doc => ({ ...doc.data(), id: doc.id })); loaded = true;
        $('schedule-loading').hidden = true; $('schedule-error').hidden = true; announceConnection('connected'); updateTechnicians(); render();
    }, error => { $('schedule-loading').hidden = true; $('schedule-root').setAttribute('aria-busy', 'false'); showError($('schedule-error'), error); });
    window.addEventListener('pagehide', unsubscribe, { once: true });
}).catch(error => { $('schedule-loading').hidden = true; $('schedule-root').setAttribute('aria-busy', 'false'); showError($('schedule-error'), error); });
