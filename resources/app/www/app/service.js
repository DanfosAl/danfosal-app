// Service workspace: repair tickets and warranty cards.
//
// Tickets are the same serviceTickets records Danfos Garanci and the classic Service page use,
// with the same status values. Saves follow Garanci's rule (WarrantyApp/www/js/service-model.js):
// inside a transaction, re-read the ticket, refuse if someone else changed the same fields, and
// append to the *current* timeline. Completing a ticket records the repair on the machine's
// warranty card, once per ticket, exactly as Garanci does.
import { bootWorkspace } from './workspace.js';
import { db, collection, doc, addDoc, runTransaction, Timestamp } from './firebase.js';
import { esc, int, icon, plural, day, fold, toast, openDrawer } from './ui.js';
import { DAY, toMs, saleTime, orderTime, customerDirectory } from './data.js';

// Status values are shared with Garanci and the classic page; the timeline stays in Albanian like theirs.
const STATUS = {
    received: { en: 'Not started', sq: 'Pa caktuar', chip: '' },
    in_progress: { en: 'In service', sq: 'Në servis', chip: 'vio' },
    waiting_parts: { en: 'Waiting for parts', sq: 'Presin pjesë', chip: 'warn' },
    completed: { en: 'Completed', sq: 'Përfunduar', chip: 'ok' },
    rejected: { en: 'Rejected', sq: 'Refuzuar', chip: 'bad' },
    cancelled: { en: 'Cancelled', sq: 'Anuluar', chip: 'bad' }
};
const CLOSED = new Set(['completed', 'rejected', 'cancelled']);
const FIELD_SQ = { status: 'statusi', tech: 'tekniku', promisedBy: 'afati', notes: 'shënimet' };
const statusChip = s => { const x = STATUS[s] || { en: String(s || 'unknown').replace(/_/g, ' '), chip: '' }; return `<span class="chip ${x.chip}">${esc(x.en)}</span>`; };

const pad = n => String(n).padStart(2, '0');
const nowLabel = () => { const d = new Date(); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const entry = (title, who = 'Servisi') => ({ title, when: nowLabel(), who });

// Same comparison Garanci uses: Timestamps by millis, objects by sorted keys.
const canonical = v => v == null ? null : v.toMillis ? v.toMillis() : Array.isArray(v) ? v.map(canonical)
    : typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

// ================================================================== tickets

const FILTERS = [
    ['open', 'Open', t => !CLOSED.has(t.status)],
    ['received', 'Not started', t => t.status === 'received'],
    ['in_progress', 'In service', t => t.status === 'in_progress'],
    ['waiting_parts', 'Waiting for parts', t => t.status === 'waiting_parts'],
    ['late', 'Past promised date', t => !CLOSED.has(t.status) && t.promisedBy && new Date(t.promisedBy + 'T23:59') < new Date()],
    ['closed', 'Closed', t => CLOSED.has(t.status)],
    ['all', 'All', () => true]
];
const tk = { filter: 'open', q: '', opened: false };

function renderTickets(ctx) {
    const tickets = ctx.model.tickets.slice().sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
    const open = tickets.filter(t => !CLOSED.has(t.status));
    ctx.setSub(`${plural(open.length, 'repair', 'repairs')} open${open.length ? ` · oldest ${plural(Math.floor((ctx.a.now - Math.min(...open.map(t => toMs(t.createdAt)))) / DAY), 'day', 'days')} old` : ''}`);
    const actions = ctx.setActions(`<button class="btn primary" type="button" id="new-ticket">${icon('add')}New repair</button>`);
    actions.querySelector('#new-ticket').addEventListener('click', () => newTicketDrawer(ctx, {}));

    ctx.body.innerHTML = `
        <div class="toolbar">
            <label class="field-search">${icon('search')}<input id="tk-q" type="search" placeholder="Customer, machine, serial or phone" value="${esc(tk.q)}" aria-label="Search repairs"></label>
            <div class="filters" id="tk-f" role="group" aria-label="Filter repairs"></div>
        </div>
        <div class="table-wrap" style="max-height:calc(100vh - 290px)"><table class="dt"><thead><tr>
            <th>Customer and machine</th><th>Problem</th><th>Status</th><th class="n">Open for</th><th class="n">Promised</th><th>Last step</th></tr></thead>
            <tbody id="tk-body"></tbody></table></div>`;
    const draw = () => {
        const terms = fold(tk.q).trim().split(/\s+/).filter(Boolean);
        const searched = tickets.filter(t => { const hay = fold(`${t.customerName} ${t.productName} ${t.serialNumber} ${t.customerPhone} ${t.claimNo || ''} ${t.tech || ''}`); return terms.every(x => hay.includes(x)); });
        ctx.body.querySelector('#tk-f').innerHTML = FILTERS.map(([id, label, test]) =>
            `<button class="filter${id === 'late' ? ' alert' : ''}" type="button" data-f="${id}" aria-pressed="${id === tk.filter}">${esc(label)}<span class="n">${int(searched.filter(test).length)}</span></button>`).join('');
        const f = FILTERS.find(x => x[0] === tk.filter) || FILTERS[0];
        const rows = searched.filter(f[2]);
        ctx.body.querySelector('#tk-body').innerHTML = rows.map(t => {
            const age = Math.floor(((CLOSED.has(t.status) ? toMs(t.completedAt) || toMs(t.updatedAt) || ctx.a.now : ctx.a.now) - toMs(t.createdAt)) / DAY);
            const last = (t.timeline || []).slice(-1)[0];
            const late = !CLOSED.has(t.status) && t.promisedBy && new Date(t.promisedBy + 'T23:59') < new Date();
            return `<tr data-id="${esc(t._id)}" tabindex="0">
                <td class="name"><b>${esc(t.customerName || '?')}</b><span>${esc([t.productName, t.serialNumber ? 'S/N ' + t.serialNumber : '', t.claimNo].filter(Boolean).join(' · '))}</span></td>
                <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(t.issueDescription || '')}">${esc(t.issueDescription || '–')}</td>
                <td>${statusChip(t.status)}${t.tech ? ` <span class="muted" style="font-size:12px">${esc(t.tech)}</span>` : ''}</td>
                <td class="n ${age > 14 && !CLOSED.has(t.status) ? 'zero' : ''}">${isNaN(age) ? '–' : plural(age, 'day', 'days')}</td>
                <td class="n ${late ? 'zero' : 'muted'}">${t.promisedBy ? esc(day(new Date(t.promisedBy).getTime())) : '–'}</td>
                <td class="muted" style="font-size:12px">${last ? esc(last.title) + ' · ' + esc(last.when) : '–'}</td></tr>`;
        }).join('') || `<tr><td colspan="6" class="muted" style="padding:18px">${tickets.length ? 'No repair matches.' : 'No repairs yet.'}</td></tr>`;
    };
    draw();
    ctx.body.querySelector('#tk-q').addEventListener('input', e => { tk.q = e.target.value; draw(); });
    ctx.body.querySelector('#tk-f').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { tk.filter = b.dataset.f; draw(); } });
    const openRow = e => { const tr = e.target.closest('tr[data-id]'); if (tr) ticketDrawer(ctx, ctx.model.tickets.find(t => t._id === tr.dataset.id)); };
    ctx.body.querySelector('#tk-body').addEventListener('click', openRow);
    ctx.body.querySelector('#tk-body').addEventListener('keydown', e => { if (e.key === 'Enter') openRow(e); });
    // Deep links: ?id= opens a ticket (from a customer's history), ?customer= starts a new one.
    if (!tk.opened) {
        tk.opened = true;
        const id = ctx.params.get('id'), customer = ctx.params.get('customer');
        if (id) { const t = ctx.model.tickets.find(x => x._id === id); if (t) ticketDrawer(ctx, t); }
        else if (customer) newTicketDrawer(ctx, { customerName: customer });
    }
}

function ticketDrawer(ctx, t) {
    const closed = CLOSED.has(t.status);
    const card = ctx.model.warranties.find(w => w._id === t.warrantyCardId) || (t.linkedSaleId && ctx.model.warranties.find(w => w.saleId === t.linkedSaleId));
    const until = card && toMs(card.warrantyUntil);
    const { el, close } = openDrawer({
        title: esc(t.productName || 'Repair'),
        sub: `${esc(t.customerName || '?')}${t.customerPhone ? ' · <a href="tel:' + esc(t.customerPhone.replace(/\s/g, '')) + '">' + esc(t.customerPhone) + '</a>' : ''}${t.claimNo ? ' · ' + esc(t.claimNo) : ''}`,
        body: `
            <div class="kv">
                <div><small>Status</small><b>${statusChip(t.status)}</b></div>
                <div><small>Opened</small><b>${toMs(t.createdAt) ? esc(day(toMs(t.createdAt))) : '–'}</b></div>
                <div><small>Warranty</small><b>${card ? (until ? (until > Date.now() ? `<span class="chip ok">until ${esc(day(until))} ${new Date(until).getFullYear()}</span>` : '<span class="chip bad">expired</span>') : '<span class="chip ok">card issued</span>') : '<span class="chip">none found</span>'}</b></div>
            </div>
            <section><h3>Problem</h3><p style="margin:0">${esc(t.issueDescription || '–')}</p>
                <p class="empty" style="margin:4px 0 0">${t.serialNumber ? 'Serial ' + esc(t.serialNumber) : 'No serial number recorded'}${t.lastCustomerContactAt ? ' · customer last contacted ' + esc(day(toMs(t.lastCustomerContactAt))) : ''}</p></section>
            <form class="form-grid" id="tf" novalidate>
                <label class="fld">Status<select id="tf-status">${STATUS[t.status] ? '' : `<option value="${esc(t.status || '')}" selected>${esc(String(t.status || 'unknown').replace(/_/g, ' '))}</option>`}${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${k === t.status ? ' selected' : ''}>${esc(v.en)}</option>`).join('')}</select></label>
                <label class="fld">Technician<input id="tf-tech" value="${esc(t.tech || '')}" placeholder="Name"></label>
                <label class="fld">Promised to the customer by<input id="tf-promised" type="date" value="${esc(t.promisedBy || '')}"></label>
                <label class="fld wide">Service notes<textarea id="tf-notes" rows="3">${esc(t.notes || '')}</textarea>
                    <span class="hint" id="tf-hint">${closed ? '' : 'Setting Completed records this repair on the machine’s warranty card.'}</span></label>
                <p class="err wide" id="tf-err" hidden></p>
            </form>
            <section><h3>Timeline</h3>${(t.timeline || []).length ? `<div class="lines">${t.timeline.slice().reverse().map(x => `
                <div class="line"><div><b>${esc(x.title)}</b><span>${esc(x.when || '')}${x.who ? ' · ' + esc(x.who) : ''}</span></div></div>`).join('')}</div>` : '<p class="empty">No steps recorded.</p>'}</section>`,
        foot: `<button class="btn primary" type="button" id="tf-save">${icon('check')}Save</button>
               <button class="btn" type="button" id="tf-contact">${icon('call')}Customer contacted</button>
               <button class="btn ghost" type="button" id="tf-msg" style="margin-left:auto">${icon('content_copy')}Copy update message</button>`
    });

    const err = el.querySelector('#tf-err');
    const fail = x => { err.textContent = x.message; err.hidden = false; };

    el.querySelector('#tf-save').addEventListener('click', async () => {
        const after = { status: el.querySelector('#tf-status').value, tech: el.querySelector('#tf-tech').value.trim(), promisedBy: el.querySelector('#tf-promised').value, notes: el.querySelector('#tf-notes').value.trim() };
        const changes = Object.fromEntries(Object.entries(after).filter(([k, v]) => !same(t[k] ?? '', v)));
        if (!Object.keys(changes).length) { close(); return; }
        const completing = changes.status === 'completed';
        const btn = el.querySelector('#tf-save'); btn.disabled = true;
        try {
            const ticketRef = doc(db, 'serviceTickets', t._id);
            const cardRef = completing ? (card ? doc(db, 'warrantyCards', card._id) : doc(collection(db, 'warrantyCards'))) : null;
            await runTransaction(db, async tx => {
                const snap = await tx.get(ticketRef);
                if (!snap.exists()) throw new Error('This repair no longer exists. Close it and refresh.');
                const current = snap.data();
                const conflicts = Object.keys(changes).filter(k => !same(t[k] ?? '', current[k] ?? ''));
                if (conflicts.length) throw new Error(`Someone else changed the ${conflicts.map(k => ({ promisedBy: 'promised date', tech: 'technician' }[k] || k)).join(', ')} meanwhile. Close this panel to see their change, then try again.`);
                const cardSnap = cardRef ? await tx.get(cardRef) : null;
                const steps = [];
                if (changes.status) steps.push(entry(`Statusi u ndryshua: ${STATUS[changes.status].sq}`));
                const others = Object.keys(changes).filter(k => k !== 'status');
                if (others.length) steps.push(entry('U përditësua servisi: ' + others.map(k => FIELD_SQ[k] || k).join(', ')));
                const update = { ...changes, updatedAt: Timestamp.now(), timeline: [...(current.timeline || []), ...steps] };
                if (completing) {
                    update.completedAt = Timestamp.now();
                    update.warrantyCardId = cardRef.id;
                    const repair = { ticketId: t._id, createdAt: Timestamp.now(), date: new Date().toLocaleDateString('en-GB'),
                        description: [current.issueDescription, changes.notes ?? current.notes].filter(Boolean).join(' — '),
                        serialNumber: current.serialNumber || '', productName: current.productName || '' };
                    if (cardSnap.exists()) {
                        const old = cardSnap.data().repairs || [];
                        if (!old.some(r => r.ticketId === t._id)) tx.update(cardRef, { repairs: [...old, repair] });
                    } else {
                        tx.set(cardRef, { saleId: current.linkedSaleId || '', saleType: current.linkedSaleType || 'manual', customerName: current.customerName || '',
                            items: [{ name: current.productName || '', serialNumber: current.serialNumber || '' }], location: 'Danfos', createdAt: Timestamp.now(), repairs: [repair] });
                    }
                }
                tx.update(ticketRef, update);
            });
            toast(completing ? 'Repair completed and recorded on the warranty card' : 'Repair saved');
            close(); await ctx.reload();
        } catch (x) { btn.disabled = false; fail(x); }
    });

    el.querySelector('#tf-contact').addEventListener('click', async () => {
        try {
            const ref = doc(db, 'serviceTickets', t._id);
            await runTransaction(db, async tx => {
                const snap = await tx.get(ref);
                if (!snap.exists()) throw new Error('This repair no longer exists.');
                tx.update(ref, { lastCustomerContactAt: Timestamp.now(), timeline: [...(snap.data().timeline || []), entry('Klienti u kontaktua')] });
            });
            toast('Contact recorded'); close(); await ctx.reload();
        } catch (x) { fail(x); }
    });

    // Same wording as Garanci's customer message, ready to paste into WhatsApp or SMS.
    el.querySelector('#tf-msg').addEventListener('click', async () => {
        const due = t.promisedBy ? ` Afati i planifikuar: ${t.promisedBy}.` : '';
        const text = `Përshëndetje ${t.customerName || ''}, ju informojmë për ${t.productName || 'makinën tuaj'} (${t.claimNo || 'kërkesa e servisit'}). Statusi: ${(STATUS[t.status] || {}).sq || 'Në shqyrtim'}.${due} Për pyetje, na kontaktoni. Faleminderit, Danfos.`;
        try { await navigator.clipboard.writeText(text); toast('Message copied'); } catch { fail(new Error('Couldn’t reach the clipboard.')); }
    });
}

// New ticket, in the classic shape so Garanci and the classic page read it. Picking a machine the
// customer bought links the ticket to that sale, which is how Garanci finds the warranty.
function newTicketDrawer(ctx, preset) {
    const dir = ctx.model._directory || (ctx.model._directory = customerDirectory(ctx.model));
    const named = dir.filter(e => e.count > 0 || e.profile).sort((a, b) => (b.last || 0) - (a.last || 0));
    const { el, close } = openDrawer({
        title: 'New repair',
        sub: 'Customer, machine and the problem are required.',
        body: `<form class="form-grid" id="nt" novalidate>
                <label class="fld wide">Customer<input id="nt-name" list="nt-customers" value="${esc(preset.customerName || '')}" autocomplete="off" required></label>
                <datalist id="nt-customers">${named.slice(0, 600).map(e => `<option value="${esc(e.name)}">`).join('')}</datalist>
                <label class="fld">Phone<input id="nt-phone" type="tel" placeholder="+355 6…"></label>
                <label class="fld">Serial number<input id="nt-serial"></label>
                <div class="wide" id="nt-machines"></div>
                <label class="fld wide">Machine<input id="nt-product" list="nt-products" autocomplete="off" required></label>
                <datalist id="nt-products">${ctx.model.products.map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>
                <label class="fld wide">What's wrong<textarea id="nt-issue" rows="3" required></textarea></label>
                <p class="err wide" id="nt-err" hidden></p>
            </form>`,
        foot: `<button class="btn primary" type="button" id="nt-save">${icon('check')}Create repair</button>`
    });
    let link = null;
    const machinesBox = el.querySelector('#nt-machines');
    const fillFromCustomer = () => {
        const e = named.find(x => fold(x.name) === fold(el.querySelector('#nt-name').value.trim()));
        link = null;
        if (!e) { machinesBox.innerHTML = ''; return; }
        const phone = el.querySelector('#nt-phone'); if (!phone.value && e.phone) phone.value = e.phone;
        const bought = [];
        e.sales.filter(s => !s.isReturn).forEach(s => (s.items || []).forEach((it, i) => { if (!it.isService) bought.push({ name: it.name || it.productName, serial: it.serialNumber || '', t: saleTime(s), saleId: s._id, type: 'storeSale', index: i }); }));
        e.orders.forEach(o => (o.items || []).forEach((it, i) => bought.push({ name: it.name || it.productName, serial: it.serialNumber || '', t: orderTime(o), saleId: o._id, type: 'onlineOrder', index: i })));
        bought.sort((a, b) => (b.t || 0) - (a.t || 0));
        machinesBox.innerHTML = bought.length ? `<p class="empty" style="margin:0 0 6px">Bought by ${esc(e.name)}, pick one to link the sale:</p><div class="filters">${bought.slice(0, 12).map((b, i) =>
            `<button class="filter" type="button" data-b="${i}" aria-pressed="false">${esc(b.name || '?')}<span class="n">${b.t ? esc(day(b.t)) : ''}</span></button>`).join('')}</div>` : '';
        machinesBox.querySelectorAll('[data-b]').forEach(btn => btn.addEventListener('click', () => {
            const b = bought[Number(btn.dataset.b)];
            link = b;
            machinesBox.querySelectorAll('[data-b]').forEach(x => x.setAttribute('aria-pressed', String(x === btn)));
            el.querySelector('#nt-product').value = b.name || '';
            if (b.serial) el.querySelector('#nt-serial').value = b.serial;
        }));
    };
    el.querySelector('#nt-name').addEventListener('change', fillFromCustomer);
    el.querySelector('#nt-product').addEventListener('input', () => { if (link && fold(link.name) !== fold(el.querySelector('#nt-product').value)) { link = null; machinesBox.querySelectorAll('[data-b]').forEach(x => x.setAttribute('aria-pressed', 'false')); } });
    if (preset.customerName) fillFromCustomer();

    el.querySelector('#nt-save').addEventListener('click', async () => {
        const v = id => el.querySelector(id).value.trim();
        const err = el.querySelector('#nt-err');
        const problem = !v('#nt-name') ? 'Enter the customer.' : !v('#nt-product') ? 'Enter the machine.' : !v('#nt-issue') ? 'Describe the problem.' : '';
        if (problem) { err.textContent = problem; err.hidden = false; return; }
        const btn = el.querySelector('#nt-save'); btn.disabled = true;
        try {
            const ref = await addDoc(collection(db, 'serviceTickets'), {
                customerName: v('#nt-name'), customerPhone: v('#nt-phone'), productName: v('#nt-product'), serialNumber: v('#nt-serial'),
                issueDescription: v('#nt-issue'), status: 'received', notes: '',
                linkedSaleId: link ? link.saleId : null, linkedSaleType: link ? link.type : null, ...(link ? { linkedItemIndex: link.index } : {}),
                timeline: [entry('Kërkesa u regjistruar', 'Recepsioni')], createdAt: Timestamp.now()
            });
            toast('Repair created');
            close(); await ctx.reload();
            const t = ctx.model.tickets.find(x => x._id === ref.id); if (t) ticketDrawer(ctx, t);
        } catch (x) { btn.disabled = false; err.textContent = `Couldn't save: ${x.message}`; err.hidden = false; }
    });
}

// ================================================================== warranty cards

function renderWarranties(ctx) {
    const now = Date.now();
    const cards = ctx.model.warranties.slice().sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
    const active = cards.filter(c => toMs(c.warrantyUntil) > now).length;
    ctx.setSub(`${plural(cards.length, 'warranty card', 'warranty cards')} · ${int(active)} with a known end date still active`);
    ctx.setActions(`<a class="btn" href="sell.html#sales">${icon('receipt_long')}Issue from a sale</a>`);
    ctx.body.innerHTML = `
        <div class="table-wrap" style="max-height:calc(100vh - 250px)"><table class="dt"><thead><tr>
            <th>Certificate</th><th>Customer</th><th>Machine</th><th class="n">Issued</th><th class="n">Covered until</th><th class="n">Repairs</th></tr></thead>
            <tbody id="wc-body">${cards.map(c => {
                const until = toMs(c.warrantyUntil);
                return `<tr data-id="${esc(c._id)}" tabindex="0">
                    <td class="name"><b>${esc(c.certNo || 'No number')}</b><span>${esc(c.invoiceNumber ? 'Invoice ' + c.invoiceNumber : c.saleType || '')}</span></td>
                    <td>${esc(c.customerName || '–')}</td>
                    <td>${(c.items || []).map(i => `${esc(i.name || '?')}${i.serialNumber ? ` <span class="muted" style="font-family:var(--mono);font-size:11.5px">S/N ${esc(i.serialNumber)}</span>` : ''}`).join('<br>')}</td>
                    <td class="n muted">${toMs(c.createdAt) ? esc(day(toMs(c.createdAt))) + ' ' + new Date(toMs(c.createdAt)).getFullYear() : '–'}</td>
                    <td class="n">${until ? `<span class="chip ${until > now ? 'ok' : 'bad'}">${esc(day(until))} ${new Date(until).getFullYear()}</span>` : '<span class="muted">not set</span>'}</td>
                    <td class="n">${(c.repairs || []).length || ''}</td></tr>`;
            }).join('') || '<tr><td colspan="6" class="muted" style="padding:18px">No warranty cards yet.</td></tr>'}</tbody></table>
            <div class="table-foot">Click a card to open it for printing. Cards with a certificate number come from Danfos Garanci, which sets the 24-month parts and 12-month labour term.</div></div>`;
    const openCard = e => { const tr = e.target.closest('tr[data-id]'); if (tr) window.open(`warranty-card.html?id=${encodeURIComponent(tr.dataset.id)}`, '_blank'); };
    ctx.body.querySelector('#wc-body').addEventListener('click', openCard);
    ctx.body.querySelector('#wc-body').addEventListener('keydown', e => { if (e.key === 'Enter') openCard(e); });
}

// ================================================================== boot

bootWorkspace({
    active: 'service', title: 'Service', defaultTab: 'tickets',
    tabs: [
        { id: 'tickets', label: 'Repairs', icon: 'build', render: renderTickets, count: a => a.openTickets.length },
        { id: 'warranties', label: 'Warranty cards', icon: 'verified', render: renderWarranties }
    ]
});
