// Reading a Kärcher d.o.o. (Zagreb) invoice from its text lines. No imports on purpose: Stock >
// Receive delivery uses it in the app, and the Paper Autopilot (tools/paper-autopilot) runs the same
// function under Node, so an invoice is read one way everywhere.
//
// The lines come from the PDF's own text layer, grouped by baseline (see pdfLines in receive.js).

const r2 = n => Math.round(n * 100) / 100;
const num = s => Number(String(s).replace(/\./g, '').replace(',', '.'));     // "1.360,00" -> 1360

// Kärcher d.o.o. invoice: "0001 1.512-600.0 SC 2 EasyFix *EU * 16 PC 85,00 1.360,00".
// Numbers after the unit are unit price, an optional discount %, and the line total; the unit
// cost is taken from the total, so a discount is always included.
export function parseKarcher(lines) {
    if (!lines.some(l => /k[aä]rcher d\.o\.o\./i.test(l))) return null;
    const inv = { supplier: 'Karcher', invoiceNumber: '', date: '', net: 0, prepayPct: 0, prepayAmount: 0, items: [], reader: 'Kärcher invoice (exact text)' };
    const head = lines.find(l => /^ALBANIA \d{10}\b/i.test(l)) || '';
    inv.invoiceNumber = (head.match(/\b(\d{10})\b/) || [])[1] || (lines[0].match(/^\d{10}$/) || [])[0] || '';
    const dateLine = lines.find(l => /^\d\d\.\d\d\.\d{4}\s+\d\d:\d\d/.test(l));
    if (dateLine) { const [d, m, y] = dateLine.slice(0, 10).split('.'); inv.date = `${y}-${m}-${d}`; }
    // Units seen on Kärcher invoices: PC, ZSA (set), M (metre), L, KG... A line with no prices is
    // a free replacement (warranty), booked at cost 0. The mark before the quantity is the
    // "Preference" column: P = EU preferential origin (no Albanian customs duty), * = none (duty).
    const itemRe = /^(\d{4}) (\d\.\d{3}-\d{3}\.\d) (.+?) (?:([*P]) )?(\d+(?:,\d+)?) ([A-Z]{1,4})(?:\s+([\d.,\s]+))?$/;
    lines.forEach(l => {
        const m = l.match(itemRe); if (!m) return;
        const nums = (m[7] || '').trim().split(/\s+/).filter(Boolean).map(num);
        const qty = num(m[5]), total = nums.length ? nums[nums.length - 1] : 0;
        inv.items.push({ pos: m[1], code: m[2], name: m[3].replace(/\s+\*$/, '').trim(), quantity: qty, unit: m[6], listPrice: nums[0] || 0,
            discount: nums.length > 2 ? nums[1] : 0, total, unitCost: qty ? r2(total / qty) : 0, free: !nums.length,
            ...(m[4] ? { preference: m[4] === 'P' ? 'EU' : 'none' } : {}) });
    });
    // "Net Amount", or in Croatian "Prijevoz i pakiranje Neto iznos ..." (carriage, net, VAT...) -
    // not the table heading, which also says "Neto iznos".
    const netIdx = lines.findIndex(l => /Net Amount|Prijevoz i pakiranje\s+Neto iznos/.test(l));
    if (netIdx >= 0 && lines[netIdx + 1]) {
        const n = lines[netIdx + 1].split(/\s+/).map(num).filter(x => !isNaN(x));
        if (n.length >= 2) { inv.net = n[1]; inv.carriage = n[0]; }
    }
    const pre = lines.find(l => /Prepayment\s+\d+%/.test(l));
    if (pre) { const m = pre.match(/Prepayment\s+(\d+(?:,\d+)?)%\s+([\d.,]+)/); if (m) { inv.prepayPct = num(m[1]); inv.prepayAmount = num(m[2]); } }
    if (!inv.net) inv.net = r2(inv.items.reduce((a, i) => a + i.total, 0));
    if (!inv.items.length) return null;
    return Object.assign(inv, karcherInvoiceLinks(lines, itemRe, inv.items));
}

// What ties an invoice to the rest of the purchase: the order(s) it delivers ("Order No."
// under "Date Time Order No.", and "Order No. 7571122916 10.03.2026" above each group of
// lines), the delivery note, and per line the country of origin (it decides customs duty) and
// the serial numbers printed under it ("Serial no ( 642569 - 642592 )" or "( 251936, 251940 )").
// Kärcher Zagreb also issues them in Croatian (since Sep 2026): "Naš br. narudžbe" is the order
// number, "Otpremnica br." the delivery note, "Zemlja podrijetla: ... Šifra robe" the origin and
// tariff, "Serijski br." the serials. A free (warranty) line carries "Custom limit 340,45": the
// value Kärcher declares to customs for it, which the customs declaration then adds up.
function karcherInvoiceLinks(lines, itemRe, items) {
    const orderNos = new Set(), deliveryNotes = new Set();
    const head = lines.findIndex(l => /Date\s+Time\s+Order No\.|Datum i vrijeme izdavanja\s+Na[šs] br\. narud[žz]be/.test(l));
    const first = head >= 0 ? (lines[head + 1] || '').match(/^\d\d\.\d\d\.\d{4}\s+\d\d:\d\d(?::\d\d)?\s+(757\d{7})\b/) : null;
    if (first) orderNos.add(first[1]);
    let item = -1;
    for (const l of lines) {
        const o = l.match(/^(?:Order No\.|Na[šs] br\. narud[žz]be)\s+(757\d{7})\b/); if (o) orderNos.add(o[1]);
        const d = l.match(/(?:Del\. Note No\.|Otpremnica br\.)\s*(\d{6,})/); if (d) deliveryNotes.add(d[1]);
        if (itemRe.test(l)) { item++; continue; }
        const it = items[item]; if (!it) continue;
        const c = l.match(/(?:Country of origin of the material|Zemlja podrijetla:)\s+(.+?)(?:\s+(?:Statistic number|Šifra robe)\s+(\d+))?$/);
        if (c) { it.origin = c[1].trim(); if (c[2]) it.tariff = c[2]; }
        const s = l.match(/^(?:Serial no|Serijski br\.)\s*\((.+)\)\s*$/i);
        if (s) it.serials = serialsOf(s[1]);
        const v = l.match(/^Custom limit\s+([\d.,]+)\s*$/i);
        if (v) it.customsValue = num(v[1]);
    }
    return { orderNos: [...orderNos], deliveryNotes: [...deliveryNotes] };
}

// "642569 - 642592" is a run of consecutive numbers; "251936, 251940" a list. A run longer than
// 500 is kept as its two ends rather than expanded. A machine's serial has six digits (its label
// says 012345); the invoice drops the leading zero ("12345"), so short ones get it back.
function serialsOf(s) {
    const out = [];
    const six = x => /^\d{1,5}$/.test(x) ? x.padStart(6, '0') : x;
    s.split(',').map(x => x.trim()).filter(Boolean).forEach(part => {
        const r = part.match(/^(\d+)\s*-\s*(\d+)$/);
        if (r && Number(r[2]) >= Number(r[1]) && Number(r[2]) - Number(r[1]) < 500) {
            const w = Math.max(6, r[1].length);
            for (let n = Number(r[1]); n <= Number(r[2]); n++) out.push(String(n).padStart(w, '0'));
        } else out.push(six(part.replace(/\s+/g, '')));
    });
    return out;
}
