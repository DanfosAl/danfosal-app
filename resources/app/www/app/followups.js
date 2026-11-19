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

export const who = c => c && c.username ? '@' + c.username : 'visitor ' + (String((c && c._id) || '').slice(-5) || '?');

// Opens the chat in Instagram (app on the phone, web on the computer).
export const chatLink = c => c && c.username ? `https://ig.me/m/${encodeURIComponent(c.username)}` : 'https://www.instagram.com/direct/inbox/';

export const STAGE_LABEL = { asking: 'asking', deciding: 'deciding', ordering: 'ordering', ordered: 'ordered', 'after-sale': 'after-sale', other: 'other' };
