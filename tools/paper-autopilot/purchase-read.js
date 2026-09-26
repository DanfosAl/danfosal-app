// Reading a purchase's paperwork into records the app can link: the order (Kärcher proforma or
// order confirmation), the invoice, a credit note, the bank payment, the customs declaration,
// and Kärcher's own account statement.
//
// Every reader takes the PDF's text lines (pdftext.js) and returns a plain record, or null when
// the document isn't the kind it reads. Numbers come off the documents; nothing is guessed.
// How the records connect is decided in the app (www/app/purchasing.js), not here.
import { parseKarcher } from '../../resources/app/www/app/karcher-invoice.js';
import { amount, iso } from './classify.js';

const r2 = n => Math.round(n * 100) / 100;
const dmy = s => { const m = String(s || '').match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/); return m ? iso(m[3], m[2], m[1]) : ''; };
const text = lines => lines.join('\n');
const CODE = '\\d\\.\\d{3}-\\d{3}\\.\\d';           // Kärcher material number, 1.512-600.0

// ------------------------------------------------------------------ Kärcher orders

// Proforma: "010 1.533-228.0 1.00 0.00 5,842.02 4,790.46" (ordered, confirmed, unit price, line
// total after the contract discount), the description on the lines below it.
export function readKarcherProforma(lines) {
    const t = text(lines);
    if (!/Proforma Invoice/i.test(t) || !/k[aä]rcher d\.o\.o\./i.test(t)) return null;
    const m = t.match(/\b(757\d{7})\s+(\d\d)\.(\d\d)\.(\d{4})/);
    const itemRe = new RegExp(`^(\\d{3}) (${CODE}) ([\\d.,]+) ([\\d.,]+)(?: \\S+)? ([\\d.,]+) ([\\d.,]+)$`);
    const items = [];
    lines.forEach((l, i) => {
        const x = l.match(itemRe); if (!x) return;
        const name = [];
        for (let j = i + 1; j < lines.length && name.length < 4; j++) {
            if (itemRe.test(lines[j]) || /^(EAN|Statistic number|Country of origin|Contract discount|Pri pla|Order No\.|Carriage)/.test(lines[j])) break;
            name.push(lines[j]);
        }
        const qty = amount(x[3]), total = amount(x[6]);
        items.push({ pos: x[1], code: x[2], name: name.join(' ').replace(/\s*\+\s*/g, '+').trim(), qty, unitPrice: amount(x[5]), total, unitCost: qty ? r2(total / qty) : 0 });
    });
    const net = amount((lines[lines.findIndex(l => /Net Amount/.test(l)) + 1] || '').split(/\s+/)[0]);
    const cash = t.match(/with ([\d.,]+) ?% cash discount\s+([\d.,]+)/);
    return { kind: 'order', source: 'proforma', supplier: 'Karcher', orderNo: m ? m[1] : '', date: m ? iso(m[4], m[3], m[2]) : '',
        total: Number.isFinite(net) ? net : r2(items.reduce((a, x) => a + x.total, 0)), currency: 'EUR',
        // "3,000 %" is three percent: Kärcher writes the percentage with a decimal comma.
        cashDiscountPct: cash ? Number(cash[1].replace(/\./g, '').replace(',', '.')) : 0, cashDiscountTotal: cash ? amount(cash[2]) : 0, items };
}

// Order confirmation from the Kärcher portal: "000010 1.512-600.0 SC 2 EasyFix *EU 24 2,004.96 EUR".
export function readKarcherOrderConfirmation(lines) {
    const t = text(lines);
    if (!/Your Order Summary/.test(t)) return null;
    const orderNo = (t.match(/Order No\.:\s*(\d+)/) || [])[1] || '';
    const d = t.match(/Order Date:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    const itemRe = new RegExp(`^(\\d{6}) (${CODE}) (.+?) (\\d+) ([\\d.,]+) EUR$`);
    const items = lines.map(l => l.match(itemRe)).filter(Boolean).map(x => {
        const qty = Number(x[4]), total = amount(x[5]);
        return { pos: x[1], code: x[2], name: x[3].trim(), qty, total, unitCost: qty ? r2(total / qty) : 0 };
    });
    return { kind: 'order', source: 'confirmation', supplier: 'Karcher', orderNo, date: d ? iso(d[3], d[2], d[1]) : '',
        total: amount((t.match(/Total Order Value:\s*([\d.,]+)/) || [])[1]), currency: 'EUR', items };
}

// ------------------------------------------------------------------ Kärcher invoices and credit notes

export function readKarcherInvoice(lines) {
    if (/Credit Note/.test(lines.slice(0, 6).join(' '))) return null;      // a credit note has item lines too
    const inv = parseKarcher(lines);
    if (!inv) return null;
    const t = text(lines);
    const due = t.match(/Payment terms\s+(.+?)\s+(?:Due net\s+)?([\d.,]+)\s*$/m);
    return { kind: 'invoice', supplier: 'Karcher', invoiceNo: inv.invoiceNumber, date: inv.date, net: inv.net, currency: 'EUR',
        carriage: inv.carriage || 0, prepayPct: inv.prepayPct || 0, prepayAmount: inv.prepayAmount || 0,
        orderNos: inv.orderNos || [], deliveryNotes: inv.deliveryNotes || [], paymentTerms: due ? due[1].trim() : '',
        items: inv.items.map(({ pos, code, name, quantity, unit, listPrice, discount, total, unitCost, free, origin, tariff, serials, preference }) =>
            ({ pos, code, name, qty: quantity, unit, listPrice, discount, total, unitCost, free, ...(origin ? { origin } : {}), ...(tariff ? { tariff } : {}),
                ...(serials ? { serials } : {}), ...(preference ? { preference } : {}) })) };
}

// A credit note is money back: a returned item, or the cash discount granted after payment
// ("Rest racuna 7573089148 sa 3% odbijenog skonta").
export function readKarcherCreditNote(lines) {
    const t = text(lines);
    if (!/Credit Note/.test(lines.slice(0, 6).join(' ')) || !/k[aä]rcher d\.o\.o\./i.test(t)) return null;
    const number = (t.match(/\b(7575\d{6})\b/) || [])[1] || '';
    const dl = t.match(/^(\d\d)\.(\d\d)\.(\d{4})\s+\d\d:\d\d(?::\d\d)?\s+(757\d{7})?/m);
    const totals = lines[lines.findIndex(l => /Net Amount.*Total Amount/.test(l)) + 1] || '';
    const nums = (totals.match(/-?[\d.,]+/g) || []).map(amount);
    const refInvoices = [...new Set((t.match(/\b7573\d{6}\b/g) || []))];
    const cashDiscount = /skont|cassa sconto|additional discount/i.test(t);
    return { kind: 'creditNote', supplier: 'Karcher', number, date: dl ? iso(dl[3], dl[2], dl[1]) : '', orderNo: dl && dl[4] ? dl[4] : '',
        amount: nums.length ? nums[nums.length - 1] : 0, currency: 'EUR', refInvoices, reason: cashDiscount ? 'cash discount' : 'credit' };
}

// ------------------------------------------------------------------ money out

// Raiffeisen's debit advice. The owner writes the order or invoice number into the payment
// details ("inv. 7571143454"), which is what says a payment was for a particular order.
const SUPPLIERS = /KARCHER|K[ÄA]RCHER|STAR|SONUK|RULOPAK|BAYERSAN|FERSAN|DEGA E THESARIT/i;
export function readPayment(lines) {
    const t = text(lines);
    if (!/Njoftim Debitimi/.test(t)) return null;
    const benefLine = (t.match(/Beneficiary Customer\s+(.+)$/m) || [])[1] || '';
    const words = benefLine.trim().split(/\s+/), k = words.findIndex(w => /\p{Ll}/u.test(w) || /^\d/.test(w) || /^[A-Z]\d{8}[A-Z]$/.test(w));
    const beneficiary = words.slice(0, k < 0 ? words.length : k || 1).join(' ').replace(/[,.:;]+$/, '');
    if (!SUPPLIERS.test(beneficiary)) return null;           // only suppliers and customs: not wages, rent or tax
    const i = lines.findIndex(l => /Kursi i kembimit/.test(l)), j = lines.findIndex(l => /Komisione/.test(l));
    const details = lines.slice(i + 1, j > i ? j : i + 6).join(' ').replace(/Detajet e pageses \/ Details of Payment/g, ' ')
        .replace(/(^|\s)[.e](?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
    const d = t.match(/Data \/ Date\s+(\d\d)\/(\d\d)\/(\d{4})/);
    const { refs, partial } = paymentRefs(details);
    return { kind: 'payment', direction: 'out', date: d ? iso(d[3], d[2], d[1]) : '', amount: amount((t.match(/Shuma e urdheruar\s+([\d.,]+)/) || [])[1]),
        currency: (t.match(/Monedha\s+([A-Z]{3})/) || [])[1] || 'EUR', beneficiary, details, refs, partial,
        bankRef: (t.match(/Payment Reference\s+(\S+)/) || [])[1] || '', valueDate: dmy((t.match(/Value Date\s+(\S+)/) || [])[1]) };
}

// The Kärcher numbers a payment names. The owner shortens runs of invoice numbers, writing only
// the digits that change: "7573087659, 660, 661" or "7573098150,1,5,6,7,8,3101841,2,2748,50".
// A short number replaces the end of the last full one. "(part)" after a number marks a part
// payment of that invoice.
export function paymentRefs(details) {
    const refs = [], partial = [];
    let last = '';
    const tokens = String(details).match(/\d+(?:\s*\((?:part|pjes)[^)]*\))?/gi) || [];
    for (const tok of tokens) {
        const digits = tok.match(/^\d+/)[0], part = /\(/.test(tok);
        let n = '';
        if (/^757[1357]\d{6}$/.test(digits)) n = digits;
        else if (last && digits.length < 10 && digits.length >= 1 && digits.length <= 7) n = last.slice(0, 10 - digits.length) + digits;
        if (!n) continue;
        if (!refs.includes(n)) refs.push(n);
        if (part && !partial.includes(n)) partial.push(n);
        last = n;
    }
    return { refs, partial };
}

// ------------------------------------------------------------------ customs

// An Albanian import declaration (ASYCUDA). Taxes are listed per item as "<code> <base> <rate>
// <amount> <method>": DOG is customs duty, TVS import VAT. VAT is reclaimed on the VAT return, so
// what the import really cost on top of the goods is everything else: duty and fees.
export function readCustoms(lines) {
    const t = text(lines);
    if (!/ASYCUDA/i.test(t) || !/(DEKLARATE|DECLARATION)/.test(t)) return null;
    const number = (t.match(/\b(\d{2}AL\d{12}R\d)\b/) || [])[1] || '';
    const exporter = (lines[lines.findIndex(l => /(Exporter|Eksportuesi)/.test(l)) + 1] || '').split(/\s+(Customs Reference|Referenca)/)[0].trim();
    const date = dmy((t.match(/\b[RLM]\s+\d+\s+(\d\d\/\d\d\/\d{4})/) || [])[1]) || dmy((t.match(/Date\s+(\d\d\/\d\d\/\d{4})/) || [])[1]);
    const inv = (lines[lines.findIndex(l => /22 (Mon & shuma totale|Currency & total amount)/.test(l)) + 1] || '').match(/\b(EUR|USD|ALL)\s+([\d.,]+)\s+([\d.]+)/);
    // Continuation pages print two items side by side, so one line can hold two tax entries.
    const taxes = {};
    lines.forEach(l => {
        for (const x of l.matchAll(/(?:^|\s)([A-Z]{3})\s+([\d,]+)\s+(\d+\.\d{3})\s+([\d,]+)\s+\d\b/g))
            if (x[1] !== 'ALL' && x[1] !== 'EUR') taxes[x[1]] = (taxes[x[1]] || 0) + amount(x[4]);
    });
    const totals = [...t.matchAll(/Total(?:i i)?\s+([\d,]+)\s+ALL/g)].map(x => amount(x[1]));
    const total = totals.length ? Math.max(...totals) : NaN;
    const vat = taxes.TVS || 0;
    return { kind: 'customs', number, date, exporter, invoiceCurrency: inv ? inv[1] : '', invoiceTotal: inv ? amount(inv[2]) : NaN,
        rate: inv ? Number(inv[3]) : NaN, taxes, totalAll: total, vatAll: vat, dutyAll: taxes.DOG || 0,
        extraAll: Number.isFinite(total) ? Math.max(0, total - vat) : NaN };
}

// ------------------------------------------------------------------ Kärcher's statement

// The account statement Kärcher sends as .xlsx: open items first, then cleared ones. RV is an
// invoice, GV a credit note, DZ/AB a payment; "Sales Document" is the order number.
export async function readKarcherStatement(path) {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path);
    const ws = wb.worksheets[0];
    const head = (ws.getRow(1).values || []).map(v => String(v || '').trim());
    const col = name => head.indexOf(name);
    if (col('Sales Document') < 0 || col('Clearing Document') < 0 || col('Document Type') < 0) return null;
    const val = (row, name) => { const v = row.getCell(col(name)).value; return v && typeof v === 'object' && 'result' in v ? v.result : v; };
    const day = v => v instanceof Date ? v.toISOString().slice(0, 10) : dmy(v) || (typeof v === 'string' ? v.slice(0, 10) : '');
    const lines = [];
    ws.eachRow((row, n) => {
        if (n === 1 || !val(row, 'Customer')) return;
        lines.push({ type: String(val(row, 'Document Type') || ''), docNo: String(val(row, 'Assignment') || ''), reference: String(val(row, 'Reference') || ''),
            date: day(val(row, 'Document Date')), amount: Number(val(row, 'Amount in doc. curr.')) || 0, currency: String(val(row, 'Document currency') || 'EUR'),
            orderNo: String(val(row, 'Sales Document') || ''), text: String(val(row, 'Text') || ''),
            clearingDoc: String(val(row, 'Clearing Document') || ''), clearingDate: day(val(row, 'Clearing date')) });
    });
    const open = lines.filter(l => !l.clearingDate);
    return { kind: 'statement', supplier: 'Karcher', date: lines.reduce((m, l) => l.date > m ? l.date : m, ''),
        openTotal: r2(open.reduce((a, l) => a + l.amount, 0)), lines };
}

// Which reader fits a filed document, by the folder the filer put it in.
export function readerFor(type) {
    return { 'karcher-proforma': readKarcherProforma, 'karcher-order': readKarcherOrderConfirmation, 'karcher-invoice': readKarcherInvoice,
        'karcher-credit-note': readKarcherCreditNote, 'bank-advice': readPayment, 'customs-declaration': readCustoms }[type] || null;
}
