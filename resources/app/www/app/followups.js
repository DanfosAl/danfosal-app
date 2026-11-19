// Instagram follow-ups: which chats need the owner, read from the chatbot's memory.
//
// The Instagram bot (E:\instagram-chatbot, on Render) keeps one document per chat in
// `instagramBotChats`: when each side last wrote, the customer's @username, and the AI's latest
// reading of the chat (`card`: stage, a one-line summary, the next step, the products asked about).
// From that, two lists:
//   waiting  - the customer wrote last and nobody answered yet (last 7 days)
//   quiet    - the shop answered a product question, then the customer went quiet for 1-14 days
//              and didn't order: the follow-up that turns a question into a sale
// "Done" stamps followUpDoneAt; the chat comes back if anyone writes after that. Private chats
// (#privat, or ones the AI saw as family/friends) never show. Pure functions - no Firestore here.
//
// Private from the app: "Private" on a chat writes privateFields() onto it (the bot then stores,
// reads and logs nothing from that account, until "Not private" writes publicFields()). The bot
// honours the same flag it sets itself for #privat / #biznes typed in the chat.
export const WAITING_DAYS = 7;
export const QUIET_FROM_DAYS = 1;
export const QUIET_TO_DAYS = 14;
const DAY = 86400000;
const STILL_OPEN = new Set(['asking', 'deciding', 'ordering']);

// One chat document -> the fields the lists need. The message texts are left behind on purpose:
// they stay in the database and never go into the browser's session storage.
export function slimChat(id, d = {}) {
    const n = v => Number(v) || 0;
    const card = d.card || {};
    return {
        _id: String(id), username: d.username || '', profileName: d.profileName || '',
        lastCustomerAt: n(d.lastCustomerAt), lastShopAt: n(d.lastShopAt), lastOrderAt: n(d.lastOrderAt),
        lastOrderId: d.lastOrderId || null, followUpDoneAt: n(d.followUpDoneAt), ignored: !!d.ignored,
        ignoredBy: d.ignored ? (d.ignoredBy || 'owner') : '', ignoredAt: n(d.ignoredAt),
        // What they asked for (with the stock at that moment) and where the chat came from - for
        // the Instagram reports in www/app/iginsights.js.
        askedProducts: Array.isArray(d.askedProducts) ? d.askedProducts.filter(a => a && a.name).map(a => ({
            name: String(a.name), id: a.id || null, stock: Number.isFinite(Number(a.stock)) && a.stock !== null ? Number(a.stock) : null, at: n(a.at) })) : [],
        // Why follow-ups ended, one tap on Done (owner's idea 8): [{at, reason}], newest 20.
        followUpLog: Array.isArray(d.followUpLog) ? d.followUpLog.filter(x => x && REASONS[x.reason]).map(x => ({ at: n(x.at), reason: x.reason })).slice(-20) : [],
        followUpReason: REASONS[d.followUpReason] ? d.followUpReason : '',
        firstSource: d.firstSource && d.firstSource.key ? { kind: String(d.firstSource.kind || ''), key: String(d.firstSource.key),
            title: String(d.firstSource.title || ''), url: String(d.firstSource.url || ''), at: n(d.firstSource.at) } : null,
        card: {
            stage: card.stage || '', summary: card.summary || '', nextStep: card.nextStep || '',
            products: Array.isArray(card.products) ? card.products.filter(p => p && p.name).map(p => ({ name: String(p.name), id: p.id || null })) : []
        }
    };
}

export function followUps(chats = [], now = Date.now()) {
    const waiting = [], quiet = [];
    for (const c of chats) {
        if (!c || c.ignored) continue;
        const last = Math.max(c.lastCustomerAt, c.lastShopAt);
        if (!last || c.followUpDoneAt >= last) continue;
        if (c.lastCustomerAt > c.lastShopAt) {
            // Unanswered - unless the AI's reading says there is nothing to do (a "thanks", an emoji).
            const nothingToDo = c.card.stage && !c.card.nextStep && !STILL_OPEN.has(c.card.stage);
            if (now - c.lastCustomerAt <= WAITING_DAYS * DAY && !nothingToDo) waiting.push({ ...c, since: c.lastCustomerAt });
            continue;
        }
        const quietFor = now - c.lastShopAt;
        const orderedSince = c.lastOrderAt && c.lastOrderAt >= c.lastCustomerAt;
        if (STILL_OPEN.has(c.card.stage) && c.card.products.length && !orderedSince
            && quietFor >= QUIET_FROM_DAYS * DAY && quietFor <= QUIET_TO_DAYS * DAY) quiet.push({ ...c, since: c.lastShopAt });
    }
    waiting.sort((a, b) => a.since - b.since);      // longest waiting first
    quiet.sort((a, b) => b.since - a.since);        // freshest follow-up first
    return { waiting, quiet };
}

// Done, with the reason (one tap): it takes the chat off the lists like before, and over a few
// weeks shows why questions didn't become sales - without any AI.
export const REASONS = { sold: 'Sold', price: 'Too expensive', elsewhere: 'Bought elsewhere', stock: 'No stock', noreply: 'No reply', other: 'Other' };
export const doneFields = (reason, now = Date.now()) => ({ followUpDoneAt: now, followUpReason: REASONS[reason] ? reason : 'other' });

// How the follow-ups ended in the last `days`: [{reason, label, n}], most first.
export function doneReasons(chats = [], now = Date.now(), days = 90) {
    const n = {};
    for (const c of chats) for (const x of c.followUpLog || []) if (now - x.at <= days * DAY) n[x.reason] = (n[x.reason] || 0) + 1;
    return Object.entries(n).map(([reason, k]) => ({ reason, label: REASONS[reason], n: k })).sort((a, b) => b.n - a.n);
}

// The chats the bot ignores, newest first - so a wrong guess by the AI can be undone.
export const privateChats = (chats = []) => chats.filter(c => c && c.ignored).sort((a, b) => b.ignoredAt - a.ignoredAt);

// What "Private" / "Not private" write onto instagramBotChats/{id} (merged). Private also drops the
// stored messages and the reading: nothing of a private chat stays in the database.
export const privateFields = (now = Date.now()) => ({ ignored: true, ignoredBy: 'owner', ignoredAt: now, messages: [], card: null });
export const publicFields = () => ({ ignored: false, ignoredBy: 'owner', ignoredAt: null });

export const who = c => c && c.username ? '@' + c.username : 'visitor ' + (String((c && c._id) || '').slice(-5) || '?');

// Opens the chat in Instagram (app on the phone, web on the computer).
export const chatLink = c => c && c.username ? `https://ig.me/m/${encodeURIComponent(c.username)}` : 'https://www.instagram.com/direct/inbox/';

export const STAGE_LABEL = { asking: 'asking', deciding: 'deciding', ordering: 'ordering', ordered: 'ordered', 'after-sale': 'after-sale', other: 'other' };
