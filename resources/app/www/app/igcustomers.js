// Instagram chats and the shop's own records (owner, 19 Nov 2026: ideas 2 and 5).
//
// knownCustomer: is the person writing on Instagram someone who bought before? Matched on a phone
//   number they typed in the chat (or gave for a bot order) against Customers, on bot orders made
//   from this very chat (`instagramId`), or on the name of the bot's last order for this chat.
//   Shows what they bought, when, and which warranties still run - so the owner knows who he is
//   talking to before answering.
// orderChat: the messages a bot order came from, to check the order against what was written.
// Pure functions: the customer directory is Danfosal's (data.js customerDirectory), passed in.

const PHONE = /(?:\+?\s*355|\b0)\s*6\s*[6-9](?:[\s.\-]*\d){7}\b/g;     // the bot's own rule
export const phoneKey = s => String(s || '').replace(/\D/g, '').slice(-8);
const nameKey = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const ms = v => v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : Date.parse(v) || 0;

// Phone numbers the customer typed in the chat, and the one on the bot's last order (last 8 digits).
export function chatPhones(raw = {}) {
    const out = new Set();
    for (const m of raw.messages || []) {
        if (!m || m.role === 'shop') continue;
        for (const x of String(m.text || '').matchAll(PHONE)) out.add(phoneKey(x[0]));
    }
    if (raw.previousOrder && raw.previousOrder.telephone) out.add(phoneKey(raw.previousOrder.telephone));
    out.delete('');
    return out;
}

// directory: Danfosal's customerDirectory(model) entries ({name, phoneDigits, sales, orders, warranties, count, last, revenue}).
export function findCustomer(chatId, raw = {}, directory = []) {
    const phones = chatPhones(raw);
    if (phones.size) {
        const byPhone = directory.find(e => (e.phoneDigits && phones.has(e.phoneDigits.slice(-8)))
            || (e.orders || []).some(o => phones.has(phoneKey(o.telephone || o.phoneNumber))));
        if (byPhone) return byPhone;
    }
    const byOrder = directory.find(e => (e.orders || []).some(o => o.instagramId && String(o.instagramId) === String(chatId)));
    if (byOrder) return byOrder;
    const name = nameKey(raw.previousOrder && raw.previousOrder.clientName);
    if (name.length >= 6) return directory.find(e => nameKey(e.name) === name) || null;
    return null;
}

// What to say about them: purchases, the last thing bought, warranties still running.
// timeOf(sale or order) -> ms (Danfosal's saleTime / orderTime).
export function customerSummary(e, now = Date.now(), timeOf = x => ms(x.timestamp || x.date || x.createdAt)) {
    if (!e || !e.count) return null;
    const bought = [...(e.sales || []).filter(s => !s.isReturn), ...(e.orders || [])]
        .map(x => ({ t: timeOf(x) || 0, items: (x.items || []).map(i => i && (i.name || i.productName)).filter(Boolean) }))
        .filter(x => x.items.length).sort((a, b) => b.t - a.t);
    const warranties = (e.warranties || []).map(w => ({ until: ms(w.warrantyUntil), items: (w.items || []).map(i => i && (i.name || i.productName)).filter(Boolean) }))
        .filter(w => w.until > now && w.items.length).sort((a, b) => a.until - b.until);
    return {
        name: e.name, purchases: e.count, last: e.last || (bought[0] && bought[0].t) || null, spent: Math.round(e.revenue || 0),
        lastItems: bought.length ? bought[0].items.slice(0, 2) : [], warranties: warranties.slice(0, 2)
    };
}

// The messages a bot order came from: everything up to a few minutes after the order (the shop's
// "po ju nisim" usually follows it), newest 25, oldest first.
export function orderChat(messages = [], orderAt = Date.now(), { after = 30 * 60000, max = 25 } = {}) {
    return messages.filter(m => m && m.at && m.text && m.at <= orderAt + after).sort((a, b) => a.at - b.at).slice(-max);
}

// Splits a message so phone numbers can be shown in bold: [{text, phone}].
export function withPhones(text) {
    const out = [];
    let last = 0;
    for (const x of String(text || '').matchAll(PHONE)) {
        if (x.index > last) out.push({ text: text.slice(last, x.index), phone: false });
        out.push({ text: x[0], phone: true });
        last = x.index + x[0].length;
    }
    if (last < String(text || '').length) out.push({ text: String(text).slice(last), phone: false });
    return out;
}
