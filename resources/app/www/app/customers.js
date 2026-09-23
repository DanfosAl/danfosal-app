// Customers workspace: one list of everyone who buys, one profile per customer, and a review of
// names that are probably the same customer spelled two ways.
//
// A customer is a profile (customers/{id}) or a named buyer who has no profile yet; the profile is
// created the first time the owner saves details for them. Profiles keep the classic fields
// {name, email, phone, address, status, image} plus nipt, so the classic pages still read them.
// Nothing here deletes a customer: merging records the other spelling as an alias, and a merged
// profile is only marked `mergedInto` (the classic delete also deleted the customer's sales).
import { bootWorkspace } from './workspace.js';
import { db, collection, doc, addDoc, updateDoc, setDoc, arrayUnion, writeBatch, Timestamp } from './firebase.js';
import { esc, eur, int, icon, plural, day, fold, money2, toast, openDrawer, openModal } from './ui.js';
import { DAY, productFamily, customerDirectory, lookalikeCustomers, customerKey, saleTime, orderTime, orderTotal, saleInvoiceNumber, shortInvoice, saleSource, toMs } from './data.js';

const directoryOf = m => m._directory || (m._directory = customerDirectory(m));
const reviewOf = m => m._review || (m._review = lookalikeCustomers(directoryOf(m), m.notSameCustomers));

// ================================================================== list

const SEGMENTS = [
    ['all', 'All', () => true],
    ['recent', 'Bought in 90 days', (e, now) => e.last >= now - 90 * DAY],
    ['regular', 'Regulars (3+ purchases)', e => e.count >= 3],
    ['lapsed', 'Not back in 6 months', (e, now) => e.count >= 2 && e.last < now - 180 * DAY],
    ['owes', 'Owes money', e => e.owed > 0.005],
    ['repair', 'Open repair', e => e.tickets.some(t => !CLOSED.has(t.status))],
    ['business', 'Business (NIPT)', e => !!e.nipt],
    ['nophone', 'No phone number', e => !e.phoneDigits && e.count > 0]
];
const CLOSED = new Set(['completed', 'rejected', 'cancelled', 'delivered', 'closed']);
const COLUMNS = [
    ['name', 'Customer', e => fold(e.name)],
    ['count', 'Purchases', e => e.count, 'n'],
    ['revenue', 'Spent', e => e.revenue, 'n'],
    ['last', 'Last purchase', e => e.last || 0, 'n'],
    ['first', 'Customer since', e => e.first || 0, 'n'],
    ['owed', 'Owes', e => e.owed, 'n']
];
const list = { q: null, seg: 'all', sort: 'last', dir: -1 };

function renderList(ctx) {
    const dir = directoryOf(ctx.model), now = ctx.a.now;
    if (list.q === null) list.q = ctx.params.get('q') || '';
    const buyers = dir.filter(e => e.count > 0);
    const spent = buyers.reduce((a, e) => a + e.revenue, 0);
    ctx.setSub(`${int(buyers.length)} customers have bought from you · ${eur(spent)} in total · ${int(ctx.a.newCustomers30)} new in 30 days`);
    const actions = ctx.setActions(`<button class="btn primary" type="button" id="new-customer">${icon('person_add')}New customer</button>`);
    actions.querySelector('#new-customer').addEventListener('click', () => customerDrawer(ctx, null));

    ctx.body.innerHTML = `
        <div class="toolbar">
            <label class="field-search">${icon('search')}<input id="cu-q" type="search" placeholder="Name, phone, NIPT or address" value="${esc(list.q)}" aria-label="Search customers"></label>
            <div class="filters" id="cu-seg" role="group" aria-label="Segment"></div>
        </div>
        <div class="table-wrap" style="max-height:calc(100vh - 290px)"><table class="dt"><thead><tr id="cu-head"></tr></thead><tbody id="cu-body"></tbody></table>
            <div class="table-foot" id="cu-foot"></div></div>`;

    const draw = () => {
        const terms = fold(list.q).trim().split(/\s+/).filter(Boolean);
        const digits = list.q.replace(/\D/g, '');
        const searched = dir.filter(e => {
            if (!terms.length) return true;
            const hay = fold(`${e.name} ${[...e.keys].join(' ')} ${e.nipt} ${e.address} ${e.email}`);
            return terms.every(t => hay.includes(t)) || (digits.length >= 4 && e.phoneDigits.includes(digits));
        });
        ctx.body.querySelector('#cu-seg').innerHTML = SEGMENTS.map(([id, label, test]) =>
            `<button class="filter${id === 'owes' || id === 'nophone' ? ' alert' : ''}" type="button" data-s="${id}" aria-pressed="${id === list.seg}">${esc(label)}<span class="n">${int(searched.filter(e => test(e, now)).length)}</span></button>`).join('');
        const seg = SEGMENTS.find(s => s[0] === list.seg) || SEGMENTS[0];
        const col = COLUMNS.find(c => c[0] === list.sort) || COLUMNS[0];
        const rows = searched.filter(e => seg[2](e, now)).sort((a, b) => { const x = col[2](a), y = col[2](b); return (x > y ? 1 : x < y ? -1 : 0) * list.dir; });
        ctx.body.querySelector('#cu-head').innerHTML = COLUMNS.map(([id, label, , cls]) =>
            `<th class="${cls || ''}" aria-sort="${id === list.sort ? (list.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${id}">${esc(label)}</button></th>`).join('');
        ctx.body.querySelector('#cu-body').innerHTML = rows.slice(0, 400).map(e => `
            <tr data-id="${esc(e.id)}" tabindex="0">
                <td class="name"><b>${esc(e.name)}${e.profile ? '' : ' <span class="chip">no profile</span>'}</b><span>${esc([e.phone, e.nipt ? 'NIPT ' + e.nipt : ''].filter(Boolean).join(' · ') || '–')}</span></td>
                <td class="n">${int(e.count)}</td>
                <td class="n">${e.revenue ? eur(e.revenue) : '–'}</td>
                <td class="n muted">${e.last ? day(e.last) + ' ' + new Date(e.last).getFullYear() : '–'}</td>
                <td class="n muted">${e.first ? day(e.first) + ' ' + new Date(e.first).getFullYear() : '–'}</td>
                <td class="n">${e.owed > 0.005 ? `<span class="chip warn">${eur(e.owed)}</span>` : ''}</td>
            </tr>`).join('') || `<tr><td colspan="6" class="muted" style="padding:18px">No customer matches.</td></tr>`;
        ctx.body.querySelector('#cu-foot').textContent = `${plural(rows.length, 'customer', 'customers')}${rows.length > 400 ? ' (first 400 shown; search to narrow)' : ''}. Walk-in sales are not counted as customers. Amounts include VAT.`;
    };
    draw();
    ctx.body.querySelector('#cu-q').addEventListener('input', e => { list.q = e.target.value; draw(); });
    ctx.body.querySelector('#cu-seg').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) { list.seg = b.dataset.s; draw(); } });
    ctx.body.querySelector('#cu-head').addEventListener('click', e => {
        const b = e.target.closest('[data-sort]'); if (!b) return;
        if (list.sort === b.dataset.sort) list.dir = -list.dir; else { list.sort = b.dataset.sort; list.dir = b.dataset.sort === 'name' ? 1 : -1; }
        draw();
    });
    const open = e => { const tr = e.target.closest('tr[data-id]'); if (tr) customerDrawer(ctx, dir.find(x => x.id === tr.dataset.id)); };
    ctx.body.querySelector('#cu-body').addEventListener('click', open);
    ctx.body.querySelector('#cu-body').addEventListener('keydown', e => { if (e.key === 'Enter') open(e); });
    // Opening from search (Ctrl K) goes straight to that customer.
    if (list.q && !ctx._openedFromQuery) {
        ctx._openedFromQuery = true;
        const exact = dir.find(e => e.keys.has(customerKey(list.q)));
        if (exact) customerDrawer(ctx, exact);
    }
}

// ================================================================== profile

function historyOf(e) {
    const rows = [];
    e.sales.forEach(s => {
        const inv = shortInvoice(saleInvoiceNumber(s));
        rows.push({ t: saleTime(s), icon: s.isReturn ? 'undo' : 'receipt_long', amount: s.isReturn ? -(Number(s.total) || 0) : Number(s.total) || 0,
            title: `${s.isReturn ? 'Return' : s.type === 'easypos' ? 'Receipt' : 'Invoice'}${inv ? ' ' + inv : ''} · ${saleSource(s)}`,
            sub: (s.items || []).map(i => `${Number(i.quantity) > 1 ? i.quantity + ' × ' : ''}${i.name || i.productName || '?'}`).join(', '),
            href: inv ? `sell.html?q=${encodeURIComponent(inv)}#sales` : '' });
    });
    e.orders.forEach(o => rows.push({ t: orderTime(o), icon: 'shopping_bag', amount: orderTotal(o), title: `Online order · ${o.status || 'open'}`,
        sub: (o.items || []).map(i => i.name || i.productName || '?').join(', ') || o.productName || '', href: 'sell.html#online' }));
    e.warranties.forEach(w => rows.push({ t: toMs(w.createdAt), icon: 'verified', amount: null, title: `Warranty ${w.certNo || 'card'} issued`,
        sub: (w.items || []).map(i => `${i.name}${i.serialNumber ? ' · S/N ' + i.serialNumber : ''}`).join(', '), href: `warranty-card.html?id=${encodeURIComponent(w._id)}`, external: true }));
    e.tickets.forEach(t => rows.push({ t: toMs(t.createdAt), icon: 'build', amount: null, title: `Repair: ${t.productName || 'machine'} · ${String(t.status || '').replace(/_/g, ' ')}`,
        sub: t.issueDescription || '', href: `service.html?id=${encodeURIComponent(t._id)}#tickets` }));
    e.debts.forEach(d => rows.push({ t: toMs(d.date) || toMs(d.createdAt), icon: 'account_balance_wallet', amount: null,
        title: `Debt ${d.number || ''} · ${eur(Number(d.totalAmount) || 0, 2)}`, sub: Number(d.remainingBalance) > 0 ? `€${money2(d.remainingBalance)} still owed` : 'Paid', href: 'money.html#owed' }));
    return rows.sort((a, b) => (b.t || 0) - (a.t || 0));
}

// What they own: every product line they bought, with the serial where one is known.
function machinesOf(e) {
    const byName = new Map();
    const add = (name, qty, t, serial) => {
        if (!name) return;
        const k = fold(name); const m = byName.get(k) || { name, qty: 0, last: 0, serials: new Set() };
        m.qty += qty; m.last = Math.max(m.last, t || 0); if (serial) m.serials.add(serial); byName.set(k, m);
    };
    e.sales.filter(s => !s.isReturn).forEach(s => (s.items || []).filter(i => !i.isService).forEach(i => add(i.name || i.productName, Number(i.quantity) || 1, saleTime(s), i.serialNumber)));
    e.orders.forEach(o => (o.items || []).forEach(i => add(i.name || i.productName, Number(i.quantity) || 1, orderTime(o), i.serialNumber)));
    e.warranties.forEach(w => (w.items || []).forEach(i => { const m = byName.get(fold(i.name)); if (m && i.serialNumber) m.serials.add(i.serialNumber); }));
    return [...byName.values()].sort((a, b) => b.last - a.last);
}

function customerDrawer(ctx, e) {
    const isNew = !e;
    e = e || { id: null, name: '', profile: null, keys: new Set(), sales: [], orders: [], warranties: [], tickets: [], debts: [], nipt: '', phone: '', email: '', address: '', revenue: 0, count: 0, owed: 0 };
    const p = e.profile || {};
    const history = isNew ? [] : historyOf(e);
    const machines = isNew ? [] : machinesOf(e);
    const aliases = (p.aliases || []).filter(n => customerKey(n) !== customerKey(e.name));
    const missing = [!e.phoneDigits && 'phone number', !e.nipt && e.sales.some(s => s.type !== 'easypos') && 'NIPT'].filter(Boolean);

    const { el, close } = openDrawer({
        title: isNew ? 'New customer' : esc(e.name),
        sub: isNew ? 'Only the name is required.' : `${e.profile ? 'Customer' : 'Buyer without a profile yet'}${e.first ? ' since ' + esc(day(e.first)) + ' ' + new Date(e.first).getFullYear() : ''}${aliases.length ? ' · also written ' + aliases.map(esc).join(', ') : ''}`,
        body: `
            ${isNew ? '' : `<div class="kv">
                <div><small>Spent</small><b>${eur(e.revenue)}</b></div>
                <div><small>Purchases</small><b>${int(e.count)}</b></div>
                <div><small>${e.owed > 0.005 ? 'Owes' : 'Last purchase'}</small><b>${e.owed > 0.005 ? eur(e.owed) : e.last ? esc(day(e.last)) : '–'}</b></div></div>`}
            ${missing.length ? `<p class="empty" style="margin:0">${icon('info')} Missing: ${missing.join(' and ')}. Add ${missing.length > 1 ? 'them' : 'it'} below so repair updates and invoices reach the right person.</p>` : ''}
            <form class="form-grid" id="cf" novalidate>
                <label class="fld wide">Name<input id="cf-name" value="${esc(e.name)}" required></label>
                <label class="fld">Phone<input id="cf-phone" type="tel" value="${esc(e.phone)}" placeholder="+355 6…"></label>
                <label class="fld">NIPT<input id="cf-nipt" value="${esc(e.nipt)}" placeholder="Businesses only"></label>
                <label class="fld wide">Email<input id="cf-email" type="email" value="${esc(e.email)}"></label>
                <label class="fld wide">Address<input id="cf-address" value="${esc(e.address)}"></label>
                <p class="err wide" id="cf-err" hidden></p>
            </form>
            ${isNew ? '' : `
            <section><h3>What they own</h3>${machines.length ? `<div class="lines">${machines.slice(0, 10).map(m => `
                <div class="line"><div><b>${m.qty > 1 ? int(m.qty) + ' × ' : ''}${esc(m.name)}</b><span>${m.last ? 'Bought ' + esc(day(m.last)) + ' ' + new Date(m.last).getFullYear() : ''}${m.serials.size ? ' · S/N ' + [...m.serials].map(esc).join(', ') : ''}</span></div>
                <span class="n">${e.warranties.some(w => (w.items || []).some(i => fold(i.name) === fold(m.name))) ? '<span class="chip ok">warranty</span>' : ''}</span></div>`).join('')}</div>`
                : '<p class="empty">No products recorded.</p>'}</section>
            <section><h3>History</h3>${history.length ? `<div class="lines">${history.slice(0, 40).map(h => `
                <div class="line"><div><b>${icon(h.icon)} ${h.href ? `<a href="${esc(h.href)}"${h.external ? ' target="_blank"' : ''} style="text-decoration:none">${esc(h.title)}</a>` : esc(h.title)}</b><span>${h.t ? esc(day(h.t)) + ' ' + new Date(h.t).getFullYear() : ''}${h.sub ? ' · ' + esc(h.sub) : ''}</span></div>
                <span class="n">${h.amount === null ? '' : (h.amount < 0 ? '−' : '') + '€' + money2(Math.abs(h.amount))}</span></div>`).join('')}</div>`
                : '<p class="empty">Nothing recorded yet.</p>'}</section>`}`,
        foot: `<button class="btn primary" type="button" id="cf-save">${icon('check')}${isNew ? 'Create customer' : e.profile ? 'Save changes' : 'Save as customer'}</button>
               ${isNew ? '' : `<a class="btn" href="service.html?customer=${encodeURIComponent(e.name)}#tickets">${icon('build')}New repair</a>
               <a class="btn" href="sell.html#new">${icon('point_of_sale')}New sale</a>`}`
    });

    el.querySelector('#cf-save').addEventListener('click', async () => {
        const v = id => el.querySelector(id).value.trim();
        const err = el.querySelector('#cf-err');
        const data = { name: v('#cf-name'), phone: v('#cf-phone'), nipt: v('#cf-nipt').toUpperCase().replace(/\s/g, ''), email: v('#cf-email'), address: v('#cf-address') };
        const clash = directoryOf(ctx.model).find(x => x.id !== e.id && x.keys.has(customerKey(data.name)));
        const problem = !data.name ? 'Enter a name.' : clash ? `${clash.name} already exists. Open that customer instead, or merge the two in Review names.` : '';
        if (problem) { err.textContent = problem; err.hidden = false; return; }
        const btn = el.querySelector('#cf-save'); btn.disabled = true;
        try {
            if (e.profile) {
                const update = { ...data };
                // Renamed: past sales still carry the old spelling, so remember it.
                if (customerKey(data.name) !== customerKey(e.profile.name)) update.aliases = arrayUnion(e.profile.name);
                await updateDoc(doc(db, 'customers', e.profile._id), update);
            } else {
                const profile = { ...data, status: 'Active', image: '', source: 'app', createdAt: Timestamp.now() };
                if (!isNew && customerKey(data.name) !== customerKey(e.name)) profile.aliases = [e.name];
                await addDoc(collection(db, 'customers'), profile);
            }
            toast(`${data.name} saved`);
            close(); await ctx.reload();
        } catch (x) { btn.disabled = false; err.textContent = `Couldn't save: ${x.message}`; err.hidden = false; }
    });
}

// ================================================================== win back

// Customers who bought more than once and haven't been back. Nothing here is automatic: it writes
// the message, the owner sends it from their own WhatsApp. A Karcher machine needs filters, bags
// and descaler, so the people who already own one are the cheapest sales in the shop - and 200 of
// them, worth EUR 202,175 between them, had simply been forgotten. Half have no phone number,
// which is why the till now asks for one.
const wb = { months: 6, sort: 'revenue', only: 'all' };
const MONTHS = [[6, '6 months'], [12, 'A year'], [24, 'Two years']];

// Albanian mobiles are written 06x xxx xxxx; WhatsApp wants 3556x xxx xxxx.
export function waNumber(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('355')) return d;
    if (d.startsWith('0')) return '355' + d.slice(1);
    if (d.length === 9 && d.startsWith('6')) return '355' + d;
    return d;
}

// What to say: their name, what they own, and one reason to come in. Short on purpose - it is a
// message from a shop they know, not a campaign.
function winBackMessage(e, machines) {
    const first = String(e.name || '').trim().split(/\s+/)[0] || '';
    const owns = machines.length ? machines[0].name.replace(/\s*\*?(EU|EU\*)\s*$/i, '').trim() : '';
    return `Pershendetje ${first}, jemi Danfos (Karcher, Tirane). `
        + (owns ? `Keni blere ${owns} tek ne. ` : '')
        + 'Nese ju duhen filtra, qese, solucion ose nje servis per pajisjen, na shkruani ketu - e pergatisim dhe e merrni kur t\u2019ju vije mire. Faleminderit!';
}

// The machine is the reason to write, not the mop it was bought with: prefer a family that is a
// machine, and only fall back to whatever they bought last.
const MACHINE_FAMILIES = new Set(['Pressure washers', 'Vacuums', 'Steam cleaners', 'Floor cleaners & scrubbers', 'Carpet & upholstery', 'Window cleaning']);
function ownedMachines(e) {
    const all = machinesOf(e);
    const machines = all.filter(m => MACHINE_FAMILIES.has(productFamily(m.name, {})));
    return machines.length ? machines.concat(all.filter(m => !machines.includes(m))) : all;
}

function renderWinBack(ctx) {
    const dir = directoryOf(ctx.model), now = ctx.a.now;
    const draw = () => {
        const cut = now - wb.months * 30 * DAY;
        const all = dir.filter(e => e.count >= 2 && e.last && e.last < cut && e.revenue > 0);
        const withPhone = all.filter(e => e.phoneDigits);
        const list = (wb.only === 'phone' ? withPhone : wb.only === 'nophone' ? all.filter(e => !e.phoneDigits) : all)
            .slice().sort((a, b) => wb.sort === 'revenue' ? b.revenue - a.revenue : b.last - a.last);
        const worth = all.reduce((a, e) => a + e.revenue, 0);
        const noPhoneBuyers = dir.filter(e => e.count > 0 && !e.phoneDigits).length;

        ctx.setSub(`${plural(all.length, 'customer', 'customers')} to bring back · ${eur(worth)} spent with you before`);
        ctx.body.innerHTML = `
            <div class="toolbar">
                <div class="seg" role="group" aria-label="Away for" id="wb-months">${MONTHS.map(([m, label]) => `<button type="button" data-m="${m}" aria-pressed="${m === wb.months}">${label}</button>`).join('')}</div>
                <div class="seg" role="group" aria-label="Sort by" id="wb-sort">${[['revenue', 'Biggest spenders'], ['last', 'Away longest']].map(([id, label]) => `<button type="button" data-s="${id}" aria-pressed="${id === wb.sort}">${label}</button>`).join('')}</div>
            </div>
            <div class="kpis">
                <div class="kpi"><small>Haven’t been back</small><span class="v">${int(all.length)}</span><span class="d">bought at least twice, nothing in ${wb.months} months</span></div>
                <div class="kpi"><small>They spent</small><span class="v">${eur(worth)}</span><span class="d">with you before they stopped coming</span></div>
                <div class="kpi"><small>You can message</small><span class="v"${withPhone.length < all.length / 2 ? ' style="color:var(--warn)"' : ''}>${int(withPhone.length)}</span><span class="d">of ${int(all.length)} have a phone number</span></div>
                <div class="kpi"><small>No phone at all</small><span class="v">${int(noPhoneBuyers)}</span><span class="d">buyers you can never reach · the till now asks</span></div>
            </div>
            <div class="filters" id="wb-only" role="group" aria-label="Show">
                ${[['all', 'Everyone', all.length], ['phone', 'Can message', withPhone.length], ['nophone', 'Need a number', all.length - withPhone.length]]
                    .map(([id, label, n]) => `<button class="filter" type="button" data-o="${id}" aria-pressed="${wb.only === id}">${label}<span class="n">${int(n)}</span></button>`).join('')}
            </div>
            <div class="table-wrap" style="max-height:calc(100vh - 400px)"><table class="dt"><thead><tr>
                <th>Customer</th><th>What they own</th><th class="n">Spent</th><th class="n">Purchases</th><th class="n">Last bought</th><th></th></tr></thead>
                <tbody id="wb-body">${list.slice(0, 200).map((e, i) => {
                    const machines = ownedMachines(e);
                    const away = Math.round((now - e.last) / 30 / DAY);
                    return `<tr data-id="${esc(e.id)}" tabindex="0">
                        <td class="name"><b>${esc(e.name)}</b><span>${e.phoneDigits ? esc(e.phone) : '<span style="color:var(--warn)">no phone number</span>'}${e.owed > 0.005 ? ` · owes ${eur(e.owed)}` : ''}</span></td>
                        <td class="muted" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${machines.length ? esc(machines[0].name) + (machines.length > 1 ? ` +${machines.length - 1}` : '') : '–'}</td>
                        <td class="n">${eur(e.revenue)}</td>
                        <td class="n">${int(e.count)}</td>
                        <td class="n muted">${esc(day(e.last))} ${new Date(e.last).getFullYear()}<span style="display:block;font-size:11px">${plural(away, 'month', 'months')} ago</span></td>
                        <td class="n" style="white-space:nowrap">${e.phoneDigits
                            ? `<a class="btn small primary" href="https://wa.me/${waNumber(e.phone)}?text=${encodeURIComponent(winBackMessage(e, machines))}" target="_blank" rel="noopener">${icon('chat')}WhatsApp</a>
                               <button class="btn small ghost" type="button" data-copy="${i}">${icon('content_copy')}</button>`
                            : `<button class="btn small" type="button" data-add="${esc(e.id)}">${icon('add_call')}Add number</button>`}</td></tr>`;
                }).join('') || '<tr><td colspan="6" class="muted" style="padding:18px">Nobody has stayed away that long.</td></tr>'}</tbody></table>
                <div class="table-foot">WhatsApp opens with the message written; you can change it before sending. Nothing is ever sent from the app.</div></div>`;

        ctx.body.querySelector('#wb-months').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) { wb.months = Number(b.dataset.m); draw(); } });
        ctx.body.querySelector('#wb-sort').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) { wb.sort = b.dataset.s; draw(); } });
        ctx.body.querySelector('#wb-only').addEventListener('click', e => { const b = e.target.closest('[data-o]'); if (b) { wb.only = b.dataset.o; draw(); } });
        ctx.body.querySelector('#wb-body').addEventListener('click', async ev => {
            const copy = ev.target.closest('[data-copy]'), addPhone = ev.target.closest('[data-add]'), row = ev.target.closest('tr[data-id]');
            if (copy) {
                const e = list[Number(copy.dataset.copy)];
                try { await navigator.clipboard.writeText(winBackMessage(e, ownedMachines(e))); toast('Message copied'); }
                catch { toast('Couldn\u2019t copy the message', { bad: true }); }
                return;
            }
            if (addPhone) { customerDrawer(ctx, dir.find(x => x.id === addPhone.dataset.add)); return; }
            if (row) customerDrawer(ctx, dir.find(x => x.id === row.dataset.id));
        });
    };
    draw();
}

// ================================================================== review lookalike names

function renderReview(ctx) {
    const pairs = reviewOf(ctx.model);
    ctx.setSub('Names that differ by a letter or two, or share a NIPT. Usually one customer typed two ways.');
    const side = e => `<div><b>${esc(e.name)}</b><span>${plural(e.count, 'purchase', 'purchases')} · ${eur(e.revenue)}${e.last ? ' · last ' + esc(day(e.last)) + ' ' + new Date(e.last).getFullYear() : ''}${e.phone ? ' · ' + esc(e.phone) : ''}${e.nipt ? ' · NIPT ' + esc(e.nipt) : ''}</span></div>`;
    ctx.body.innerHTML = `
        <div class="panel" style="padding:14px 16px"><p class="empty" style="margin:0">Merging keeps every sale, repair and warranty and shows them under one customer; the other spelling is kept as an alias so future receipts with it land in the same place. Nothing is deleted. If they really are different people, say so and the pair won't be suggested again.</p></div>
        ${pairs.length ? `<div class="table-wrap"><table class="dt"><thead><tr><th>Name A</th><th>Name B</th><th>Why</th><th></th></tr></thead>
        <tbody id="rv-body">${pairs.map((p, i) => `
            <tr data-i="${i}" style="cursor:default"><td class="name">${side(p.a)}</td><td class="name">${side(p.b)}</td>
                <td>${p.sameNipt ? '<span class="chip vio">same NIPT</span>' : `<span class="chip">${plural(p.distance, 'letter', 'letters')} apart</span>`}${p.conflict ? ' <span class="chip warn">different phone or NIPT</span>' : ''}</td>
                <td class="n" style="white-space:nowrap"><button class="btn small primary" type="button" data-merge="${i}">${icon('merge')}Same customer</button>
                    <button class="btn small ghost" type="button" data-notsame="${i}">Different</button></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="all-clear">${icon('check_circle')}<div><b>No lookalike names.</b><br><span>New pairs appear here when a receipt spells an existing customer differently.</span></div></div>`}`;
    const tb = ctx.body.querySelector('#rv-body');
    if (!tb) return;
    tb.addEventListener('click', async ev => {
        const m = ev.target.closest('[data-merge]'), n = ev.target.closest('[data-notsame]');
        if (m) mergeDialog(ctx, pairs[Number(m.dataset.merge)]);
        if (n) {
            const pair = pairs[Number(n.dataset.notsame)];
            try {
                await setDoc(doc(db, 'settings', 'customerReview'), { notSame: arrayUnion(pair.pairKey) }, { merge: true });
                toast(`${pair.a.name} and ${pair.b.name} kept separate`); await ctx.reload();
            } catch (x) { toast(`Couldn't save: ${x.message}`, { bad: true }); }
        }
    });
}

async function mergeDialog(ctx, pair) {
    const ok = await openModal({
        title: 'Merge into one customer',
        confirmLabel: 'Merge',
        body: `<p>Which spelling is correct? The other becomes an alias.</p>
            <label class="check"><input type="radio" name="mg" value="a" checked><span><b style="font-weight:500">${esc(pair.a.name)}</b><br><span class="empty" style="padding:0">${plural(pair.a.count, 'purchase', 'purchases')}${pair.a.profile ? '' : ' · no profile'}</span></span></label>
            <label class="check"><input type="radio" name="mg" value="b"><span><b style="font-weight:500">${esc(pair.b.name)}</b><br><span class="empty" style="padding:0">${plural(pair.b.count, 'purchase', 'purchases')}${pair.b.profile ? '' : ' · no profile'}</span></span></label>`
    });
    if (!ok) return;
    const keepA = ok.querySelector('input[name="mg"]:checked').value === 'a';
    const keep = keepA ? pair.a : pair.b, other = keepA ? pair.b : pair.a;
    const otherNames = [other.name, ...((other.profile && other.profile.aliases) || [])];
    // Fill blanks on the kept profile from the other one; never overwrite what's there.
    const fill = {};
    ['phone', 'nipt', 'email', 'address'].forEach(f => { if (!keep[f] && other[f]) fill[f] = other[f]; });
    const batch = writeBatch(db);
    let keepId;
    if (keep.profile) {
        keepId = keep.profile._id;
        batch.update(doc(db, 'customers', keepId), { ...fill, aliases: arrayUnion(...otherNames) });
    } else {
        const ref = doc(collection(db, 'customers'));
        keepId = ref.id;
        batch.set(ref, { name: keep.name, phone: keep.phone || '', nipt: keep.nipt || '', email: keep.email || '', address: keep.address || '', ...fill,
            status: 'Active', image: '', source: 'app', aliases: otherNames, createdAt: Timestamp.now() });
    }
    if (other.profile) batch.update(doc(db, 'customers', other.profile._id), { mergedInto: keepId, mergedAt: Timestamp.now() });
    try {
        await batch.commit();
        toast(`${other.name} merged into ${keep.name}`);
        await ctx.reload();
    } catch (x) { toast(`Couldn't merge: ${x.message}`, { bad: true }); }
}

// ================================================================== boot

bootWorkspace({
    active: 'customers', title: 'Customers', defaultTab: 'all',
    tabs: [
        { id: 'all', label: 'Customers', icon: 'group', render: renderList },
        { id: 'winback', label: 'Win back', icon: 'campaign', render: renderWinBack },
        { id: 'review', label: 'Review names', icon: 'merge', render: renderReview, count: (a, m) => reviewOf(m).length }
    ]
});
