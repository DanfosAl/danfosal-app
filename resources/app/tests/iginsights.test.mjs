// Checks for the Instagram reports (www/app/iginsights.js).
// Run from resources/app: node --test tests/iginsights.test.mjs
// Every chat, account, product and number below is made up. This repository is public.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allAsks, backInStock, idleOffers, askedReport, askedCounts, sourcesReport, answerSpeed, modelOf, isShopAccount, matchAsked, matchQuestion, buildIndex, productKeys, aliasMap } from '../www/app/iginsights.js';
import { slimChat } from '../www/app/followups.js';

const NOW = new Date(2026, 10, 19, 12).getTime();
const H = 3600000, D = 24 * H, M = 60000;
const products = [
    { _id: 'sc3', name: 'Test SC 3 EasyFix', price: 199, stock: 4, lastRestockDate: NOW - 2 * D },
    { _id: 'k4', name: 'Test K 4 Power Control', price: 259, stock: 2 },
    { _id: 'rm5', name: 'Test RM 555 detergent', price: 12, stock: 0 },
    { _id: 'wd3', name: 'Test WD 3 vacuum', price: 99, stock: 3 },
];
const ev = (sender, text, t) => ({ event_name: 'product_inquiry', t, params: { sender_id: sender, products: text } });

test('model numbers and the shop account', () => {
    assert.equal(modelOf('Test SC 3 EasyFix'), 'SC 3');
    assert.equal(modelOf('rm519'), 'RM 519');
    assert.equal(modelOf('fshese me avull'), '');
    assert.ok(isShopAccount('17841400000000000'));
    assert.ok(!isShopAccount('1990000000000001'));
    assert.deepEqual(matchAsked('a e keni sc3?', buildIndex(products)).map(p => p._id), ['sc3']);
});

test('a variant letter glued to the size: "BD 35/15" finds BD 35/15C (20 Nov 2026)', () => {
    const cat = [{ _id: 'bd', name: 'BD 35/15C', stock: 6 }, { _id: 'ph', name: 'Pad per 35/15', stock: 5 }, { _id: 'rm', name: 'RM 553 5L uNIVERSAL', stock: 1 }];
    assert.deepEqual(matchAsked('BD 35/15', buildIndex(cat)).map(p => p._id), ['bd']);
    assert.deepEqual(matchAsked('bd 35/15c', buildIndex(cat)).map(p => p._id), ['bd']);
    assert.ok(productKeys(cat[0]).includes('bd3515c'), 'the whole name still matches');
    assert.ok(!productKeys(cat[2]).includes('rm5535'), 'a unit (5L) is not a variant letter');
});

test('a logged question uses the words the owner taught, then model numbers', () => {
    const cat = [...products, { _id: 'bd', name: 'BD 35/15C', stock: 6 }];
    const byId = new Map(cat.map(p => [p._id, p]));
    const taught = aliasMap([{ text: 'BD 35', productId: 'bd' }, { text: 'fshese e vogel', productId: 'wd3' }]);
    assert.deepEqual(matchQuestion('BD 35/20', buildIndex(cat), taught, byId).map(p => p._id), ['bd'], 'taught by its model');
    assert.deepEqual(matchQuestion('fshese e vogel, sc3', buildIndex(cat), taught, byId).map(p => p._id), ['wd3', 'sc3']);
    assert.deepEqual(matchQuestion('fshese e vogel', buildIndex(cat), new Map(), byId), [], 'nothing taught, nothing matched');
});

test('asks from the bot and the old log, private chats and the shop account left out, no double counting', () => {
    const chats = [
        slimChat('u1', { askedProducts: [{ name: 'Test SC 3 EasyFix', id: 'sc3', stock: 0, at: NOW - 10 * D }] }),
        slimChat('fam', { ignored: true }),
    ];
    const events = [
        ev('u1', 'Test SC 3 EasyFix', NOW - 10 * D + H),          // the bot's own log line for the same question
        ev('u2', 'sc3, rm 519', NOW - 5 * D),
        ev('fam', 'k4', NOW - 3 * D),
        ev('17841400000000000', 'k4', NOW - 3 * D),
    ];
    const asks = allAsks({ chats, events, products });
    assert.deepEqual(asks.map(a => [a.sender, a.id, a.name, a.stockThen, a.from]), [
        ['u2', 'sc3', 'Test SC 3 EasyFix', null, 'log'],
        ['u2', null, 'rm 519', null, 'log'],
        ['u1', 'sc3', 'Test SC 3 EasyFix', 0, 'bot'],
    ]);
});

test('1. back in stock: asked while out (or before a restock), in stock now, no order since', () => {
    const asks = [
        { sender: 'u1', t: NOW - 10 * D, id: 'sc3', name: 'x', stockThen: 0 },          // out then, in now
        { sender: 'u2', t: NOW - 5 * D, id: 'sc3', name: 'x', stockThen: null },        // restocked 2 days ago, after the ask
        { sender: 'u3', t: NOW - 1 * D, id: 'sc3', name: 'x', stockThen: null },        // asked after the restock: not "back"
        { sender: 'u4', t: NOW - 10 * D, id: 'rm5', name: 'x', stockThen: 0 },          // still out of stock
        { sender: 'u5', t: NOW - 10 * D, id: 'k4', name: 'x', stockThen: 0 },           // ordered since
        { sender: 'u6', t: NOW - 200 * D, id: 'sc3', name: 'x', stockThen: 0 },         // too long ago
    ];
    const chats = [slimChat('u5', { lastOrderAt: NOW - 2 * D, lastOrderId: 'o1' })];
    const r = backInStock(asks, products, chats, NOW);
    assert.deepEqual(r.map(g => [g.product._id, g.people.map(p => p.sender)]), [['sc3', ['u2', 'u1']]]);
});

test('2. idle stock offered to people who asked for that product or model', () => {
    const asks = [
        { sender: 'u1', t: NOW - 3 * D, id: 'wd3', name: 'Test WD 3 vacuum' },
        { sender: 'u2', t: NOW - 4 * D, id: null, name: 'wd 3 premium' },
        { sender: 'u3', t: NOW - 4 * D, id: 'k4', name: 'Test K 4 Power Control' },
        { sender: 'u4', t: NOW - 200 * D, id: 'wd3', name: 'Test WD 3 vacuum' },
    ];
    const unsold = [{ product: products[3], stock: 3, value: 180 }, { product: products[0], stock: 4, value: 500 }];
    const r = idleOffers(unsold, asks, [], NOW);
    assert.equal(r.length, 1);
    assert.deepEqual(r[0].people.map(p => [p.sender, p.exact]), [['u1', true], ['u2', false]]);
});

test('8. what people ask for: per product, with not-in-catalogue grouped by model', () => {
    const asks = [
        { sender: 'u1', t: NOW - D, id: 'rm5', name: 'Test RM 555 detergent' },
        { sender: 'u2', t: NOW - D, id: null, name: 'rm 519' },
        { sender: 'u3', t: NOW - 2 * D, id: null, name: 'RM519 5L' },
        { sender: 'u3', t: NOW - 3 * D, id: null, name: 'rm 519' },
        { sender: 'u4', t: NOW - D, id: 'sc3', name: 'Test SC 3 EasyFix' },
        { sender: 'u5', t: NOW - 200 * D, id: 'sc3', name: 'Test SC 3 EasyFix' },
    ];
    const r = askedReport(asks, products, NOW, { days: 90 });
    assert.deepEqual(r.map(x => [x.name, x.people, x.asks, x.status]), [
        ['RM 519', 2, 3, 'none'], ['Test RM 555 detergent', 1, 1, 'out'], ['Test SC 3 EasyFix', 1, 1, 'in'],
    ].sort((a, b) => b[1] - a[1]));
    const counts = askedCounts(asks, NOW);
    assert.equal(counts.get('sc3').questions_6m, 1);
    assert.equal(counts.get('rm5').questions_6m, 1);
});

test('10. where chats come from, with orders', () => {
    const chats = [
        slimChat('a', { firstSource: { kind: 'ad', key: 'ad:1', title: 'Test offer', at: NOW - D }, lastOrderId: 'o1' }),
        slimChat('b', { firstSource: { kind: 'ad', key: 'ad:1', title: 'Test offer', at: NOW - 2 * D } }),
        slimChat('c', { lastCustomerAt: NOW - D }),
        slimChat('d', { firstSource: { kind: 'story', key: 'story:9', at: NOW - D }, ignored: true }),
        slimChat('e', { firstSource: { kind: 'post', key: 'post:old', at: NOW - 200 * D } }),
    ];
    const r = sourcesReport(chats, NOW, { days: 90 });
    assert.deepEqual(r.map(x => [x.key, x.chats, x.orders]), [['ad:1', 2, 1], ['direct', 1, 0]]);
});

test('11. answer speed against orders', () => {
    const talks = [
        { lastOrderAt: NOW - 5 * D + 2 * H, messages: [{ at: NOW - 5 * D, role: 'user' }, { at: NOW - 5 * D + 10 * M, role: 'shop' }] },
        { lastOrderAt: 0, messages: [{ at: NOW - 4 * D, role: 'user' }, { at: NOW - 4 * D + 3 * H, role: 'shop' },
            { at: NOW - 4 * D + 3 * H + 5 * M, role: 'user' },                                  // same conversation, not a new question
            { at: NOW - 2 * D, role: 'user' }] },                                            // a new question, never answered
        { lastOrderAt: 0, messages: [{ at: NOW - 2 * H, role: 'user' }] },                    // still open: too early
    ];
    const r = answerSpeed(talks, NOW);
    const by = Object.fromEntries(r.rows.map(x => [x.label, [x.questions, x.orders]]));
    assert.deepEqual(by['within 15 minutes'], [1, 1]);
    assert.deepEqual(by['1 to 4 hours'], [1, 0]);
    assert.deepEqual(by['not answered'], [1, 0]);
    assert.equal(r.questions, 3);
    assert.equal(Math.round(r.median), 180);
});

test('slimChat keeps asked products and the source, not the messages', () => {
    const c = slimChat('x', { messages: [{ text: 'private words' }], askedProducts: [{ name: 'Test SC 3', id: 'sc3', stock: 0, at: 5 }, { id: 'no-name' }],
        firstSource: { kind: 'ad', key: 'ad:1', title: 'Test', url: 'https://example.test/p.jpg', at: 3 } });
    assert.deepEqual(c.askedProducts, [{ name: 'Test SC 3', id: 'sc3', stock: 0, at: 5 }]);
    assert.equal(c.firstSource.key, 'ad:1');
    assert.equal(JSON.stringify(c).includes('private words'), false);
    assert.equal(slimChat('y', { askedProducts: [{ name: 'A', stock: null, at: 1 }] }).askedProducts[0].stock, null);
});
