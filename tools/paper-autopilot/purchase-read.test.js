// Checks for the Kärcher order-form reader. Run from tools/paper-autopilot: node --test purchase-read.test.js
// Every paper below is made up. This repository is public: never paste a real order in here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readKarcherOrderConfirmation, readKarcherProforma } from './purchase-read.js';

const lines = s => s.split('\n').map(l => l.trim()).filter(Boolean);

const confirmation = lines(`Order Confirmation
Kärcher d.o.o.
Order No. Date
7570000001 02.11.2026
Pos Material Ordered Confirmed Delivery Price Value
010 1.000-001.0 5.00 5.00 09.11.2026 100.00 450.00
K 9 Test Machine *EU
EAN 4000000000001
020 6.000-002.0 10.00 4.00 16.11.2026 5.00 50.00
Test Detergent 1L
030 2.000-003.0 3.00 0.00 20.00 60.00
Test Hose 10 m
Net Amount Total Amount
560.00 672.00`);

test('a confirmation keeps what Kärcher confirmed and when it will be delivered', () => {
    const o = readKarcherOrderConfirmation(confirmation);
    assert.equal(o.kind, 'order');
    assert.equal(o.source, 'confirmation');
    assert.equal(o.orderNo, '7570000001');
    assert.equal(o.date, '2026-11-02');
    assert.equal(o.total, 560);
    assert.deepEqual(o.items.map(i => [i.code, i.qty, i.confirmed, i.deliveryDate, i.total]), [
        ['1.000-001.0', 5, 5, '2026-11-09', 450],
        ['6.000-002.0', 10, 4, '2026-11-16', 50],
        ['2.000-003.0', 3, 0, '', 60]          // not confirmed yet: no date
    ]);
    assert.equal(o.items[0].name, 'K 9 Test Machine *EU');
    assert.equal(o.items[0].unitCost, 90);
});

test('a proforma line without a date reads as before', () => {
    const o = readKarcherProforma(lines(`Proforma Invoice
Kärcher d.o.o.
7570000002 05.11.2026
010 1.000-004.0 1.00 0.00 2,000.00 1,700.00
B 99 Test Scrubber
Net Amount
1,700.00`));
    assert.equal(o.items.length, 1);
    assert.deepEqual([o.items[0].qty, o.items[0].unitPrice, o.items[0].total, o.items[0].deliveryDate], [1, 2000, 1700, '']);
});
