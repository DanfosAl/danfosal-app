// Checks for "bought before" and the chat behind a bot order (www/app/igcustomers.js), and the
// reason on Done (www/app/followups.js).
// Run from resources/app: node --test tests/igcustomers.test.mjs
// Every name, number and product below is made up. This repository is public.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatPhones, findCustomer, customerSummary, orderChat, withPhones, phoneKey } from '../www/app/igcustomers.js';
import { slimChat, doneFields, doneReasons, REASONS } from '../www/app/followups.js';

const NOW = new Date(2026, 10, 19, 12).getTime();
const D = 86400000;
const dir = [
    { name: 'Test Customer One', phoneDigits: '0690000001', count: 2, last: NOW - 200 * D, revenue: 458.4,
      sales: [{ items: [{ name: 'Test K 4' }], t: NOW - 400 * D }, { items: [{ name: 'Test RM 610' }], t: NOW - 200 * D }], orders: [],
      warranties: [{ items: [{ name: 'Test K 4' }], warrantyUntil: { toMillis: () => NOW + 30 * D } }, { items: [{ name: 'Old' }], warrantyUntil: NOW - D }] },
    { name: 'Test Customer Two', phoneDigits: '', count: 1, last: NOW - 10 * D, revenue: 199, sales: [],
      orders: [{ instagramId: 'ig-chat-2', telephone: '068 111 2222', items: [{ name: 'Test SC 3' }], t: NOW - 10 * D }], warranties: [] },
    { name: 'Test Arben Hoxha', phoneDigits: '', count: 1, last: NOW - 50 * D, revenue: 99, sales: [{ items: [{ name: 'Test WD 3' }], t: NOW - 50 * D }], orders: [], warranties: [] },
];
const timeOf = x => x.t;

test('phone numbers the customer typed (not the shop) and the one on the bot order', () => {
    const p = chatPhones({ messages: [{ role: 'user', text: 'numri 069 000 0001' }, { role: 'shop', text: 'na telefononi 069 999 9999' }], previousOrder: { telephone: '+355 68 111 2222' } });
    assert.deepEqual([...p].sort(), [phoneKey('0681112222'), phoneKey('0690000001')].sort());
    assert.equal(chatPhones({}).size, 0);
});

test('found by phone, by a bot order from the same chat, or by the bot order name', () => {
    assert.equal(findCustomer('x', { messages: [{ role: 'user', text: 'jam une, +355 69 000 0001' }] }, dir).name, 'Test Customer One');
    assert.equal(findCustomer('x', { messages: [{ role: 'user', text: '0681112222' }] }, dir).name, 'Test Customer Two', 'phone on an order');
    assert.equal(findCustomer('ig-chat-2', {}, dir).name, 'Test Customer Two');
    assert.equal(findCustomer('y', { previousOrder: { clientName: 'test arben hoxhá' } }, dir).name, 'Test Arben Hoxha');
    assert.equal(findCustomer('z', { messages: [{ role: 'user', text: 'pershendetje' }] }, dir), null);
    assert.equal(findCustomer('z', { previousOrder: { clientName: 'Ana' } }, dir), null, 'short names are not enough');
});

test('what to say about them: purchases, the last thing bought, warranties still running', () => {
    const k = customerSummary(dir[0], NOW, timeOf);
    assert.deepEqual(k, { name: 'Test Customer One', purchases: 2, last: NOW - 200 * D, spent: 458, lastItems: ['Test RM 610'],
        warranties: [{ until: NOW + 30 * D, items: ['Test K 4'] }] });
    assert.equal(customerSummary({ count: 0 }, NOW), null);
});

test('the chat behind a bot order: up to half an hour after it, newest 25, oldest first', () => {
    const msgs = Array.from({ length: 30 }, (_, i) => ({ at: NOW - (30 - i) * 60000, role: i % 2 ? 'shop' : 'user', text: 'm' + i }));
    msgs.push({ at: NOW + 20 * 60000, role: 'shop', text: 'po ju nisim' }, { at: NOW + 2 * 3600000, role: 'user', text: 'later' }, { at: NOW, role: 'user' });
    const lines = orderChat(msgs, NOW);
    assert.equal(lines.length, 25);
    assert.equal(lines[lines.length - 1].text, 'po ju nisim');
    assert.ok(lines.every((m, i) => !i || lines[i - 1].at <= m.at));
});

test('phone numbers marked inside a message', () => {
    assert.deepEqual(withPhones('Besa, 067 444 5555, Vlore'), [{ text: 'Besa, ', phone: false }, { text: '067 444 5555', phone: true }, { text: ', Vlore', phone: false }]);
    assert.deepEqual(withPhones('pa numer'), [{ text: 'pa numer', phone: false }]);
});

test('Done with a reason, and how follow-ups ended', () => {
    assert.deepEqual(doneFields('price', NOW), { followUpDoneAt: NOW, followUpReason: 'price' });
    assert.equal(doneFields('nonsense', NOW).followUpReason, 'other');
    const chats = [
        slimChat('a', { followUpLog: [{ at: NOW - D, reason: 'price' }, { at: NOW - 2 * D, reason: 'noreply' }] }),
        slimChat('b', { followUpLog: [{ at: NOW - 3 * D, reason: 'price' }, { at: NOW - 200 * D, reason: 'sold' }, { at: NOW, reason: 'bogus' }] }),
    ];
    assert.deepEqual(doneReasons(chats, NOW, 90), [{ reason: 'price', label: REASONS.price, n: 2 }, { reason: 'noreply', label: REASONS.noreply, n: 1 }]);
});
