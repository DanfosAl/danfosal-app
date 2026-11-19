// Checks for cash with the courier (www/app/courier.js), Instagram on the customer's page
// (igcustomers.js chatsForCustomer), the bot's report card and same time last year (iginsights.js).
// Run from resources/app: node --test tests/igmore.test.mjs
// Every name, number and product below is made up. This repository is public.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withCourier, shippedAt } from '../www/app/courier.js';
import { chatsForCustomer } from '../www/app/igcustomers.js';
import { botReportCard, changedFields, sameTimeLastYear } from '../www/app/iginsights.js';

const NOW = new Date(2026, 10, 19, 12).getTime();
const D = 86400000;

test('1. cash with the courier: shipped or delivered, not paid; oldest first; late after 7 days', () => {
    const o = (id, status, shippedDaysAgo, price) => ({ _id: id, status, price, timestamp: NOW - 20 * D,
        activityLog: shippedDaysAgo === null ? [] : [{ status, timestamp: NOW - shippedDaysAgo * D }, { status: 'Ordered', timestamp: NOW - 20 * D }] });
    const r = withCourier([o('a', 'Shipped', 2, 199), o('b', 'Delivered', 10, 259.5), o('c', 'Paid', 30, 99), o('d', 'Ordered', null, 50), o('e', 'Shipped', null, 10)], NOW);
    assert.deepEqual(r.list.map(x => [x.o._id, x.days]), [['e', 20], ['b', 10], ['a', 2]]);
    assert.equal(r.total, 468.5);
    assert.deepEqual([r.late, r.lateTotal], [2, 269.5]);
    assert.equal(shippedAt({ activityLog: [{ status: 'Shipped', timestamp: new Date(NOW - D) }] }), NOW - D, 'a Date in the log is read too');
});

test('5. their Instagram chats on the customer page', () => {
    const entry = { name: 'Test Customer', phoneDigits: '0690000001', orders: [{ instagramId: 'chat-b' }] };
    const raw = new Map([
        ['chat-a', { username: 'test.a', lastCustomerAt: NOW - D, messages: [{ role: 'user', text: 'jam une 069 000 0001', at: NOW - D }, { role: 'shop', text: 'ok', at: NOW - D }] }],
        ['chat-b', { username: 'test.b', lastCustomerAt: NOW - 5 * D, messages: [{ role: 'user', text: 'pershendetje', at: NOW - 5 * D }] }],
        ['chat-c', { username: 'test.c', messages: [{ role: 'user', text: 'tjeter 068 999 9999' }] }],
        ['chat-d', { ignored: true, messages: [{ role: 'user', text: '069 000 0001' }] }],
    ]);
    assert.deepEqual(chatsForCustomer(entry, raw).map(c => [c.id, c.username, c.wrote]), [['chat-a', 'test.a', 1], ['chat-b', 'test.b', 1]]);
    assert.deepEqual(chatsForCustomer(null, raw), []);
});

test('6. which fields the owner corrected', () => {
    const before = { clientName: 'Test A', telephone: '069 000 0001', address: 'Rruga 1, Durres', items: [{ id: 'p1', name: 'X', quantity: 1, price: 10 }] };
    assert.deepEqual(changedFields(before, { ...before }), []);
    assert.deepEqual(changedFields(before, { ...before, telephone: '0690000001' }), [], 'same number, other spacing');
    assert.deepEqual(changedFields(before, { ...before, clientName: 'Test B', address: 'Rruga 2, Fier' }), ['name', 'address']);
    assert.deepEqual(changedFields(before, { ...before, items: [{ id: 'p2', name: 'Y', quantity: 1, price: 10 }] }), ['products']);
    assert.deepEqual(changedFields(before, { ...before, items: [{ id: 'p1', name: 'X', quantity: 1, price: 9 }] }), ['price']);
});

test('6. the report card: kept, corrected, deleted, per week', () => {
    const ev = (id, daysAgo) => ({ event_name: 'order_created', t: NOW - daysAgo * D, params: { order_id: id } });
    const orders = [{ _id: 'ig-1' }, { _id: 'ig-2', ownerEdits: { fields: ['phone', 'address'] } }, { _id: 'ig-4' }, { _id: 'old-1' }];
    const r = botReportCard(orders, [ev('ig-1', 1), ev('ig-2', 1), ev('ig-3', 1), ev('ig-1', 1), ev('ig-4', 9), ev('old-1', 1), ev('ig-5', 100)], NOW);
    assert.equal(r.weeks.length, 2);
    const w = r.weeks[0];
    assert.deepEqual([w.written, w.kept, w.corrected, w.deleted, w.fields], [3, 1, 1, 1, { phone: 1, address: 1 }]);
    assert.deepEqual([r.written, r.kept, r.rate], [4, 2, 50]);
});

test('7. same time last year: what was asked more in the coming 30 days a year ago', () => {
    const products = [{ _id: 'sc3', name: 'Test SC 3' }, { _id: 'k4', name: 'Test K 4' }];
    const ask = (sender, daysAgo, id) => ({ sender, t: NOW - daysAgo * D, id, name: id });
    const asks = [
        ask('a', 360, 'sc3'), ask('b', 355, 'sc3'), ask('c', 350, 'sc3'), ask('d', 340, 'sc3'),       // 4 in the window a year ago
        ask('e', 200, 'sc3'), ask('f', 100, 'sc3'),                                                      // 6 in the whole year
        ask('g', 358, 'k4'), ask('h', 200, 'k4'), ask('i', 150, 'k4'), ask('j', 120, 'k4'), ask('k', 90, 'k4'), ask('l', 60, 'k4'), ask('m', 30, 'k4'), ask('n', 20, 'k4'),
        ask('z', 400, 'sc3'),                                                                             // before the year
    ];
    assert.deepEqual(sameTimeLastYear(asks, products, NOW).map(r => [r.name, r.lastYear, r.usual]), [['Test SC 3', 4, 0.5]]);
});
