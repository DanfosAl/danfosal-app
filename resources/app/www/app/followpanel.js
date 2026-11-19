// Sell › Instagram's Follow up panel (Finding #81): the customers who need the owner now, from
// the Instagram bot's reading of each chat. Drawing only - the lists come from followups.js, the
// clicks are handled in leads.js (data-fu-order / data-fu-done). No Firestore here.
import { esc, eur, int, icon, ago, day } from './ui.js';
import { who, chatLink } from './followups.js';

const STAGE_CHIP = { asking: 'vio', deciding: 'warn', ordering: 'ok', ordered: 'ok', 'after-sale': '', other: '' };

export function followPanel(fu, products, now, total) {
    const byId = new Map(products.map(p => [p._id, p]));
    const productLine = c => c.card.products.map(x => {
        const p = (x.id && byId.get(x.id)) || products.find(q => q.name === x.name);
        if (!p) return `${esc(x.name)} <span class="muted">(not in the catalogue)</span>`;
        const stock = Number(p.stock) || 0;
        return `<a href="stock.html?q=${encodeURIComponent(p.name)}#catalogue" style="text-decoration:none">${esc(p.name)}</a> <span class="muted">${Number(p.price) ? eur(Number(p.price)) + ' · ' : ''}</span><span${stock ? ' class="muted"' : ' style="color:var(--bad)"'}>${stock ? int(stock) + ' in stock' : 'out of stock'}</span>`;
    }).join(' · ');
    const row = (c, kind) => `
        <div class="line" data-chat="${esc(c._id)}" style="display:flex;align-items:flex-start;gap:8px 12px;flex-wrap:wrap">
            <div style="min-width:0;flex:1 1 260px">
                <b>${esc(who(c))}${c.card.stage ? ` <span class="chip ${STAGE_CHIP[c.card.stage] || ''}" style="display:inline-block;margin-left:6px;vertical-align:1px">${esc(c.card.stage)}</span>` : ''}</b>
                <span>${c.card.summary ? esc(c.card.summary) : 'No reading yet – the bot reads the chat at the next message.'}</span>
                ${c.card.nextStep ? `<span>${icon('arrow_forward')} ${esc(c.card.nextStep)}</span>` : ''}
                ${c.card.products.length ? `<span>${productLine(c)}</span>` : ''}
            </div>
            <div class="n" style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;margin-left:auto;max-width:100%">
                <span class="muted" style="white-space:nowrap">${kind === 'waiting' ? 'wrote ' : 'you answered '}${esc(ago(c.since, now))}</span>
                <span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
                    <a class="btn small primary" href="${esc(chatLink(c))}" target="_blank" rel="noopener">${icon('chat')}Open chat</a>
                    ${c.card.products.some(x => x.id && byId.get(x.id)) ? `<button class="btn small" type="button" data-fu-order="${esc(c._id)}">${icon('add')}Add as order</button>` : ''}
                    <button class="btn small ghost" type="button" data-fu-done="${esc(c._id)}">${icon('check')}Done</button>
                    <button class="btn small ghost" type="button" data-fu-private="${esc(c._id)}" title="Family, friends: the bot ignores this account until you say otherwise">${icon('visibility_off')}Private</button>
                </span>
            </div>
        </div>`;
    if (!total) return `<div class="panel" style="padding:12px 16px;display:flex;gap:12px;align-items:center">${icon('info')}<span class="muted" style="flex:1">The Instagram bot keeps its memory of each chat since 19 Nov 2026. Customers who are waiting for your answer, or who went quiet after you answered, will show here.</span></div>`;
    return `
        <div class="panel">
            <div class="viz-head"><h2 class="panel-title">${icon('forum')} Follow up</h2><span class="muted" style="font-size:12.5px">From the bot's reading of each chat · private chats never show</span></div>
            ${fu.waiting.length || fu.quiet.length ? '' : '<p class="empty">Nobody is waiting for your answer, and nobody to follow up.</p>'}
            ${fu.waiting.length ? `<h3 style="margin:8px 0 4px">Waiting for your answer <span class="muted">· ${int(fu.waiting.length)}</span></h3><div class="lines">${fu.waiting.map(c => row(c, 'waiting')).join('')}</div>` : ''}
            ${fu.quiet.length ? `<h3 style="margin:14px 0 4px">Went quiet after your answer <span class="muted">· ${int(fu.quiet.length)}</span></h3><div class="lines">${fu.quiet.map(c => row(c, 'quiet')).join('')}</div>
                <p class="chart-note">They asked about a product, you answered, and they didn’t order. A short follow-up (“still interested? we can send it tomorrow”) often turns that into a sale.</p>` : ''}
        </div>`;
}

// The accounts the bot ignores, with who decided and a way back. Folded unless asked for.
export function privatePanel(list, open) {
    if (!list.length) return '';
    return `
        <div class="panel" style="padding:12px 16px">
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
                ${icon('visibility_off')}<span style="flex:1;min-width:200px"><b>${int(list.length)} private ${list.length === 1 ? 'chat' : 'chats'}</b> <span class="muted">· the bot doesn’t store, read or log ${list.length === 1 ? 'it' : 'them'}, and ${list.length === 1 ? 'it never shows' : 'they never show'} here</span></span>
                <button class="btn small ghost" type="button" data-fu-privlist>${icon(open ? 'expand_less' : 'expand_more')}${open ? 'Hide' : 'Show'}</button>
            </div>
            ${open ? `<div class="lines" style="margin-top:8px">${list.map(c => `
                <div class="line" style="display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap">
                    <div style="min-width:0;flex:1 1 220px"><b>${esc(who(c))}</b><span>${c.ignoredBy === 'ai' ? 'the bot saw a private chat' : 'you marked it private'}${c.ignoredAt ? ' · ' + esc(day(c.ignoredAt)) : ''}</span></div>
                    <button class="btn small" type="button" data-fu-public="${esc(c._id)}" style="margin-left:auto">${icon('visibility')}Not private</button>
                </div>`).join('')}</div>` : ''}
        </div>`;
}
