// Checks for the easyPOS invoice reader. Run from tools/paper-autopilot: node --test easypos-invoice.test.js
// Every invoice below is made up. This repository is public: never paste a real invoice in here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easyPOSKind, readEasyPOSInvoice, saleData } from './easypos-invoice.js';

const lines = s => s.split('\n').map(l => l.trim()).filter(Boolean);

// An e-invoice in lek, with the item code running on to the next line.
const lek = lines(`Faturë Elektronike
DETAJE
Data: 03.11.2026 10:15:00 Operatori: ab123cd456 Lloji i Procesit: P1 - P1 Faturimi i
Numri i Faturës: 12/2026 Njësia e biznesit: DANFOS SH.P.K
Afati pagesës: 03.11.2026
Kodi / Lloji i Dokumentit: 380 / Faturë
tregtare
Shitësi: Blerësi:
DANFOS SH.P.K TEST KLIENT
A00000000A B11111111B
Rruga Test 1 Rruga Prove 2
Artikujt
Emri / Çmimi Për Njësi Sasia / Njësia Vlera pa TVSH TVSH Vlera me TVSH
Kodi artikullit / (Me TVSH)
Barkodi
Ngrohes Test 500 / TEST 12,000.00 2.000 / Cope 20,000.00 4,000.00 24,000.00
HEAT / -
Qese per T11/1 / Q-11 / - 600.00 1.000 / Cope 500.00 100.00 600.00
TOTALI NË ALL 20,500.00 4,100.00 24,600.00
Pagesa
TOTALI 24,600.00 ALL
Gjeneruar nga easyPOS`);

// An e-invoice in euros, with a name running on to the next line.
const eur = lines(`Faturë Elektronike
DETAJE
Data: 05.11.2026 09:00:00 Operatori: ab123cd456
Numri i Faturës: 13/2026 Njësia e biznesit: DANFOS SH.P.K
Valuta e Faturës: EUR
Kursi: 95.00
Kodi / Lloji i Dokumentit: 380 / Faturë tregtare
Shitësi: Blerësi:
DANFOS SH.P.K Prove Sh.p.k
A00000000A C22222222C
Artikujt
Emri / Çmimi Për Njësi Sasia / Njësia Vlera pa TVSH TVSH Vlera me TVSH
Microfiber per pastrim te xhamit 6.00 1.000 / cope 5.00 1.00 6.00
45cm / 78245 / 000000008
TOTALI NË EUR 5.00 1.00 6.00
TOTALI NË ALL 475.00 95.00 570.00`);

const till = lines(`Faturë Tatimore
DETAJE
Data: 05.11.2026 09:00:00 Operatori: ab123cd456
Numri i Faturës: 300/2026/ zz000zz000 Njësia e biznesit: DANFOS SH.P.K`);

test('tells an e-invoice from a till receipt and from other papers', () => {
    assert.equal(easyPOSKind(lek), 'e-invoice');
    assert.equal(easyPOSKind(till), 'till-receipt');
    assert.equal(easyPOSKind(lines('PLATFORMA QENDRORE E FATURAVE\nNumri i faturës: 5/2026')), null);
    assert.deepEqual(readEasyPOSInvoice(till), { kind: 'till-receipt' });
});

test('reads an e-invoice in lek', () => {
    const inv = readEasyPOSInvoice(lek);
    assert.equal(inv.invoiceNumber, '12/2026');
    assert.equal(inv.date, '2026-11-03');
    assert.equal(inv.docType, '380');
    assert.equal(inv.currency, 'ALL');
    assert.equal(inv.customerName, 'TEST KLIENT');
    assert.equal(inv.customerNipt, 'B11111111B');
    assert.deepEqual(inv.items.map(i => [i.itemName, i.code, i.quantity, i.net]), [['Ngrohes Test 500', 'TEST HEAT', 2, 20000], ['Qese per T11/1', 'Q-11', 1, 500]]);
    assert.deepEqual(inv.totals, { net: 20500, vat: 4100, gross: 24600 });
});

test('puts a lek invoice in euros at the rate given, and only with one', () => {
    const inv = readEasyPOSInvoice(lek);
    assert.equal(saleData(inv), null);
    const d = saleData(inv, 100);
    assert.equal(d.total, 246);
    assert.equal(d.subtotal, 205);
    assert.equal(d.tax, 41);
    assert.equal(d.conversionRate, 100);
    assert.equal(d.normalizedToEUR, true);
    assert.deepEqual(d.items.map(i => [i.quantity, i.pricePerUnit, i.lineTotal]), [[2, 100, 200], [1, 5, 5]]);
    assert.equal(d.items.reduce((s, i) => s + i.lineTotal, 0), d.subtotal);
});

test('reads an e-invoice in euros as it is', () => {
    const inv = readEasyPOSInvoice(eur);
    assert.equal(inv.currency, 'EUR');
    assert.equal(inv.customerName, 'Prove Sh.p.k');
    assert.deepEqual(inv.items.map(i => [i.itemName, i.code]), [['Microfiber per pastrim te xhamit 45cm', '78245']]);
    const d = saleData(inv, 100);          // a lek rate never touches a euro invoice
    assert.equal(d.total, 6);
    assert.equal(d.conversionRate, null);
    assert.equal(d.normalizedToEUR, false);
});
