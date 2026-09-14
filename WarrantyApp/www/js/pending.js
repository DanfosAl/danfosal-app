import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { renderHeader, renderAuroraBackground, escapeHtml, daysAgo, announceConnection } from './garanci-shared.js';
import { toMillis } from './garanci-data.js';
import { db, ready, showError } from './garanci-app.js';
const $=id=>document.getElementById(id);
$('header-slot').outerHTML=renderHeader('pending');$('app-root').insertAdjacentHTML('afterbegin',renderAuroraBackground());
const labels={received:'Pa caktuar',in_progress:'Në servis',waiting_parts:'Presin pjesë',completed:'Përfunduar',rejected:'Refuzuar',cancelled:'Anuluar'};
const closed=['completed','rejected','cancelled'];let tickets=[],filter=new URLSearchParams(location.search).get('filter')||'all';
if(!['all','urgent','received','waiting_parts','closed'].includes(filter))filter='all';
function render(){
    document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter));});
    const term=$('search-input').value.trim().toLocaleLowerCase();
    const shown=tickets.filter(t=>(filter==='closed'?closed.includes(t.status):!closed.includes(t.status))&&(filter!=='urgent'||t.priority==='Urgjent')&&(!['received','waiting_parts'].includes(filter)||(t.status||'received')===filter)&&[t.customerName,t.productName,t.serialNumber,t.claimNo,t.tech].join(' ').toLocaleLowerCase().includes(term));
    const columns=filter==='closed'?closed:['received','in_progress','waiting_parts'];
    $('claim-list').innerHTML=columns.map((status,i)=>{const list=shown.filter(t=>(t.status||'received')===status).sort((a,b)=>Number(b.priority==='Urgjent')-Number(a.priority==='Urgjent')||toMillis(a.createdAt)-toMillis(b.createdAt));return `<section class="dg-column"><div class="dg-column-head"><h2><span class="dg-dot dg-dot-${i}"></span>${labels[status]}</h2><span class="dg-count">${list.length}</span></div><div class="dg-stack">${list.map(t=>`<a class="dg-job" data-depth href="pending-detail.html?id=${encodeURIComponent(t.id)}"><div class="dg-job-top"><span>${escapeHtml(t.claimNo||'#'+t.id.slice(0,6))}</span>${t.priority==='Urgjent'?'<span class="dg-tag dg-tag-danger">Urgjent</span>':''}</div><h3>${escapeHtml(t.productName||'Makina')}</h3><p>${escapeHtml(t.customerName||'Klient')} · S/N ${escapeHtml(t.serialNumber||'—')}</p><div class="dg-job-foot"><span>${escapeHtml(t.tech||'Cakto teknikun')}</span><small>${escapeHtml(daysAgo(t.createdAt))}</small></div>${t.promisedBy?`<div class="dg-deadline">Afati: ${escapeHtml(t.promisedBy)}</div>`:''}</a>`).join('')||'<div class="dg-empty">Asnjë kërkesë këtu.</div>'}</div></section>`;}).join('');
}
$('search-input').addEventListener('input',render);$('filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(b){filter=b.dataset.filter;render();}});
ready.then(()=>{const unsub=onSnapshot(collection(db,'serviceTickets'),snap=>{announceConnection('connected');tickets=snap.docs.map(d=>({...d.data(),id:d.id}));render();},e=>showError($('page-error'),e));window.addEventListener('beforeunload',unsub);}).catch(e=>showError($('page-error'),e));
