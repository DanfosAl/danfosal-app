// Receipt parser checks for the EasyPOS OCR bridge. Run from resources/app: node tests/easypos-ocr-bridge.cjs
// Every receipt below is made up. This repository is public: never paste a real capture in here.
const assert = require('node:assert/strict');
// The bridge appends each log line to C:\Danfosal\Logs. A test run must not write to the shop's log.
require('fs-extra').appendFileSync = () => {};
const { EasyPOSOCRProcessor } = require('../easypos-ocr-bridge');

const p = new EasyPOSOCRProcessor();
const lines = text => text.split('\n').map(l => l.trim()).filter(l => l);
const capture = { jobId: 'test', timestamp: '2026-01-01T00:00:00Z' };

const sale = `FATURE TATIMORE
Shitesi Test SHPK
NIPT A00000000A
Fatura Nr: 68/2026/mv200vz195
Data/Ora: 07/02/2026 16:18:08
Valuta EUR
Kursi 95.50
DETAJET E BLERESIT
Emri Klient Test
NIPT B00000000B
Adresa
Rruga Test 1, Tirane
ALB
K 5 Basic *EU
1 cope X 340.00 340.00
Qese per T11/1
10 cope X 2.00 20.00
TOTAL LEK 34,380.00
TOTAL EUR 360.00`;

// A credit note prints "Note Krediti" above its number. The old parser read the "No" in "Note"
// as a label and saved every credit note with invoice number "te".
const creditNote = `FATURE TATIMORE
Korrigjuese - Note Krediti
Shitesi Test SHPK
NIPT A00000000A
Fatura Nr: 222/2026/mv200vz195
Data/Ora: 15/03/2026 10:20:30
Valuta EUR
Kursi 95.50
DETAJET E BLERESIT
Emri Klient Test
K 5 Basic *EU
-1 cope X 340.00 -340.00
TOTAL LEK -32,470.00
TOTAL EUR -340.00`;

assert.equal(p.findInvoiceNumber(lines(creditNote)), '222/2026/mv200vz195');
assert.equal(p.findInvoiceNumber(lines(sale)), '68/2026/mv200vz195');

// Without a Fatura Nr line the loose fallback still works, but only on whole words.
assert.equal(p.findInvoiceNumber(['Korrigjuese - Note Krediti', 'Invoice: 4471']), '4471');
assert.equal(p.findInvoiceNumber(['Receipt #: 4471']), '4471');
assert.equal(p.findInvoiceNumber(['Korrigjuese - Note Krediti', 'Nota e dorezimit', 'Konferenca']), null);

const saleData = p.extractInvoiceData(sale, capture);
assert.equal(saleData.invoiceNumber, '68/2026/mv200vz195');
assert.equal(saleData.invoiceDate, '07/02/2026');
assert.equal(saleData.currency, 'EUR');
assert.equal(saleData.grandTotal, 360);
assert.deepEqual(saleData.items.map(i => [i.itemName, i.quantity, i.lineTotal]), [['K 5 Basic *EU', 1, 340], ['Qese per T11/1', 10, 20]]);
assert.equal(saleData.linesMatchTotal, true);
assert.equal(p.detectReturnOrCancellation(saleData).isReturn, false);

const creditData = p.extractInvoiceData(creditNote, capture);
assert.equal(creditData.invoiceNumber, '222/2026/mv200vz195');
assert.equal(creditData.grandTotal, -340);
assert.equal(creditData.linesMatchTotal, true);
assert.equal(p.detectReturnOrCancellation(creditData).isReturn, true);

// A stand-in for Firestore: answers each where() from docsFor and records which fields were queried.
const fakeDb = docsFor => {
    const queried = [];
    return {
        queried,
        collection: name => ({
            where(field, op, value) {
                queried.push(`${name}.${field}`);
                const docs = (docsFor(name, field, value) || []).map(([id, data]) => ({ id, data: () => data }));
                const query = { limit: () => query, get: async () => ({ empty: !docs.length, docs }) };
                return query;
            }
        })
    };
};

(async () => {
    // A credit note's number is its own, so a sale carrying the same number is not the one it
    // reverses. The original is found by customer and amount, and the number is never looked up.
    const sameNumberSale = ['unrelated-sale', { total: 99, clientName: 'Tjeter Klient' }];
    const originalSale = ['original-sale', { total: 340, clientName: 'Klient Test', timestamp: { toMillis: () => new Date(2026, 2, 10).getTime() } }];
    const creditDb = fakeDb((name, field, value) => {
        if (name === 'storeSales' && field === 'easypos.invoiceNumber' && value === creditData.invoiceNumber) return [sameNumberSale];
        if (name === 'storeSales' && field === 'clientName' && value === 'Klient Test') return [originalSale];
        return [];
    });
    assert.deepEqual(await p.findOriginalTransaction(creditDb, creditData), { type: 'storeSale', saleId: 'original-sale' });
    assert.ok(!creditDb.queried.includes('storeSales.easypos.invoiceNumber'));
    assert.ok(!creditDb.queried.includes('onlineOrders.linkedInvoiceNumber'));

    // Any other return still looks its number up.
    const storno = { invoiceNumber: '300/2026/mv200vz195', rawText: 'STORNO', customerName: 'Walk-in Customer', grandTotal: -50, invoiceDate: '15/03/2026' };
    const stornoDb = fakeDb((name, field) => (name === 'storeSales' && field === 'easypos.invoiceNumber' ? [['storno-sale', { total: 50 }]] : []));
    assert.deepEqual(await p.findOriginalTransaction(stornoDb, storno), { type: 'storeSale', saleId: 'storno-sale' });

    console.log('PASS: invoice number on sales and credit notes, whole-word fallback, sale receipt still parses, credit notes link by customer and amount');
})().catch(error => { console.error(error); process.exitCode = 1; });
