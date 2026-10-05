// What a PDF is, read from its own text: its type, the folder it belongs in, a name a person can
// read, and the few facts that name is made of (date, number, amount, the other party).
//
// Rules are tried in order and the first match wins, so the specific ones (a Kärcher invoice)
// come before the general ones (anything with Danfos's letterhead). A rule that can't find a
// field leaves it out of the name rather than guessing. Personal records (contracts, birth
// certificates, criminal-record certificates) are recognised so they can be filed, but nothing
// is read out of them.
import { parseKarcher } from '../../resources/app/www/app/karcher-invoice.js';

// ------------------------------------------------------------------ small readers

const MONTHS_SQ = { janar: 1, shkurt: 2, mars: 3, prill: 4, maj: 5, qershor: 6, korrik: 7, gusht: 8, shtator: 9, tetor: 10, nentor: 11, 'nëntor': 11, dhjetor: 12 };
const MONTHS_EN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// "2026-09-22", or '' when the parts don't make a real date.
export function iso(y, m, d) {
    y = Number(String(y).length === 2 ? '20' + y : y); m = Number(m); d = Number(d);
    if (!(y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const monthEn = s => MONTHS_EN[String(s).slice(0, 3).toLowerCase()] || 0;
const monthSq = s => MONTHS_SQ[String(s).toLowerCase()] || monthEn(s);     // offers are written in either

// Every way these documents write an amount: "3 300,00" (e-invoice), "1.360,00" (Kärcher),
// "10,804.84" (Kärcher portal), "19,000.00" (bank), "41,850" (tax office), "6.0".
export function amount(s) {
    let t = String(s || '').replace(/[€\s]/g, '');
    if (!/\d/.test(t)) return NaN;
    const lastC = t.lastIndexOf(','), lastD = t.lastIndexOf('.');
    if (lastC >= 0 && lastD >= 0) {
        const dec = lastC > lastD ? ',' : '.';
        t = t.split(dec === ',' ? '.' : ',').join('').replace(dec, '.');
    } else if (lastC >= 0 || lastD >= 0) {
        const sep = lastC >= 0 ? ',' : '.';
        const after = t.length - t.lastIndexOf(sep) - 1;
        const count = t.split(sep).length - 1;
        t = (after === 3 || count > 1) ? t.split(sep).join('') : t.replace(sep, '.');
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
}
const lastNumber = s => { const all = String(s || '').match(/-?[\d][\d.,]*/g) || []; return all.length ? amount(all[all.length - 1]) : NaN; };

export function money(cur, n) {
    if (!Number.isFinite(n)) return '';
    const digits = cur === 'ALL' ? 0 : 2;
    return `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

// Safe on Windows: no reserved characters, no trailing dot or space, sensible length.
export function clean(s, max = 140) {
    let t = String(s || '').replace(/\//g, '-').replace(/[<>:"\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
    if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '');
    return t.replace(/[. ]+$/, '');
}
const words = (s, n) => String(s || '').trim().split(/\s+/).slice(0, n).join(' ');
const pick = (text, re) => (text.match(re) || [])[1] || '';
const lineAfter = (lines, re) => { const i = lines.findIndex(l => re.test(l)); return i >= 0 ? lines[i + 1] || '' : ''; };
const dmy = (text, re) => { const m = text.match(re); return m ? iso(m[3], m[2], m[1]) : ''; };
// What a person typed into a file name, minus the words every file of its kind carries.
const stemWords = (name, noise) => baseName(name).replace(/\([^)]*\)/g, ' ').replace(/[_.\-]+/g, ' ')
    .replace(noise, ' ').replace(/\s+/g, ' ').trim();
// A date written into the file name: "(19.08.2026)", "(18.08.26)", "_18-12-2025".
const nameDate = name => { const m = name.match(/(\d{1,2})[._-](\d{1,2})[._-](\d{4}|\d{2})(?!\d)/); return m ? iso(m[3], m[2], m[1]) : ''; };

// ------------------------------------------------------------------ the rules

const KARCHER = /k[aä]rcher d\.o\.o\./i;
const DANFOS = /^DANFOS\s*SH\.?\s*P\.?\s*K\.?\s*/i;
const byYear = folder => date => `${folder}/${(date || '').slice(0, 4) || 'Undated'}`;

const RULES = [
    {
        type: 'karcher-invoice', label: 'Kärcher invoice', folder: byYear('Kärcher/Invoices'),
        test: c => KARCHER.test(c.text) && /\b(Invoice|Ra\s?č\s?un|Racun)\b/.test(c.head) && !/Credit Note|Proforma/i.test(c.head),
        read(c) {
            const inv = parseKarcher(c.lines);
            if (!inv) return null;
            const total = inv.net ? money('EUR', inv.net) : 'free replacement';
            return { date: inv.date, number: inv.invoiceNumber, amount: inv.net, currency: 'EUR', lines: inv.items.length,
                name: `${inv.date} Kärcher invoice ${inv.invoiceNumber} ${total}` };
        }
    },
    {
        type: 'karcher-credit-note', label: 'Kärcher credit note', folder: byYear('Kärcher/Credit notes'),
        test: c => KARCHER.test(c.text) && /Credit Note/i.test(c.head),
        read(c) {
            const number = pick(c.head, /\b(7575\d{6})\b/);
            const date = dmy(c.text, /^(\d\d)\.(\d\d)\.(\d{4})\s+\d\d:\d\d/m);
            const total = lastNumber(lineAfter(c.lines, /Net Amount.*Total Amount/));
            return { date, number, amount: total, currency: 'EUR', name: `${date} Kärcher credit note ${number} ${money('EUR', total)}` };
        }
    },
    {
        type: 'karcher-proforma', label: 'Kärcher proforma (order)', folder: byYear('Kärcher/Orders'),
        test: c => KARCHER.test(c.text) && /Proforma Invoice/i.test(c.head),
        read(c) {
            const m = c.text.match(/\b(757\d{7})\s+(\d\d)\.(\d\d)\.(\d{4})/);
            const number = m ? m[1] : pick(c.text, /\b(757\d{7})\b/), date = m ? iso(m[4], m[3], m[2]) : '';
            const total = lastNumber(lineAfter(c.lines, /Net Amount.*Total Amount/));
            return { date, number, amount: total, currency: 'EUR', name: `${date} Kärcher proforma ${number} ${money('EUR', total)}` };
        }
    },
    {
        type: 'karcher-order', label: 'Kärcher order confirmation', folder: byYear('Kärcher/Orders'),
        test: c => /Your Order Summary/.test(c.head) && /Order No\.:/.test(c.head),
        read(c) {
            const number = pick(c.text, /Order No\.:\s*(\d+)/);
            const m = c.text.match(/Order Date:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/), date = m ? iso(m[3], m[2], m[1]) : '';
            const total = amount(pick(c.text, /Total Order Value:\s*([\d.,]+)/));
            return { date, number, amount: total, currency: 'EUR', name: `${date} Kärcher order ${number} ${money('EUR', total)}` };
        }
    },
    {
        type: 'karcher-warranty-claim', label: 'Kärcher warranty claim', folder: byYear('Kärcher/Warranty claims'),
        test: c => /Your Warranty Claim:\s*\d+/.test(c.text),
        read(c) {
            const number = pick(c.text, /Your Warranty Claim:\s*(\d+)/);
            const date = dmy(c.text, /Repair Date:\s*(\d\d)\/(\d\d)\/(\d{4})/) || dmy(c.text, /\b\d{10}\s+(\d\d)\/(\d\d)\/(\d{4})/);
            const machine = pick(c.text, /Defect Machine:\s*[\d.\-]+;\s*(.+)/).replace(/\s*\*?EU\*?\s*$/i, '').trim();
            const serial = pick(c.text, /Serial No\.:\s*(\S+)/);
            const value = amount(pick(c.text, /Value of Claim:\s*([\d.,]+)/));
            return { date, number, machine, serial, amount: value, currency: 'EUR', name: `${date} Kärcher warranty claim ${number} ${machine}` };
        }
    },
    {
        type: 'karcher-delivery-note', label: 'Kärcher delivery note', folder: byYear('Kärcher/Deliveries'),
        test: c => /DELIVERY NOTE/.test(c.head) && /K[aä]rcher/i.test(c.head),
        read(c) {
            const number = pick(c.text, /\b(0995\d{6})\b/);
            const m = c.text.match(/\bDate\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/), date = m ? iso(m[3], monthEn(m[1]), m[2]) : '';
            return { date, number, name: `${date} Kärcher delivery note ${number}` };
        }
    },
    {
        type: 'gw-delivery', label: 'Gebrüder Weiss delivery note', folder: byYear('Kärcher/Deliveries'),
        test: c => /D\s?O\s?S\s?T\s?A\s?V\s?N\s?I\s?C\s?A/.test(c.head) && /Gebr[üu]der Weiss/i.test(c.text),
        read(c) {
            const number = String(Number(pick(c.text, /Br\.\s*:\s*(\d+)/)) || '');
            const date = dmy(c.text, /Datum\/Sat\s*:\s*(\d\d)\.(\d\d)\.(\d{4})/);
            return { date, number, name: `${date} Gebrüder Weiss delivery ${number}` };
        }
    },
    {
        type: 'export-declaration', label: 'Croatian export declaration', folder: byYear('Customs'),
        test: c => /Izvoznik:/.test(c.head) && /DEKLARACIJA/.test(c.head),
        read(c) {
            const number = pick(c.head, /^(\d{10})$/m);
            const date = dmy(c.text, /Datum pu[šs]tanja robe:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/) || dmy(c.text, /Datum:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/);
            const who = KARCHER.test(c.text) || /Karcher d\.o\.o/i.test(c.text) ? ' Kärcher' : '';
            return { date, number, name: `${date} Export declaration ${number}${who}` };
        }
    },
    {
        type: 'customs-declaration', label: 'Albanian customs declaration', folder: byYear('Customs'),
        test: c => /ASYCUDA/i.test(c.head) && /(DEKLARATE|DECLARATION)/.test(c.head),
        read(c) {
            const number = pick(c.text, /\b(\d{2}AL\d{12}R\d)\b/);
            const exporter = words(lineAfter(c.lines, /(Exporter|Eksportuesi)/).split(/\s+(Customs Reference|Referenca)/)[0], 3);
            const date = dmy(c.text, /\b[RLM]\s+\d+\s+(\d\d)\/(\d\d)\/(\d{4})/) || dmy(c.text, /Date\s+(\d\d)\/(\d\d)\/(\d{4})/);
            return { date, number, party: exporter, name: `${date} Customs declaration ${number} ${exporter}` };
        }
    },
    {
        // The central e-invoice platform's own PDF. Danfos as seller is a sale; anyone else is a bill.
        type: 'e-invoice', label: 'E-invoice (Platforma Qendrore)', folder: (date, f) => `${f.direction === 'purchase' ? 'Purchase invoices' : 'Sales invoices'}/${(date || '').slice(0, 4) || 'Undated'}`,
        test: c => /PLATFORMA QENDRORE E FATURAVE/.test(c.head) && /Numri i faturës:/i.test(c.text),
        read(c) {
            const seller = pick(c.text, /^Emri:\s*(.+)$/m).trim();
            const bi = c.lines.findIndex(l => /BLERËSI/.test(l));
            const buyer = bi >= 0 ? pick(c.lines.slice(bi, bi + 4).join('\n'), /^Emri:\s*(.+)$/m).trim() : '';
            const number = pick(c.text, /Numri i faturës:\s*(\S+)/i);
            const date = dmy(c.text, /lëshimit të faturës:\s*(\d\d)\.(\d\d)\.(\d{4})/);
            const m = c.text.match(/Shuma totale me TVSH:\s*([\d\s.,]+?)\s*(EUR|ALL|USD)/);
            const total = m ? amount(m[1]) : NaN, cur = m ? m[2] : 'EUR';
            const code = pick(c.text, /llojit të faturës:\s*(\d+)/);
            const credit = code === '381' || /korrigjuese/i.test(pick(c.text, /llojit të faturës:\s*\d+\s*\/\s*(.+)/));
            const sale = DANFOS.test(seller) || /^DANFOS\b/i.test(seller);
            const what = credit ? 'credit note' : 'invoice';
            return sale
                ? { direction: 'sale', date, number, party: buyer, amount: total, currency: cur, name: `${date} E-${what} ${number} ${buyer} ${money(cur, total)}` }
                : { direction: 'purchase', date, number, party: seller, amount: total, currency: cur, name: `${date} Purchase ${what} ${number} ${seller} ${money(cur, total)}` };
        }
    },
    {
        // easyPOS / easyInvoice's own layout ("DETAJE"), in Albanian or English.
        type: 'till-invoice', label: 'Invoice from easyPOS / easyInvoice', folder: byYear('Sales invoices'),
        test: c => /^(DETAJE|DETAILS)$/m.test(c.head) && /(Numri i Faturës|Invoice Number):\s*\d+\/\d{4}/.test(c.text) && !/^Draft fature/m.test(c.head),
        read(c) {
            const number = pick(c.text, /(?:Numri i Faturës|Invoice Number):\s*(\d+\/\d{4})/);
            const date = dmy(c.text, /^(?:Data|Date):\s*(\d\d)\.(\d\d)\.(\d{4})/m);
            const cur = pick(c.text, /(?:Valuta e Faturës|Invoice Currency):\s*([A-Z]{3})/) || 'EUR';
            const buyer = lineAfter(c.lines, /(Shitësi|Seller):\s*(Blerësi|Buyer):/).replace(DANFOS, '').trim();
            const total = lastNumber(pick(c.text, new RegExp(`^(?:TOTALI NË|TOTAL) ${cur}\\s+(.+)$`, 'm')));
            return { direction: 'sale', date, number, party: buyer, amount: total, currency: cur, name: `${date} Invoice ${number} ${buyer} ${money(cur, total)}` };
        }
    },
    {
        type: 'proforma', label: 'Proforma / draft invoice', folder: byYear('Proformas and drafts'),
        test: c => /Pro-\s*forma\s*\/\s*Preventiv|^Draft fature/m.test(c.head),
        read(c) {
            const draft = /^Draft fature/m.test(c.head);
            const date = dmy(c.text, /Data:\s*(\d\d)\.(\d\d)\.(\d{4})/);
            const buyer = draft ? lineAfter(c.lines, /Shitësi:\s*Blerësi:/).replace(DANFOS, '').trim() : pick(c.text, /Preventiv:\s*(.+)$/m).trim();
            const number = draft ? pick(c.text, /Numri i Faturës:\s*(\d+\/\d{4})/) : '';
            const cur = pick(c.text, /Valuta e Faturës:\s*([A-Z]{3})/) || 'EUR';
            const total = lastNumber(pick(c.text, new RegExp(`^TOTALI NË ${cur}\\s+(.+)$`, 'm')));
            return { date, number, party: buyer, amount: total, currency: cur,
                name: `${date} ${draft ? `Draft invoice ${number}` : 'Proforma'} ${buyer} ${money(cur, total)}` };
        }
    },
    {
        type: 'commercial-invoice', label: 'Supplier commercial invoice', folder: byYear('Purchase invoices'),
        test: c => /^COMMERCIAL INVOICE$/m.test(c.head) && /INVOICE NUMBER:/.test(c.head),
        read(c) {
            const number = pick(c.text, /INVOICE NUMBER:\s*(\S+)/);
            const date = dmy(c.text, /INVOICE DATE:\s*(\d\d)\.(\d\d)\.(\d{4})/);
            const total = amount(pick(c.text, /^TOTAL\s+([\d.,]+)\s*€/m));
            return { date, number, amount: total, currency: 'EUR', name: `${date} Commercial invoice ${number} ${money('EUR', total)}` };
        }
    },
    {
        // A foreign supplier's proforma: "Invoice No: BC25216", "Date: 21-Jul-2025", and the seller
        // printed beside Danfos as buyer.
        type: 'supplier-proforma', label: 'Supplier proforma', folder: byYear('Purchase invoices'),
        test: c => /^PROFORMA INVOICE$/m.test(c.head) && /Invoice No\s*:/.test(c.head),
        read(c) {
            const number = pick(c.text, /Invoice No\s*:\s*(\S+)/);
            const m = c.text.match(/Date:\s*(\d{1,2})-([A-Za-z]{3})-(\d{4})/), date = m ? iso(m[3], monthEn(m[2]), m[1]) : '';
            const seller = words(lineAfter(c.lines, /Buyer\s*:\s*Seller\s*:/).replace(DANFOS, '').replace(/^DANFOS\s*SHPK\s*/i, ''), 2);
            return { date, number, party: seller, name: `${date} Supplier proforma ${number} ${seller}` };
        }
    },
    {
        // A Turkish supplier's proforma (Bayersan): "PROFORMA INVOICE", "INV. NO 724", "DATE 24.07.2025",
        // "TOTAL EXWORKS € 1.578,00", and the supplier's name on the first line.
        type: 'supplier-proforma-tr', label: 'Supplier proforma', folder: byYear('Purchase invoices'),
        test: c => /PROFORMA INVOICE/.test(c.head) && /INV\.\s*NO\s+\d+/.test(c.head),
        read(c) {
            const number = pick(c.text, /INV\.\s*NO\s+(\d+)/);
            const date = dmy(c.text, /DATE\s+(\d\d)\.(\d\d)\.(\d{4})/);
            const seller = words((c.lines[0] || '').replace(/[^\p{L}\s&-]/gu, ' '), 1);
            const total = amount(pick(c.text, /^TOTAL[^\d\n]*?([\d.,]+)\s*$/m));
            return { date, number, party: seller, amount: total, currency: 'EUR', name: `${date} Supplier proforma ${number} ${seller} ${money('EUR', total)}` };
        }
    },
    {
        // Other suppliers' invoices to Danfos. Edifloor (Kosovo): "F A T U R Ë", the number on the next
        // line, "Subjekti : <seller> Subjekti : DANFOS". Chili House: "INVOICE", "Nr. Faturës INV-000027",
        // "Data e Faturimit 24 Sep 2025", the seller on the first line.
        type: 'purchase-invoice', label: 'Supplier invoice', folder: byYear('Purchase invoices'),
        test: c => (/^F\s?A\s?T\s?U\s?R\s?[ËE]$/m.test(c.head) && /Subjekti\s*:\s*DANFOS/i.test(c.text)) || (/^INVOICE\b/m.test(c.head) && /Nr\. Faturës/.test(c.head)),
        read(c) {
            const edif = /Subjekti\s*:\s*(.+?)\s+Subjekti\s*:\s*DANFOS/i.exec(c.text);
            const seller = words(edif ? edif[1] : c.lines[0], 3);
            const number = (edif ? lineAfter(c.lines, /^F\s?A\s?T\s?U\s?R\s?[ËE]$/) : pick(c.text, /Nr\. Faturës\s+(\S+)/)).trim();
            const m = c.text.match(/Data e Faturimit\s+(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})/);
            const date = m ? iso(m[3], monthEn(m[2]), m[1]) : dmy(c.text, /Data[^\d\n]{0,20}(\d{1,2})[./](\d{1,2})[./](\d{4})/);
            const total = lastNumber(pick(c.text, /^Total\s+(.+)$/m));
            return { date, number, party: seller, amount: total, currency: 'EUR', name: `${date} Purchase invoice ${number} ${seller} ${money('EUR', total)}` };
        }
    },
    {
        // A haulier's invoice for bringing a supplier's goods in. The supplier is only in the file
        // name ("Danfos - Rulopak Fature Transporti"), and it is what ties the cost to a shipment.
        type: 'transport-invoice', label: 'Transport invoice', folder: byYear('Purchase invoices'),
        test: c => /^FATURE SHITJE$/m.test(c.head) && /transport/i.test(c.name + c.text),
        read(c) {
            const number = pick(c.text, /Nr i Fatures:\s*(\S+)/);
            const date = dmy(c.text, /Data:\s*(\d\d)\/(\d\d)\/(\d{4})/);
            const load = stemWords(c.name, /\b(danfos|fature|faturë|transporti?)\b/gi);
            return { date, number, party: load, name: `${date} Transport invoice ${number}${load ? ` for ${load}` : ''}` };
        }
    },
    {
        type: 'courier', label: 'Courier air waybill / invoice', folder: byYear('Customs'),
        test: c => /^AWB:\s*\d+\s+Ship Dt:/m.test(c.head),
        read(c) {
            const m = c.head.match(/^AWB:\s*(\d+)\s+Ship Dt:\s*(\d{1,2})-([A-Za-z]{3})-(\d{4}).*?\b(AWB|CI)\s*-\s*Page/m);
            if (!m) return null;
            const date = iso(m[4], monthEn(m[3]), m[2]);
            return { date, number: m[1], name: `${date} Courier ${m[5] === 'CI' ? 'commercial invoice' : 'air waybill'} ${m[1]}` };
        }
    },
    {
        // Raiffeisen's advice for money that left (Debitimi) or arrived (Kreditimi).
        type: 'bank-advice', label: 'Bank payment advice', folder: byYear('Bank/Payments'),
        test: c => /Njoftim (Debitimi|Kreditimi)/.test(c.head),
        read(c) {
            const out = /Debitimi/.test(c.head);
            const date = dmy(c.text, /Data \/ Date\s+(\d\d)\/(\d\d)\/(\d{4})/);
            const total = amount(pick(c.text, /Shuma e urdheruar\s+([\d.,]+)/) || pick(c.text, /Shuma\s+([\d.,]+)/));
            const cur = pick(c.text, /Monedha\s+([A-Z]{3})/) || 'EUR';
            // The bank prints the name in capitals and runs the address on after it in ordinary
            // case ("STAR Ferhatpasa Mah. 34", "KARCHER Karcher doo, Samoborska"), so the name is
            // the capitalised words at the start. A trailing NIPT is dropped.
            const caps = w => /\p{Lu}/u.test(w) && !/\p{Ll}/u.test(w) && !/^[A-Z]\d{8}[A-Z]$/.test(w) && !/^\d/.test(w);
            const strip = s => { const t = String(s).trim().split(/\s+/); const n = t.findIndex(w => !caps(w)); return words(t.slice(0, n < 0 ? t.length : n || 1).join(' ').replace(/[,.:;]+$/, ''), 4); };
            const party = strip(pick(c.text, out ? /Beneficiary Customer\s+(.+)$/m : /Ordering Customer\s+(.+)$/m));
            return { direction: out ? 'out' : 'in', date, amount: total, currency: cur, party,
                name: `${date} Payment ${out ? 'to' : 'from'} ${party} ${money(cur, total)}` };
        }
    },
    {
        // Raiffeisen's "Account Turnover" statement, which downloads as "document (N).pdf".
        type: 'bank-statement', label: 'Bank statement', folder: byYear('Bank/Statements'),
        test: c => /^ACCOUNT TURNOVER$/m.test(c.head) && /Date From:/.test(c.head),
        read(c) {
            const account = pick(c.text, /Account Number:\s*\S*?(\d{10})\b/);
            const from = dmy(c.text, /Date From:\s*(\d\d)\.(\d\d)\.(\d{4})/), to = dmy(c.text, /Date To:\s*(\d\d)\.(\d\d)\.(\d{4})/);
            return { date: to, account, period: `${from} to ${to}`, name: `Bank statement ${account} ${from} to ${to}` };
        }
    },
    {
        type: 'tax-payment-order', label: 'Tax payment order', folder: byYear('Tax/Payment orders'),
        test: c => /URDHËR PAGESË\s+\d+/.test(c.head) && /Periudha tatimore/.test(c.text),
        read(c) {
            const code = pick(c.text, /URDHËR PAGESË\s+(\d+)/);
            const what = words(pick(c.text, /URDHËR PAGESË\s+\d+,\s*(.+)$/m), 4);
            const p = c.text.match(/Periudha tatimore\s+(\d{2})(\d{2}|-A),\s*(\d{4})/);
            const period = p ? (p[2] === '-A' ? p[3] : `${p[3]}-${p[2]}`) : '';
            const date = dmy(c.text, /deri më:\s*(\d\d)\.(\d\d)\.(\d{4})/) || nameDate(c.name);
            return { date, number: code, period, name: `${date} Tax payment order ${code} ${what} ${period}` };
        }
    },
    {
        // The tax office's return forms: monthly VAT ("2511") and the yearly profit tax ("24-A").
        type: 'tax-return', label: 'Tax return (VAT, profit tax)', folder: p => `Tax/Returns/${(p || '').slice(0, 4) || 'Undated'}`,
        test: c => /DEKLARATA E TATIMIT MBI|FORMULAR I DEKLARIMIT TË TATIMIT/.test(c.head),
        read(c) {
            const what = /VLERËN E SHTUAR/.test(c.head) ? 'VAT return' : /MBI FITIMIN/.test(c.head) ? 'Profit tax return' : 'Tax return';
            const raw = lineAfter(c.lines, /Periudha tatimore/).trim();
            const monthly = raw.match(/^(\d{2})(\d{2})$/) || c.name.match(/_(\d{2})(\d{2})_/);
            const yearly = raw.match(/^(\d{2})-A$/) || c.name.match(/_(\d{2})-A_/);
            const period = monthly ? `20${monthly[1]}-${monthly[2]}` : yearly ? `20${yearly[1]}` : '';
            return { date: period ? `${period}-01`.slice(0, 10) : '', period, name: `${what} ${period}` };
        }
    },
    {
        type: 'qkb-extract', label: 'Business register extract (QKB)', folder: () => 'Companies (QKB extracts)',
        test: c => /EKSTRAKT HISTORIK I REGJISTRIT TREGTAR/.test(c.head) || (/QENDRA KOMBËTARE E BIZNESIT/.test(c.head) && /REGJISTRIMI/.test(c.head)),
        read(c) {
            if (!/EKSTRAKT HISTORIK/.test(c.head)) return { keepName: true };     // a registration certificate
            // Companies print the NUIS on the next line; sole traders ("PERSON FIZIK") on the same one.
            const who = pick(c.text, /Emri i Subjektit\s+(.+)$/im).replace(/["“”]/g, '').trim();
            const nuis = pick(c.text, /Numri unik i identifikimit[^\n]*?\b([A-Z]\d{8}[A-Z])\b/) || c.lines.find(l => /^[A-Z]\d{8}[A-Z]$/.test(l)) || '';
            return who ? { party: who, number: nuis, name: `QKB extract ${who} ${nuis}` } : { keepName: true };
        }
    },
    {
        // Danfos's own offers, in the three layouts they have been written in: the long "Ofertë
        // teknike dhe financiare" (client after "Për:"), the Word template headed "Oferte" /
        // "OFERT E", and the letterhead page with prices. Several versions of one offer are common
        // (FINAL, FINAL_v3...), so a clash keeps the old file name to tell them apart.
        type: 'offer', label: 'Offer (ofertë)', folder: byYear('Offers'), versions: true,
        test: c => /OFERTË TEKNIKE DHE FINANCIARE|Ofertë Teknike dhe Financiare|PROPOZIM TEKNIK/i.test(c.head)
            || /^(Oferte|Ofert\s?ë|OFERTË|OFERT\s?E)$/m.test(c.lines.slice(0, 3).join('\n'))
            || (/ofert|propozim|cmimore/i.test(c.name) && /danfosal\.com|M41828015A|Danfos|K[aä]rcher/i.test(c.text))
            || (/Konferenca e Pezes.*Tel/i.test(c.lines[0] || '') && /Price:|Ç\s?mimi/i.test(c.head)
                && !/katalog|catalog|HORECA/i.test(c.name) && !/Përfaqësues i kompanive/i.test(c.head)),
        read(c) {
            let party = pick(c.text, /^Për:\s*(.+)$/m)
                .split(/\s+(?:Adresa|Data|Nga|Tel|Në vëmendje)\b/)[0].replace(/\s*\(.*$/, '').replace(/,\s*Tiran[ëe]\s*$/i, '').trim();
            if (!party) party = stemWords(c.name, /\b(danfos|shpk|ofert[aeë]?|propozim|profesionale|teknike|financiare|final|clean|v\d+|pdf|\d+)\b/gi);
            const m = c.text.match(/^(?:Data|Date):\s*(\d{1,2})\s+([A-Za-zËë]+)\s+(\d{4})/m);
            const date = (m && iso(m[3], monthSq(m[2]), m[1])) || dmy(c.text, /Data:\s*(\d\d)\/(\d\d)\/(\d{4})/) || nameDate(c.name);
            if (!party) return { date, name: `${date} ${c.base}` };
            return { date, party, name: `${date} Offer ${words(party, 6)}` };
        }
    },
    {
        type: 'personal', label: 'Personal / HR document', folder: () => 'Personal and HR', keepName: true, sensitive: true,
        test: c => /KONTRATE INDIVIDUALE PUNE|CERTIFIKAT\s?Ë?\s?E LINDJES|BIRTH CERTIFICATE|REGJISTRI QENDROR I GJENDJES CIVILE|DENIMET PENALE|identifikimit personal|deklarimin e pasurisë/i.test(c.head)
            || /pasaport|passport|certifikat.*lind|lindje|denimet|regjistri ?civil|rqgjc|kontrat.*pun|leje.?q[ëe]ndrim/i.test(c.name),
        read: () => ({})
    },
    {
        // Before contracts: a notice of contract award ("Njoftim për dhënie të kontratës") is a tender paper.
        type: 'tender', label: 'Tender notice', folder: () => 'Tenders', keepName: true,
        test: c => /NJOFTIM PËR DHËNIE TË KONTRATËS|Numri i Prokurimit/i.test(c.head) || /tender|prokurim|njoftim per dhenie/i.test(c.name),
        read: () => ({})
    },
    {
        // Contracts with customers or partners. Employment contracts are personal (above).
        type: 'contract', label: 'Contract', folder: () => 'Contracts', keepName: true,
        test: c => /^\s*(DRAFT )?(KONTRAT[ËE]|MARRËVESHJE|CONTRACT)\b/im.test(c.head) || /kontrat|contract|marr[eë]veshje/i.test(c.name),
        read: () => ({})
    },
    {
        type: 'report', label: 'Report', folder: () => 'Reports', keepName: true,
        test: c => /raport|report|manifest/i.test(c.name) || /Advertising Report|Board \/ Investor|GOLDEN MANIFEST/i.test(c.head),
        read: () => ({})
    },
    {
        // A car's papers: an export clearance, a registration, plates.
        type: 'vehicle', label: 'Vehicle papers', folder: () => 'Vehicles', keepName: true,
        test: c => /clearance|targ[ëe]|vehicle|leje qarkullimi/i.test(c.name) || /차량|VEHICLE REGISTRATION/i.test(c.head),
        read: () => ({})
    },
    {
        type: 'warranty-letter', label: 'Warranty letter to a customer', folder: () => 'Warranty letters', keepName: true,
        test: c => /garancion/i.test(c.name) || /ka garancion/i.test(c.text),
        read: () => ({})
    },
    {
        // A notice printed for the shop door: one page, a line or two, no figures but a time.
        type: 'sign', label: 'Shop sign / notice', folder: () => 'Marketing/Shop signs', keepName: true,
        test: c => c.pages === 1 && c.lines.length > 0 && c.lines.length <= 4 && c.text.length < 90 && !/\d{3,}/.test(c.text.replace(/\d{1,2}:\d{2}/g, '')),
        read: () => ({})
    },
    {
        type: 'marketing', label: 'Marketing / promotion', folder: () => 'Marketing', keepName: true,
        test: c => /black ?friday|promo|fushat|reklam/i.test(c.name),
        read: () => ({})
    },
    {
        type: 'research', label: 'Book / research (ADI)', folder: () => 'ADI',
        test: c => /Anna[’']s Archiv|isbn|gallica|btv1b|journal/i.test(c.name)
            || /Source gallica|ISSN|doi\.org|DOI: ?10\.|Doktora Tez|DOKTORA TEZ|Yüksek Lisans|YÜKSEK L|Thesis|Tesis para|ÜN\s?[İI]\s?VERS|STUDIME HISTORIKE|Journal of|Libra Online/i.test(c.head)
            || c.pages >= 80,
        read(c) {
            // Anna's Archive names: "Title _ Subtitle -- Author -- ... -- <md5> -- Anna's Archive.pdf".
            const parts = c.base.split(' -- ');
            if (parts.length >= 3 && /Anna/.test(parts[parts.length - 1])) {
                const title = parts[0].replace(/ _ /g, ' - ').replace(/_/g, ' ');
                const author = parts[1].split(/[;,]/)[0].replace(/_/g, '.').trim();
                return { name: `${title} (${author})` };
            }
            return { keepName: true };
        }
    },
    {
        type: 'catalogue', label: 'Danfos catalogue', folder: () => 'Catalogues', keepName: true,
        test: c => /Përfaqësues i kompanive Karcher/i.test(c.head) || /katalog|catalog|HORECA/i.test(c.name),
        read: () => ({})
    },
    {
        type: 'price-list', label: 'Supplier price list', folder: () => 'Suppliers/Price lists', keepName: true,
        test: c => /\bPRICE LIST\b/i.test(c.head),
        read: () => ({})
    },
    {
        type: 'product-info', label: 'Product sheet / certificate', folder: () => 'Suppliers/Product info', keepName: true,
        test: c => /Fletë Produkti|^T\s?echnical data$|Technical Information Explanation|DECLARATION OF PERFORMANCE|Informacione mbi Produktet|SAFETY DATA SHEET/im.test(c.head)
            || /msds|\bsds\b|specifikat|manual|udh[eë]zues/i.test(c.name)
            || (/\bDeutsch\s+\d+$/m.test(c.head) && /^English\s+\d+$/m.test(c.head)),     // a multilingual manual's contents
        read: () => ({})
    }
];

// ------------------------------------------------------------------ files that aren't read as text

// Spreadsheets, old Word files, slides, e-books: by what the file name says. Names are kept.
const BY_NAME = [
    [/dergesat/i, 'shipments', 'Courier shipments export', 'Exports/Shipments'],
    [/^(Order|OrderItem|Invoice)_CustomerNo_/i, 'karcher-export', 'Kärcher portal export', 'Kärcher/Portal exports'],
    [/raport.?analitik|raport.?vleresim|^shitjet_|^artikujt|t_articles_sale_purchase|te_ardhurat_dhe_shpenzimet|template_fature_blerje|template_import/i, 'easybooks', 'EasyBooks export / template', 'Exports/EasyBooks'],
    [/doganor|perdogan/i, 'customs-list', 'Customs product list', 'Customs/Product lists'],
    [/redovni|gratis.?tablica|ponuda/i, 'karcher-pricelist', 'Kärcher price list / offer', 'Kärcher/Price lists'],
    [/product.?list|assortment|local.?products|^(bayersan|rulopak|fersan)\b/i, 'price-list', 'Supplier price list', 'Suppliers/Price lists'],
    [/ofert|kalkulim/i, 'offer', 'Offer (ofertë)', 'Offers'],
    [/^shitje|cmime_konvertuar/i, 'sales-analysis', 'Sales analysis', 'Exports/Sales'],
    [/pasqyr|bilanc/i, 'financial-statements', 'Financial statements', 'Tax/Financial statements'],
    [/payment.?plan/i, 'payment-plan', 'Payment plan', 'Bank/Payment plans'],
    [/kontrat|contract|marr[eë]veshje/i, 'contract', 'Contract', 'Contracts'],
    [/msds|\bsds\b|specifikat|technical/i, 'product-info', 'Product sheet', 'Suppliers/Product info'],
    [/katalog|catalog/i, 'catalogue', 'Danfos catalogue', 'Catalogues'],
    [/raport|report|manifest/i, 'report', 'Report', 'Reports'],
    [/Anna[’']s Archiv|isbn/i, 'research', 'Book / research (ADI)', 'ADI'],
    [/targ[ëe]\b|targë prove|clearance/i, 'vehicle', 'Vehicle papers', 'Vehicles'],
    [/regjistrime|qkb/i, 'qkb-extract', 'Business register paper (QKB)', 'Companies (QKB extracts)']
];

// When the name says nothing: a spreadsheet's column labels.
const BY_LABELS = [
    [/KODI TARIFOR/i, /PESHA|ORIGJINA/i, 'customs-list', 'Customs product list', 'Customs/Product lists'],
    [/Material ?No|MatNo/i, /Gross ?Weight|Net ?Value/i, 'karcher-packing', 'Kärcher packing list', 'Kärcher/Packing lists'],
    [/PROFAKTUR|PROFORMA/i, /.*/, 'proforma', 'Proforma / draft invoice', 'Proformas and drafts'],
    [/kodi artikullit/i, /cmimi|tvsh/i, 'easybooks', 'EasyBooks item list', 'Exports/EasyBooks'],
    [/P[ëe]rshkrimi/i, /Sasia/i, 'sales-analysis', 'Sales / invoice export', 'Exports/Sales']
];

// A non-PDF file. A Word document's text goes through the same rules as a PDF's first; anything
// else is filed by its name, under that name.
export function classifyFile({ name, ext, lines = [], labels = [] }) {
    if (lines.length) { const hit = classify({ name, lines, pages: 1, ext }); if (hit) return hit; }
    const byName = BY_NAME.find(([re]) => re.test(name));
    const all = labels.join(' | '), byLabels = !byName && labels.length ? BY_LABELS.find(([a, b]) => a.test(all) && b.test(all)) : null;
    const rule = byName || (byLabels && [null, ...byLabels.slice(2)]);
    if (!rule) return null;
    return { type: rule[1], label: rule[2], folder: rule[3], newName: `${clean(baseName(name))}${ext}`, fields: {}, sensitive: false, versions: false, undated: false };
}

// An archival finding aid (EAD XML) - a record from a manuscript catalogue, for ADI's research.
export const isArchiveRecord = head => /<(ead|eadheader)\b|<filedesc>|<titlestmt>/.test(head);

// ------------------------------------------------------------------ scans

// Recognised text is rough ("Katcher d.0.0.", "FFRSANI"), so a scan is only told by whose it is and
// what kind of paper it is, never read for figures. Whose: the supplier's name, spelled loosely.
const SCAN_PARTIES = [
    [/k[aä]rcher|katcher|karshet|samoborska/i, 'Kärcher'], [/bayersan|^BYI20\d{2}/i, 'Bayersan'], [/rulopak/i, 'Rulopak'],
    [/ff?[ei]?rsan/i, 'Fersan'], [/sonuk|[s8]tar\s*(tekn|makina|servis)|^star\b/i, 'Star'], [/edifloor/i, 'Edifloor']
];
// The date: the scanner's file name ("20250508142223.pdf", "4780_250228123345_001.pdf",
// "Scan2025-04-10_151452"), else the first real date in the text ("06.03.2025", "20092025").
function scanDate(name, text) {
    let m = name.match(/^(20\d{2})(\d{2})(\d{2})\d{6}/) || name.match(/Scan(20\d{2})-(\d{2})-(\d{2})/);
    if (m && iso(m[1], m[2], m[3])) return iso(m[1], m[2], m[3]);
    m = name.match(/_(\d{2})(\d{2})(\d{2})\d{6}_/);
    if (m && iso('20' + m[1], m[2], m[3])) return iso('20' + m[1], m[2], m[3]);
    for (const x of text.matchAll(/\b(\d{2})[./]?(\d{2})[./]?(20\d{2})\b/g)) { const d = iso(x[3], x[2], x[1]); if (d) return d; }
    return '';
}

// A scan: its recognised first-page lines. Null when it can't be placed with confidence.
export function classifyScan({ name, lines, pages }) {
    const text = lines.join('\n'), all = `${name}\n${text}`;
    const party = (SCAN_PARTIES.find(([re]) => re.test(name) || re.test(text)) || [])[1] || '';
    const date = scanDate(name, text), year = date.slice(0, 4) || 'Undated';
    const out = (type, label, folder, stem) => ({ type, label, folder, newName: `${clean(stem)}.pdf`, fields: { date, party, scan: true }, sensitive: false, versions: false, undated: !date });
    // Checked strongest first. A Turkish e-invoice is named by its number ("BYI2025000000156").
    const eInvoice = /^[A-Z]{3}20\d{2}\d{9}/.test(name);
    if (party && eInvoice)
        return out('supplier-invoice-scan', 'Supplier invoice (scan)', `Purchase invoices/${year}`, `${date} Supplier invoice ${party} ${name.slice(0, 16)} (scan)`);
    // Export papers: a Turkish export declaration number ("25341300EX00709943"), the customs office,
    // an origin certificate ("Consignor … ORIGINAL", EUR.1).
    if (/\d{2}34\d{4}EX\d{6,}|G[UÜ]MR[UÜ]K|Consignor|Ihracat|EUR\.?\s?1\b/i.test(all))
        return out('customs-scan', 'Customs / export papers (scan)', `Customs/${year}`, `${date} Customs papers${party ? ' ' + party : ''} (scan)`);
    if (/certificate of conformity|conformity|typenschild|street sweeper|blancus|makinesi/i.test(all) && !/fatura|invoice/i.test(text))
        return out('product-info', 'Product sheet / certificate (scan)', 'Suppliers/Product info', baseName(name));     // a leaflet keeps its name
    if (/DEKLARAT|DECLARATION/i.test(all) || /^901\b/.test(name))
        return out('customs-scan', 'Customs / export papers (scan)', `Customs/${year}`, `${date} Customs papers${party ? ' ' + party : ''} (scan)`);
    if (party === 'Kärcher')
        return out('karcher-scan', 'Kärcher papers (scan)', `Kärcher/Scans/${year}`, `${date} Kärcher papers (scan${pages > 1 ? `, ${pages} pages` : ''})`);
    if (party && /e-?fatura|fatura|invoice/i.test(text))
        return out('supplier-invoice-scan', 'Supplier invoice (scan)', `Purchase invoices/${year}`, `${date} Supplier invoice ${party} (scan)`);
    if (party)
        return out('supplier-scan', 'Supplier papers (scan)', `Suppliers/Scans/${year}`, `${date} ${party} papers (scan)`);
    return null;
}

// A Raiffeisen statement exported as XML or CSV, filed beside the PDF ones.
export function classifyBankExport({ account, from, to }, ext) {
    return { type: 'bank-statement', label: 'Bank statement (data export)', folder: `Bank/Statements/${(to || '').slice(0, 4) || 'Undated'}`,
        newName: `${clean(`Bank statement ${account} ${from} to ${to}`)}${ext}`, fields: { account, period: `${from} to ${to}` }, sensitive: false, versions: false, undated: !to };
}

// A file's name without its extension ("Oferte.docx" -> "Oferte"; "PDF (3)" stays "PDF (3)").
export const baseName = name => name.replace(/(\.pdf)+$/i, '').replace(/\.(docx?|xlsx?|pptx?|csv|xml|epub|txt|tiff?|eml|md|json)$/i, '');

// c = { name, lines, pages, ext }. ext is what the filed copy ends in: its own extension, or ".pdf"
// for a PDF that came without one. Returns null when nothing is sure enough to act on.
export function classify(c) {
    const ext = c.ext || '.pdf';
    const ctx = { ...c, base: baseName(c.name), text: c.lines.join('\n'), head: c.lines.slice(0, 14).join('\n') };
    for (const rule of RULES) {
        if (!rule.test(ctx)) continue;
        const facts = rule.read(ctx);
        if (!facts) continue;
        const keepName = rule.keepName || facts.keepName;
        const stem = clean(keepName ? ctx.base : facts.name);
        const folder = rule.folder(facts.date || facts.period || '', facts);
        const { name, keepName: _k, ...fields } = facts;
        return { type: rule.type, label: rule.label, folder, newName: `${stem || clean(ctx.base)}${ext}`,
            fields: rule.sensitive ? {} : fields, sensitive: !!rule.sensitive, versions: !!rule.versions,
            undated: !keepName && !facts.date && /\bUndated\b/.test(folder) };
    }
    return null;
}

export const TYPES = RULES.map(r => ({ type: r.type, label: r.label }));
