// easyPOS's own invoice layout ("DETAJE"), read from the Paper Autopilot's text lines (pdftext.js),
// which keep this layout's words apart; the app's text builder runs them together.
//
// easyPOS prints two kinds of paper in this layout:
//   - "Faturë Tatimore": a till sale. The till prints it as well, and the EasyPOS bridge records
//     it from that print, so it is never a new sale here.
//   - "Faturë Elektronike": an e-invoice to a business, in the e-invoice series ("12/2026"). It is
//     never printed on the till, so nothing else records it.
// readEasyPOSInvoice says which kind a paper is and reads an e-invoice in its own money;
// saleData turns that into what ManualPDFProcessor.saveToDatabase takes, in euros.

const num = s => { const v = parseFloat(String(s).replace(/,/g, '')); return Number.isFinite(v) ? v : NaN; };
const AMT = '(-?[\\d,]+\\.\\d{2})';
// "Name / Code 12,000.00 2.000 / Cope 20,000.00 4,000.00 24,000.00": price with VAT, quantity /
// unit, value without VAT, VAT, value with VAT. A long name or code runs on to the next lines.
const ROW = new RegExp(`^(.*?)\\s*${AMT}\\s+(-?[\\d,]+\\.\\d{3})\\s*\\/\\s*(\\S+)\\s+${AMT}\\s+${AMT}\\s+${AMT}$`);
const TOTAL = new RegExp(`^(?:TOTALI NË|TOTAL IN|TOTAL) ([A-Z]{3})\\s+${AMT}\\s+${AMT}\\s+${AMT}$`);
const SELLER = /^DANFOS\s*SH\.?\s*P\.?\s*K\.?\s*/i;
const NIPT = /\b[A-Z]\d{8}[A-Z]\b/g;
// "Name / Code / Barcode": the parts are split at a slash with a space on either side, so a slash
// inside a name ("T11/1", "NT 50/1") stays.
const parts = s => s.split(/\s+\/\s*|\s*\/\s+/).map(x => x.trim());
const orNone = s => s && s !== '-' ? s : '';

export function easyPOSKind(lines) {
    const head = lines.slice(0, 3).join('\n');
    if (!/^(DETAJE|DETAILS)$/m.test(head)) return null;
    if (/^(Fatur[ëe] Elektronike|Electronic Invoice)$/im.test(head)) return 'e-invoice';
    if (/^(Fatur[ëe] Tatimore|Fiscal Invoice)$/im.test(head)) return 'till-receipt';
    return null;
}

export function readEasyPOSInvoice(lines) {
    const kind = easyPOSKind(lines);
    if (kind !== 'e-invoice') return { kind };
    const text = lines.join('\n');
    const pick = re => (text.match(re) || [])[1] || '';
    const dm = text.match(/^(?:Data|Date):\s*(\d\d)\.(\d\d)\.(\d{4})/m);

    const totals = {};
    lines.forEach(l => { const m = l.match(TOTAL); if (m) totals[m[1]] = { net: num(m[2]), vat: num(m[3]), gross: num(m[4]) }; });
    const currency = pick(/(?:Valuta e Faturës|Invoice Currency):\s*([A-Z]{3})/) || (totals.EUR ? 'EUR' : Object.keys(totals)[0] || '');

    // The parties sit side by side: "DANFOS SH.P.K <buyer>", then "<our NIPT> <buyer's NIPT>".
    let customerName = '', customerNipt = '';
    const hi = lines.findIndex(l => /^(Shitësi|Seller):\s*(Blerësi|Buyer):\s*$/i.test(l));
    if (hi >= 0) {
        const ni = lines.findIndex((l, i) => i > hi && i <= hi + 4 && (l.match(NIPT) || []).length > 0);
        customerName = lines.slice(hi + 1, ni > hi ? ni : hi + 2).join(' ').replace(SELLER, '').trim();
        if (ni > hi) customerNipt = (lines[ni].match(NIPT) || [])[1] || '';
    }

    const ai = lines.findIndex(l => /^(Artikujt|Items)$/i.test(l));
    const ti = lines.findIndex((l, i) => i > ai && TOTAL.test(l));
    const rows = [];
    if (ai >= 0) for (const l of lines.slice(ai + 1, ti > ai ? ti : undefined)) {
        const m = l.match(ROW);
        if (m) rows.push({ label: m[1], quantity: num(m[3]), unit: m[4], net: num(m[5]), vat: num(m[6]), gross: num(m[7]) });
        else if (rows.length) rows[rows.length - 1].label += ' ' + l;     // the name or code running on
    }
    const items = rows.map(r => { const [name, code, barcode] = parts(r.label); return { itemName: name, code: orNone(code), barcode: orNone(barcode), quantity: r.quantity, unit: r.unit, net: r.net, vat: r.vat, gross: r.gross }; });

    return {
        kind, currency, items, customerName, customerNipt,
        invoiceNumber: pick(/(?:Numri i Faturës|Invoice Number):\s*(\d+\/\s*\d{4}(?:\/\s*\w+)?)/i).replace(/\s+/g, ''),
        date: dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : '',
        docType: pick(/(?:Lloji i Dokumentit|Document Type):\s*(\d{3})/i),
        totals: totals[currency] || null
    };
}

// In euros, the way the processor stores an invoice: line prices without VAT, the subtotal
// without VAT, the tax and the total with it. lekPerEur converts an invoice in lek; null when
// the invoice can't be put in euros (lek without a rate, another currency, no total).
export function saleData(inv, lekPerEur = null) {
    const rate = inv.currency === 'EUR' ? 1 : inv.currency === 'ALL' && lekPerEur > 1 ? lekPerEur : null;
    if (!rate || !inv.totals) return null;
    const eur = v => Math.round(v / rate * 100) / 100;
    return {
        invoiceNumber: inv.invoiceNumber, date: inv.date, customerName: inv.customerName, customerNipt: inv.customerNipt, customerAddress: '',
        items: inv.items.map(i => ({ itemName: i.itemName, code: i.code, quantity: i.quantity, pricePerUnit: eur(i.net / (i.quantity || 1)), lineTotal: eur(i.net) })),
        subtotal: eur(inv.totals.net), tax: eur(inv.totals.vat), total: eur(inv.totals.gross),
        originalCurrency: inv.currency, conversionRate: rate === 1 ? null : rate, normalizedToEUR: rate !== 1
    };
}
