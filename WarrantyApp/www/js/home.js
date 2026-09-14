import { collection, onSnapshot, getDocs } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { renderHeader, renderAuroraBackground, renderWarrantyScene, escapeHtml, daysAgo, announceConnection } from './garanci-shared.js';
import { toMillis, formatDayAlb } from './garanci-data.js';
import { db, ready, showError } from './garanci-app.js';
const $ = id => document.getElementById(id);
$('header-slot').outerHTML = renderHeader('home');
$('app-root').insertAdjacentHTML('afterbegin', renderAuroraBackground());
$('warranty-scene').innerHTML = renderWarrantyScene({model:'Danfos Garanci',serial:'CERTIFIKATË · HISTORI · SERVIS',period:'Kujdes për çdo makinë',caption:'DANFOS GARANCI'});
$('today-label').textContent = formatDayAlb(Date.now());
let tickets = [], cards = [], sales = null;
const unsubscribers = [];
const isOpen = t => !['completed','rejected','cancelled'].includes(t.status);
const dateKey = value => { const d=new Date(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
function attentionReason(t) {
    const today=dateKey(Date.now());
    if ((t.parts||[]).some(p => p.status!=='received' && p.expectedOn && p.expectedOn<today)) return [0,'Pjesë të vonuara'];
    if (t.promisedBy && t.promisedBy<today) return [1,'Afati ka kaluar'];
    if (!String(t.tech||'').trim()) return [2,'Caktoni një teknik'];
    if (t.priority==='Urgjent') return [3,'Kërkesë urgjente'];
    if (toMillis(t.updatedAt||t.createdAt)<Date.now()-7*86400000) return [4,'Përditësoni ecurinë'];
    return null;
}
function render() {
    const open=tickets.filter(isOpen), now=Date.now();
    $('open-count').textContent=open.length;
    $('urgent-count').textContent=`${open.filter(t=>t.priority==='Urgjent').length} kërkesa urgjente`;
    $('parts-count').textContent=open.filter(t=>t.status==='waiting_parts').length;
    $('renewal-count').textContent=cards.filter(c=>toMillis(c.warrantyUntil)>=now && toMillis(c.warrantyUntil)<=now+30*86400000).length;
    $('active-summary').textContent=`${cards.filter(c=>toMillis(c.warrantyUntil)>=now).length} garanci aktive`;
    const attention=open.map(t=>({t,reason:attentionReason(t)})).filter(x=>x.reason).sort((a,b)=>a.reason[0]-b.reason[0] || toMillis(a.t.createdAt)-toMillis(b.t.createdAt)).slice(0,5);
    $('attention-list').innerHTML=attention.map(({t,reason})=>`<a class="dg-attention-row dg-row" href="pending-detail.html?id=${encodeURIComponent(t.id)}"><span class="dg-orb" aria-hidden="true">!</span><div><b>${escapeHtml(t.productName||'Makina')}</b><p>${escapeHtml(t.customerName||'Klient')} · ${escapeHtml(reason[1])}</p></div><small>${escapeHtml(daysAgo(t.createdAt))} ↗</small></a>`).join('') || '<div class="dg-empty">✓ Asnjë kërkesë nuk kërkon vëmendje tani.</div>';
    const today=open.filter(t=>toMillis(t.scheduledAt)&&dateKey(toMillis(t.scheduledAt))===dateKey(now)).sort((a,b)=>toMillis(a.scheduledAt)-toMillis(b.scheduledAt));
    $('schedule-list').innerHTML=today.map(t=>`<a class="dg-row" href="pending-detail.html?id=${encodeURIComponent(t.id)}"><span class="dg-time-chip">${new Date(toMillis(t.scheduledAt)).toLocaleTimeString('sq-AL',{hour:'2-digit',minute:'2-digit'})}</span><div><b>${escapeHtml(t.customerName)}</b><p>${escapeHtml(t.productName)} · ${escapeHtml(t.tech||'Pa teknik')}</p></div><span>↗</span></a>`).join('') || '<div class="dg-empty">Nuk ka takime të planifikuara për sot.</div>';
    if(sales){const delays=cards.map(c=>{const issued=toMillis(c.createdAt),sold=sales.get(`${c.saleType}:${c.saleId}`);return sold&&issued>=sold?(issued-sold)/86400000:null;}).filter(v=>v!==null);$('issue-delay').textContent=delays.length?`${(delays.reduce((a,b)=>a+b,0)/delays.length).toFixed(1)} ditë mesatarisht nga shitja te garancia`:'';}
}
ready.then(async()=>{
    for(const [name,set] of [['serviceTickets',v=>tickets=v],['warrantyCards',v=>cards=v]]) unsubscribers.push(onSnapshot(collection(db,name),snap=>{announceConnection('connected');set(snap.docs.map(d=>({...d.data(),id:d.id})));render();},e=>showError($('page-error'),e)));
    try { const snaps=await Promise.all(['storeSales','onlineOrders'].map(n=>getDocs(collection(db,n))));sales=new Map();snaps.forEach((snap,i)=>snap.forEach(d=>sales.set(`${i?'onlineOrder':'storeSale'}:${d.id}`,toMillis(d.data().timestamp||d.data().createdAt))));render(); } catch(e){showError($('page-error'),e);}
}).catch(e=>showError($('page-error'),e));
window.addEventListener('beforeunload',()=>unsubscribers.forEach(fn=>fn()));
