// Checks for Stock › Next order (www/app/proposal.js) and Kärcher's delivery dates (purchasing.js).
// Run from resources/app: node --test tests/next-order.test.mjs
// Every product, order and number below is made up. This repository is public.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess, proposeOrder, materialNo, supplierPrices, customsShare, planExpected, waitingByProductId, portalText } from '../www/app/proposal.js';
import { deliveryDates, arrivalOf, arrivingSoon } from '../www/app/purchasing.js';

const NOW = new Date(2026, 10, 18, 12).getTime();          // 18 Nov 2026
const DAY = 86400000;
const P = (id, extra = {}) => ({ _id: id, name: `Test ${id}`, code: '', producer: 'Karcher', stock: 0, ...extra });
const base = { now: NOW, windowDays: 90, restockDays: 42, minUnits: 2 };

test('material numbers are put in the portal’s shape, or left out', () => {
    assert.equal(materialNo('1.628-104.0'), '1.628-104.0');
    assert.equal(materialNo('16281040'), '1.628-104.0');
    assert.equal(materialNo(' 1.628-104.0 '), '1.628-104.0');
    assert.equal(materialNo('2.642-889'), '');
    assert.equal(materialNo('HF099.01'), '');
});

test('a product that sells and won’t last the restock is proposed, enough for the restock and a month', () => {
    // 9 sold in 90 days = 0.1 a day; 2 on the shelf last 20 days < 42.
    const r = assess(P('a', { stock: 2, code: '1.000-001.0' }), { ...base, soldUnits: { a: 9 }, soldUnits12: { a: 20 } });
    assert.equal(r.reasons[0].k, 'short');
    assert.equal(Math.round(r.lasts), 20);
    assert.equal(r.suggested, Math.ceil(0.1 * 72 - 2));           // 6
    assert.equal(r.material, '1.000-001.0');
});

test('what is already on the order list counts: no proposal when it covers the restock', () => {
    const f = { ...base, soldUnits: { a: 9 }, soldUnits12: { a: 20 }, waiting: new Map([['a', 6]]) };
    const r = assess(P('a', { stock: 2 }), f);
    assert.equal(r.reasons.length, 0);
    assert.equal(proposeOrder([P('a', { stock: 2 })], 'Karcher', f).length, 0);
});

test('out of stock: proposed when it sold twice in 12 months, or people keep asking for it', () => {
    const sold = assess(P('b'), { ...base, soldUnits12: { b: 3 } });
    assert.deepEqual(sold.reasons.map(x => x.k), ['out']);
    assert.ok(sold.suggested >= 1);
    const asked = assess(P('c'), { ...base, asked: new Map([['c', { questions: 9, questions_6m: 4 }]]) });
    assert.deepEqual(asked.reasons.map(x => x.k), ['asked']);
    assert.equal(asked.suggested, 1);
    const old = assess(P('d'), { ...base, asked: new Map([['d', { questions: 9, questions_6m: 1 }]]) });
    assert.equal(old.reasons.length, 0, 'questions from long ago are not demand now');
});

test('a product sitting unsold is flagged, and never proposed on its own', () => {
    const r = assess(P('e', { stock: 5 }), { ...base, lastSoldAt: { e: NOW - 400 * DAY } });
    assert.ok(r.slow);
    assert.equal(r.slow.stock, 5);
    assert.equal(proposeOrder([P('e', { stock: 5 })], 'Karcher', { ...base, lastSoldAt: { e: NOW - 400 * DAY } }).length, 0);
    const added = assess(P('e', { stock: 5 }), { ...base }, { extra: true });
    assert.equal(added.suggested, 1);
    assert.ok(added.slow, 'added by hand: still flagged as sitting');
});

test('the yearly plan, at the real pace, can ask for more than recent sales', () => {
    // Plan: 30 a month in Nov, Dec and next Jan; selling at half the plan's pace.
    const demand = Array(12).fill(0); demand[10] = 30; demand[11] = 30;
    const next = Array(12).fill(0); next[0] = 30;
    const demandByYear = new Map([[2026, new Map([['f', demand]])], [2027, new Map([['f', next]])]]);
    const e = planExpected('f', { demandByYear, pace: 0.5, now: NOW, days: 42 });
    // 13 days of Nov (13/30 x 30) + 29 days of Dec (29/31 x 30) = 13 + 28.06, at half pace.
    assert.ok(Math.abs(e - (13 + 30 * 29 / 31) / 2) < 0.01);
    const r = assess(P('f', { stock: 4 }), { ...base, demandByYear, paceOf: () => 0.5 });
    assert.ok(r.reasons.some(x => x.k === 'plan'));
    assert.ok(r.planNeed > 10);
    assert.equal(planExpected('zz', { demandByYear, now: NOW, days: 42 }), null, 'not in any plan');
});

test('only the chosen supplier, out of stock first', () => {
    const products = [P('a', { stock: 3 }), P('b'), P('s', { producer: 'Star' })];
    const f = { ...base, soldUnits: { a: 9, s: 9 }, soldUnits12: { a: 20, b: 4, s: 20 } };
    assert.deepEqual(proposeOrder(products, 'Kärcher', f).map(r => r.id), ['b', 'a']);
    assert.deepEqual(proposeOrder(products, 'Star', f).map(r => r.id), ['s']);
});

test('Kärcher’s latest price per material, not free lines', () => {
    const docs = [
        { kind: 'invoice', supplier: 'Karcher d.o.o.', date: '2026-01-10', items: [{ code: '1.000-001.0', unitCost: 100, qty: 1, total: 100 }] },
        { kind: 'order', source: 'confirmation', supplier: 'Karcher', date: '2026-11-02', items: [{ code: '1.000-001.0', unitCost: 110, qty: 2, total: 220 }] },
        { kind: 'invoice', supplier: 'Karcher', date: '2026-11-10', items: [{ code: '1.000-001.0', unitCost: 0, qty: 1, total: 0, free: true }] },
        { kind: 'order', source: 'warranty', supplier: 'Karcher', date: '2026-11-11', items: [{ code: '1.000-001.0', unitCost: 5, qty: 1, total: 5 }] }
    ];
    assert.deepEqual(supplierPrices(docs).get('10000010'), { unit: 110, date: '2026-11-02', from: 'order' });
});

test('customs adds duty, fees and import VAT as a share of what was invoiced', () => {
    const links = [{ matched: true, invoiced: 1000, dutyEUR: 20, feesEUR: 10, vatEUR: 206, decl: { date: '2026-10-01' } },
        { matched: false, decl: { date: '2026-10-02' } }, { matched: true, invoiced: 500, dutyEUR: 50, feesEUR: 0, vatEUR: 100, decl: { date: '2024-01-01' } }];
    const c = customsShare(links, NOW);
    assert.equal(c.declarations, 1);
    assert.ok(Math.abs(c.dutyFees - 0.03) < 1e-9 && Math.abs(c.vat - 0.206) < 1e-9);
    assert.equal(customsShare([], NOW), null);
});

test('waiting units are found by product id, material number or name', () => {
    const products = [P('a', { code: '1.000-001.0' }), P('b'), P('c')];
    const w = waitingByProductId(products, [
        { productId: 'a', quantity: 4, quantityReceived: 1 }, { code: '1.000-001.0', quantity: 2 },
        { name: 'Test b', quantity: 5 }, { name: 'Test c', quantity: 2, quantityReceived: 2 }]);
    assert.equal(w.get('a'), 5);
    assert.equal(w.get('b'), 5);
    assert.equal(w.has('c'), false);
});

test('the portal list: material number, a tab, the quantity', () => {
    assert.equal(portalText([{ material: '1.000-001.0', qty: 6 }, { material: '', qty: 2 }, { material: '6.000-002.0', qty: 33 }]), '1.000-001.0\t6\n6.000-002.0\t33');
});

const confirmations = [
    { kind: 'order', source: 'confirmation', orderNo: '7570000001', date: '2026-11-02', syncedAt: '2026-11-03', items: [
        { code: '1.000-001.0', qty: 5, confirmed: 5, deliveryDate: '2026-11-09' },
        { code: '6.000-002.0', qty: 10, confirmed: 0, deliveryDate: '' }] },
    // The portal's summary of the same order: no dates, so it changes nothing.
    { kind: 'order', source: 'confirmation', orderNo: '7570000001', date: '2026-11-02', syncedAt: '2026-11-04', items: [{ code: '1.000-001.0', qty: 5 }] },
    // Kärcher confirmed again: the second line now has a date.
    { kind: 'order', source: 'confirmation', orderNo: '7570000001', date: '2026-11-02', syncedAt: '2026-11-05', items: [
        { code: '1.000-001.0', qty: 5, confirmed: 5, deliveryDate: '2026-11-09' },
        { code: '6.000-002.0', qty: 10, confirmed: 10, deliveryDate: '2026-11-20' }] }
];

test('delivery dates: the newest confirmation of an order wins; summaries without dates are skipped', () => {
    const d = deliveryDates(confirmations);
    assert.deepEqual(arrivalOf(d, { orderNo: '7570000001', code: '6.000-002.0' }), { status: 'confirmed', date: '2026-11-20', confirmed: 10, ordered: 10 });
    assert.equal(arrivalOf(d, { orderNo: '7579999999', code: '6.000-002.0' }), null);
    assert.equal(arrivalOf(d, { code: '6.000-002.0' }), null);
    const first = deliveryDates(confirmations.slice(0, 2));
    assert.deepEqual(arrivalOf(first, { orderNo: '7570000001', code: '6.000-002.0' }), { status: 'unconfirmed', ordered: 10 });
});

test('Today: lines due this week, and the ones overdue', () => {
    const d = deliveryDates(confirmations);
    const lines = [
        { name: 'Machine', orderNo: '7570000001', code: '1.000-001.0', quantity: 5, quantityReceived: 0 },
        { name: 'Detergent', orderNo: '7570000001', code: '6.000-002.0', quantity: 10, quantityReceived: 4 },
        { name: 'Received', orderNo: '7570000001', code: '1.000-001.0', quantity: 1, quantityReceived: 1 }];
    const soon = arrivingSoon(lines, d, NOW);
    assert.deepEqual(soon.map(x => [x.name, x.qty, x.date, x.late]), [['Machine', 5, '2026-11-09', true], ['Detergent', 6, '2026-11-20', false]]);
});
