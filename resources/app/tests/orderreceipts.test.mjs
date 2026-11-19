// Checks for pairing an online order with its easyPOS receipt (www/app/orderreceipts.js).
// Run from resources/app: node --test tests/orderreceipts.test.mjs
// Every name, number and product below is made up. This repository is public.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairOrdersWithReceipts, matchKind, linkUpdates } from '../www/app/orderreceipts.js';

const NOW = new Date(2026, 10, 19, 12).getTime();
const H = 3600000, D = 24 * H;
const orderTime = o => o.timestamp, saleTime = s => s.timestamp;
const opt = { orderTime, saleTime };
const order = (id, extra = {}) => ({ _id: id, clientName: 'Test Arben Hoxha', telephone: '069 123 4567', status: 'Ordered', timestamp: NOW,
    items: [{ id: 'sc3', name: 'Test SC 3 EasyFix', quantity: 1, price: 199 }], price: 199, ...extra });
const receipt = (id, extra = {}) => ({ _id: id, clientName: 'Klient privat', total: 199, timestamp: NOW + 2 * H,
    items: [{ productId: 'sc3', name: 'TEST SC 3 EASYFIX', quantity: 1 }], ...extra });

test('strong: the receipt is in the customer name, same products and money', () => {
    assert.equal(matchKind(order('o'), receipt('r', { clientName: 'Test Arben Hoxha', timestamp: NOW + 5 * D }), opt), 'strong');
    assert.equal(matchKind(order('o', { status: 'Paid' }), receipt('r', { clientName: 'test arben hoxhá' }), opt), 'strong', 'even after it was paid');
    assert.equal(matchKind(order('o'), receipt('r', { customerPhone: '+355 69 123 4567' }), opt), 'strong', 'or the phone');
});

test('exact: an open order, a walk-in receipt right after it with the very same products and money', () => {
    assert.equal(matchKind(order('o'), receipt('r'), opt), 'exact');
    assert.equal(matchKind(order('o', { status: 'Shipped' }), receipt('r'), opt), 'maybe', 'already shipped: only a suggestion');
    assert.equal(matchKind(order('o'), receipt('r', { total: 205 }), opt), null, 'different money');
    assert.equal(matchKind(order('o'), receipt('r', { items: [{ productId: 'sc3', quantity: 1 }, { productId: 'rm', quantity: 1 }], total: 199 }), opt), null, 'something else on the receipt');
    assert.equal(matchKind(order('o'), receipt('r', { timestamp: NOW - 2 * D }), opt), null, 'before the order');
    assert.equal(matchKind(order('o'), receipt('r', { clientName: 'Test Someone Else' }), opt), null, 'someone else’s receipt');
    assert.equal(matchKind(order('o', { status: 'Cancelled' }), receipt('r'), opt), null);
});

test('automatic pairs only when nothing else could be meant', () => {
    const one = pairOrdersWithReceipts([order('o1')], [receipt('r1')], opt);
    assert.deepEqual([...one.pairs], [['o1', { saleId: 'r1', how: 'exact' }]]);
    const two = pairOrdersWithReceipts([order('o1'), order('o2', { clientName: 'Test Other Person', telephone: '' })], [receipt('r1')], opt);
    assert.equal(two.pairs.size, 0, 'two open orders could be this receipt');
    assert.equal(two.suggestions.length, 2);
    const strong = pairOrdersWithReceipts([order('o1'), order('o2', { clientName: 'Test Other Person', telephone: '' })], [receipt('r1', { clientName: 'Test Arben Hoxha' })], opt);
    assert.deepEqual([...strong.pairs], [['o1', { saleId: 'r1', how: 'strong' }]]);
});

test('links already written are kept; "Not the same" is respected', () => {
    const r = pairOrdersWithReceipts([order('o1', { receiptSaleId: 'r9' })], [receipt('r9', { total: 1 }), receipt('r1')], opt);
    assert.deepEqual([...r.pairs], [['o1', { saleId: 'r9', how: 'linked' }]]);
    const r2 = pairOrdersWithReceipts([order('o1')], [receipt('r1', { onlineOrderId: 'o1' })], opt);
    assert.deepEqual([...r2.pairs], [['o1', { saleId: 'r1', how: 'linked' }]]);
    const r3 = pairOrdersWithReceipts([order('o1')], [receipt('r1')], { ...opt, notSame: new Set(['o1|r1']) });
    assert.equal(r3.pairs.size, 0);
});

test('linking moves an open order to Processing and gives back stock taken twice', () => {
    const u = linkUpdates(order('o1', { stockDeducted: true, activityLog: [{ status: 'Ordered', timestamp: new Date(NOW) }] }), receipt('r1'), NOW + 3 * H);
    assert.equal(u.order.status, 'Processing');
    assert.equal(u.order.receiptSaleId, 'r1');
    assert.equal(u.order.activityLog[0].note, 'easyPOS receipt printed');
    assert.equal(u.order.activityLog.length, 2);
    assert.deepEqual(u.stockBack, [{ productId: 'sc3', qty: 1 }]);
    assert.equal(u.order.stockDeducted, false);
    assert.deepEqual(u.sale, { onlineOrderId: 'o1' });
    const shipped = linkUpdates(order('o2', { status: 'Shipped' }), receipt('r2'), NOW);
    assert.equal(shipped.order.status, undefined, 'a shipped order keeps its status');
    assert.deepEqual(shipped.stockBack, [], 'it never took stock');
    const unlinkedLine = linkUpdates(order('o3', { stockDeducted: true }), receipt('r3', { items: [{ name: 'SC 3', quantity: 1 }] }), NOW);
    assert.deepEqual(unlinkedLine.stockBack, [], 'the receipt line has no product: the till took no stock, nothing to give back');
});

test('unclear pairs are only suggested for orders of the last 30 days', () => {
    const old = order('o-old', { status: 'Shipped', timestamp: NOW - 60 * D });
    const r = receipt('r-old', { timestamp: NOW - 60 * D + 2 * H });
    assert.equal(pairOrdersWithReceipts([old], [r], { ...opt, now: NOW }).suggestions.length, 0);
    const fresh = order('o-new', { status: 'Shipped', timestamp: NOW - 5 * D });
    const r2 = receipt('r-new', { timestamp: NOW - 5 * D + 2 * H });
    assert.equal(pairOrdersWithReceipts([fresh], [r2], { ...opt, now: NOW }).suggestions.length, 1);
});
