// Stock > Website: prices changed on danfosal.com, waiting for a decision here.
//
// Every morning the shop PC (tools/website-sync) compares the website with this app. When a
// website price is new and differs from the product's price here - usually a discount set on the
// website - it writes a proposal to `websitePriceProposals`. Accept puts the website price on the
// product; Ignore keeps this app's price and doesn't ask again until the website price changes.
// Nothing changes a price without one of those two clicks. The same morning run copies website
// orders into Online orders and sends the stock, prices and costs to AI Commerce, which shows
// what differs on the website (and fixes it there, also only after a confirmation).
import { db, doc, writeBatch } from './firebase.js';
import { esc, int, icon, plural, day, money2, toast, openModal } from './ui.js';
import { toMs } from './data.js';

const SHOWN_HISTORY = 15;
const decided = p => p.status === 'accepted' || p.status === 'ignored' || p.status === 'resolved';
const STATUS = { accepted: ['Website price used', 'ok'], ignored: ['Kept this price', ''], resolved: ['Prices match again', 'ok'] };

function changePct(p) {
    if (!(p.shopPrice > 0)) return '';
    const d = (p.websitePrice - p.shopPrice) / p.shopPrice;
    return `${d > 0 ? '+' : '−'}${Math.abs(Math.round(d * 100))}%`;
}

function syncPanel(ws, now) {
    if (!ws) return `<div class="panel" style="padding:14px 18px;display:flex;gap:12px;align-items:center">${icon('sync_disabled')}
        <span class="muted" style="flex:1">The website sync hasn't run yet. It runs every morning on the shop PC once it is set up (tools/website-sync).</span></div>`;
    const t = toMs(ws.lastRunAt);
    const fresh = now - t < 36 * 3600000;
    const site = ws.website || {};
    const facts = [
        site.products != null ? `${int(site.products)} products on the website, ${int(site.linked || 0)} linked to this app` : '',
        site.stock_off ? `<span class="chip warn">${plural(site.stock_off, 'stock difference', 'stock differences')}</span>` : '',
        site.below_cost ? `<span class="chip bad">${int(site.below_cost)} below cost</span>` : '',
        ws.ordersNew ? `${plural(ws.ordersNew, 'website order', 'website orders')} copied to Online orders` : ''
    ].filter(Boolean).join(' · ');
    return `<div class="panel" style="padding:14px 18px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        ${icon(ws.error ? 'error' : fresh ? 'cloud_done' : 'schedule')}
        <div style="flex:1;min-width:240px"><b style="font-weight:500">${ws.error ? 'The last sync failed' : `Synced with the website ${esc(day(t))}, ${new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}</b><br>
            <span class="muted">${ws.error ? esc(ws.error) : facts || 'Everything matched.'}</span></div>
        ${ws.panelUrl ? `<a class="btn small" href="${esc(ws.panelUrl)}" target="_blank" rel="noopener">${icon('open_in_new')}AI Commerce</a>` : ''}</div>`;
}

export function renderWebsite(ctx) {
    const all = ctx.model.websiteProposals || [];
    const pending = ctx.a.websitePrices || [];
    const history = all.filter(decided).sort((x, y) => (Number(y.decidedAt) || toMs(y.updatedAt) || 0) - (Number(x.decidedAt) || toMs(x.updatedAt) || 0)).slice(0, SHOWN_HISTORY);
    const products = new Map(ctx.model.products.map(p => [p._id, p]));
    ctx.setSub(pending.length ? `${plural(pending.length, 'website price waits', 'website prices wait')} for you` : 'No website price waits for you');
    const actions = ctx.setActions(pending.length > 1 ? `<button class="btn money" type="button" id="wp-all">${icon('done_all')}Use all ${int(pending.length)} website prices</button>` : '');

    ctx.body.innerHTML = `
        ${syncPanel(ctx.a.websiteSync, ctx.a.now)}
        ${pending.length ? `<section class="table-wrap"><table class="dt"><thead><tr><th>Product</th><th class="n">Here</th><th class="n">On the website</th><th class="n">Change</th><th class="n">Since</th><th></th></tr></thead>
            <tbody>${pending.map(p => {
                const here = products.get(p.productId);
                const now = here ? Number(here.price) || 0 : p.shopPrice;
                return `<tr data-id="${esc(p._id)}" style="cursor:default">
                    <td class="name"><b>${esc(p.name)}</b><span>${esc([p.code && !String(p.code).startsWith('id:') ? p.code : '', p.websiteName && p.websiteName !== p.name ? `“${p.websiteName}” on the website` : ''].filter(Boolean).join(' · '))}${p.permalink ? ` · <a href="${esc(p.permalink)}" target="_blank" rel="noopener" style="color:var(--violet-2)">open</a>` : ''}</span></td>
                    <td class="n">€${money2(now)}</td>
                    <td class="n"><b>€${money2(p.websitePrice)}</b>${p.onSale ? `<br><span class="chip vio">offer · normal €${money2(p.regularPrice)}</span>` : ''}</td>
                    <td class="n ${p.websitePrice < now ? 'zero' : ''}">${esc(changePct({ ...p, shopPrice: now }))}</td>
                    <td class="n muted">${esc(day(toMs(p.createdAt)))}</td>
                    <td class="n" style="white-space:nowrap"><button class="btn money small" type="button" data-use="${esc(p._id)}">Use €${money2(p.websitePrice)}</button>
                        <button class="btn ghost small" type="button" data-keep="${esc(p._id)}">Keep €${money2(now)}</button></td></tr>`;
            }).join('')}</tbody></table></section>`
        : `<div class="all-clear">${icon('check_circle')}<div><b>Website and shop prices agree.</b><br><span>When you change a price on danfosal.com, it shows up here the next morning, so the shop can follow.</span></div></div>`}
        ${history.length ? `<section class="table-wrap"><table class="dt"><thead><tr><th>Decided</th><th class="n">Website</th><th class="n">Here before</th><th>Outcome</th><th class="n">When</th></tr></thead>
            <tbody>${history.map(p => { const [label, chip] = STATUS[p.status] || [p.status, '']; return `<tr style="cursor:default"><td class="name"><b>${esc(p.name)}</b></td>
                <td class="n">€${money2(p.websitePrice)}</td><td class="n muted">€${money2(p.previousShopPrice ?? p.shopPrice)}</td><td><span class="chip ${chip}">${esc(label)}</span></td>
                <td class="n muted">${esc(day(Number(p.decidedAt) || toMs(p.updatedAt)))}</td></tr>`; }).join('')}</tbody></table></section>` : ''}`;

    const decide = async (list, use) => {
        const batch = writeBatch(db);
        list.forEach(p => {
            const here = products.get(p.productId);
            const before = here ? Number(here.price) || 0 : p.shopPrice;
            if (use && here) batch.update(doc(db, 'products', p.productId), { price: p.websitePrice });
            batch.update(doc(db, 'websitePriceProposals', p._id), { status: use ? 'accepted' : 'ignored', decidedAt: Date.now(), previousShopPrice: before });
        });
        await batch.commit();
    };

    ctx.body.querySelectorAll('[data-use],[data-keep]').forEach(b => b.addEventListener('click', async () => {
        const p = pending.find(x => x._id === (b.dataset.use || b.dataset.keep));
        if (!p) return;
        b.disabled = true;
        try {
            await decide([p], Boolean(b.dataset.use));
            toast(b.dataset.use ? `${p.name} now costs €${money2(p.websitePrice)} here too` : `${p.name} keeps its price here`);
            await ctx.reload();
        } catch (e) { b.disabled = false; toast(`Couldn't save: ${e.message}`); }
    }));

    actions.querySelector('#wp-all')?.addEventListener('click', async () => {
        const ok = await openModal({
            title: `Use ${plural(pending.length, 'website price', 'website prices')}`, confirmLabel: 'Use them', confirmClass: 'money',
            body: `<p>${pending.map(p => `${esc(p.name)}: €${money2(p.websitePrice)}`).join('; ')}.</p><p class="empty" style="margin:0">Each product's price here becomes its website price. You can change any of them again in Stock › Catalogue.</p>`
        });
        if (!ok) return;
        try { await decide(pending, true); toast(`${plural(pending.length, 'price', 'prices')} updated`); await ctx.reload(); }
        catch (e) { toast(`Couldn't save: ${e.message}`); }
    });
}
