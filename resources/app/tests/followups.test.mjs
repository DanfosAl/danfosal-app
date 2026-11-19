// Checks for Sell › Instagram's follow-up lists (www/app/followups.js).
// Run from resources/app: node --test tests/followups.test.mjs
// Every chat, username and product below is made up. This repository is public.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slimChat, followUps, who, chatLink, privateChats, privateFields, publicFields } from '../www/app/followups.js';

const NOW = new Date(2026, 10, 19, 12).getTime();          // 19 Nov 2026, noon
const H = 3600000, D = 24 * H;
const chat = (id, d) => slimChat(id, { card: { stage: 'asking', summary: 'Asked a price.', nextStep: 'Answer', products: [{ name: 'Test SC', id: 'p1' }] }, ...d });

test('slimChat keeps what the lists need and leaves the message texts behind', () => {
    const c = slimChat('123', { messages: [{ text: 'private words' }], username: 'test.user', lastCustomerAt: 5, card: { stage: 'asking', products: [{ name: 'Test SC', id: 'p1' }, null, { id: 'x' }] } });
    assert.equal(JSON.stringify(c).includes('private words'), false);
    assert.equal(c.username, 'test.user');
    assert.deepEqual(c.card.products, [{ name: 'Test SC', id: 'p1' }]);
    assert.equal(slimChat('9').card.stage, '');
});

test('a customer who wrote last is waiting; longest waiting first', () => {
    const { waiting, quiet } = followUps([
        chat('a', { lastCustomerAt: NOW - 2 * H, lastShopAt: NOW - 3 * H }),
        chat('b', { lastCustomerAt: NOW - 5 * H }),
        chat('c', { lastCustomerAt: NOW - 8 * D }),                       // too old
    ], NOW);
    assert.deepEqual(waiting.map(c => c._id), ['b', 'a']);
    assert.equal(quiet.length, 0);
});

test('"thanks" with nothing to do is not waiting', () => {
    const { waiting } = followUps([slimChat('t', { lastCustomerAt: NOW - H, lastShopAt: NOW - 2 * H, card: { stage: 'other', nextStep: '' } })], NOW);
    assert.equal(waiting.length, 0);
});

test('went quiet after the shop answered a product question: 1 to 14 days', () => {
    const { quiet } = followUps([
        chat('q1', { lastCustomerAt: NOW - 3 * D - H, lastShopAt: NOW - 3 * D }),
        chat('q2', { lastCustomerAt: NOW - 6 * H - H, lastShopAt: NOW - 6 * H }),     // answered today: too soon
        chat('q3', { lastCustomerAt: NOW - 20 * D, lastShopAt: NOW - 20 * D + H }),   // too long ago
        slimChat('q4', { lastCustomerAt: NOW - 3 * D - H, lastShopAt: NOW - 3 * D, card: { stage: 'asking', products: [] } }), // no product
        slimChat('q5', { lastCustomerAt: NOW - 3 * D - H, lastShopAt: NOW - 3 * D, card: { stage: 'after-sale', products: [{ name: 'Test SC' }] } }),
    ], NOW);
    assert.deepEqual(quiet.map(c => c._id), ['q1']);
});

test('an order since, Done, or a private chat take it off the lists', () => {
    const base = { lastCustomerAt: NOW - 3 * D - H, lastShopAt: NOW - 3 * D };
    const { waiting, quiet } = followUps([
        chat('o', { ...base, lastOrderAt: NOW - 3 * D - H }),
        chat('d', { ...base, followUpDoneAt: NOW - D }),
        chat('p', { ...base, ignored: true }),
        chat('w', { lastCustomerAt: NOW - H, ignored: true }),
    ], NOW);
    assert.deepEqual([waiting.length, quiet.length], [0, 0]);
});

test('Done comes undone when someone writes after it', () => {
    const { waiting } = followUps([chat('x', { lastCustomerAt: NOW - H, lastShopAt: NOW - 2 * D, followUpDoneAt: NOW - D })], NOW);
    assert.deepEqual(waiting.map(c => c._id), ['x']);
});

test('who and the chat link', () => {
    assert.equal(who(slimChat('12345678', { username: 'test.user' })), '@test.user');
    assert.equal(who(slimChat('12345678')), 'visitor 45678');
    assert.equal(chatLink(slimChat('1', { username: 'test.user' })), 'https://ig.me/m/test.user');
    assert.equal(chatLink(slimChat('1')), 'https://www.instagram.com/direct/inbox/');
});

test('Private from the app: what is written, and the list of private chats', () => {
    const p = privateFields(NOW);
    assert.deepEqual(p, { ignored: true, ignoredBy: 'owner', ignoredAt: NOW, messages: [], card: null });
    assert.deepEqual(publicFields(), { ignored: false, ignoredBy: 'owner', ignoredAt: null });
    const chats = [
        slimChat('a', { username: 'test.a', ...p }),
        slimChat('b', { ignored: true, ignoredBy: 'ai', ignoredAt: NOW - D }),
        slimChat('c', { lastCustomerAt: NOW - H }),
        slimChat('d', { ignored: false, ignoredBy: 'owner' }),
    ];
    assert.deepEqual(privateChats(chats).map(c => [c._id, c.ignoredBy]), [['a', 'owner'], ['b', 'ai']]);
    assert.equal(slimChat('d', { ignored: false, ignoredBy: 'owner' }).ignoredBy, '', 'not private: no "by"');
    // A private chat is neither waiting nor to follow up, even with a fresh message on it.
    assert.deepEqual(followUps([slimChat('x', { ...p, lastCustomerAt: NOW - H })], NOW).waiting, []);
});
