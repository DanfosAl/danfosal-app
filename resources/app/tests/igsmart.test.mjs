// Checks for the bot-order checks (www/app/ordercheck.js), learned words, demand trend, post ideas
// and the bot's health (www/app/iginsights.js).
// Run from resources/app: node --test tests/igsmart.test.mjs
// Every name, number and product below is made up. This repository is public.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderChecks, agreedPrices, albanianMobile } from '../www/app/ordercheck.js';
import { aliasFromCorrection, aliasMap, allAsks, demandTrend, postIdeas, botHealth } from '../www/app/iginsights.js';
import { slimChat } from '../www/app/followups.js';

const NOW = new Date(2026, 10, 19, 12).getTime();
const D = 86400000;
const bot = extra => ({ _id: 'o1', source: 'Instagram Chatbot', status: 'Ordered', clientName: 'Test Person', telephone: '069 123 4567',
    address: 'Rruga Test 5, Durres', items: [{ name: 'Test SC 3', id: 'sc3', price: 199 }], timestamp: NOW, ...extra });
const t = o => o.timestamp;
const ks = o => orderChecks(o, [o], t).map(c => c.k);

test('a clean bot order has nothing to check', () => {
    assert.deepEqual(ks(bot()), []);
    assert.deepEqual(ks(bot({ address: 'Laprake, pallati 3' })), [], 'a Tirana area counts as a town');
    assert.deepEqual(ks(bot({ address: 'Rr. e Durrësit, Tiranë' })), [], 'accents are fine');
    assert.deepEqual(ks(bot({ telephone: '+355 68 123 4567' })), []);
});

test('what gets a Check label', () => {
    assert.deepEqual(ks(bot({ clientName: 'Arben' })), ['name']);
    assert.deepEqual(ks(bot({ address: 'Rruga e Re 4' })), ['town']);
    assert.deepEqual(ks(bot({ address: 'Lagjja Dardania, Prishtine' })), ['kosovo']);
    assert.deepEqual(ks(bot({ address: '' })), ['address']);
    assert.deepEqual(ks(bot({ telephone: '' })), ['phone']);
    assert.deepEqual(ks(bot({ telephone: '044 123 456' })), ['phone']);
    assert.deepEqual(ks(bot({ items: [{ name: 'FSHESE E VOGEL', price: 0 }] })), ['item']);
    assert.deepEqual(ks(bot({ items: [{ name: '00', price: 0 }] })), ['item']);
    const a = bot(), b = bot({ _id: 'o2', timestamp: NOW + 3600000 });
    assert.deepEqual(orderChecks(a, [a, b], t).map(c => c.k), ['twice']);
    assert.deepEqual(orderChecks(a, [a, bot({ _id: 'o3', timestamp: NOW - 2 * D })], t), [], 'another day is fine');
});

test('only open bot orders are checked', () => {
    assert.deepEqual(ks(bot({ source: 'Instagram', clientName: 'X' })), []);
    assert.deepEqual(ks(bot({ status: 'Shipped', clientName: 'X' })), []);
    assert.ok(albanianMobile('0691234567') && albanianMobile('355691234567') && !albanianMobile('0441234567'));
});

test('an agreed price that differs from the catalogue', () => {
    assert.deepEqual(agreedPrices({ items: [{ name: 'A', price: 190, catalogPrice: 199 }, { name: 'B', price: 50 }, { name: 'C', price: 9, catalogPrice: 9 }] }),
        [{ name: 'A', price: 190, catalogPrice: 199 }]);
});

test('a corrected bot order teaches a word - only when it is clear', () => {
    const before = [{ name: 'FSHESE E VOGEL', price: 0 }, { name: 'Test SC 3', id: 'sc3' }];
    assert.deepEqual(aliasFromCorrection(before, [{ name: 'Test WD 1', id: 'wd1' }, { name: 'Test SC 3', id: 'sc3' }]), { text: 'FSHESE E VOGEL', productId: 'wd1' });
    assert.equal(aliasFromCorrection(before, before), null, 'nothing changed');
    assert.equal(aliasFromCorrection([{ name: 'X' }, { name: 'Y' }], [{ name: 'A', id: 'a' }, { name: 'B', id: 'b' }]), null, 'two for two is a guess');
    assert.equal(aliasFromCorrection([{ name: '00' }], [{ name: 'A', id: 'a' }]), null, 'the 00 placeholder teaches nothing');
});

test('learned words count questions for the right product', () => {
    const products = [{ _id: 'wd1', name: 'Test WD 1', stock: 2 }];
    const aliases = aliasMap([{ text: 'fshese e vogel', productId: 'wd1' }, { text: 'rm 519', productId: 'wd1' }, { productId: 'x' }]);
    const asks = allAsks({ products, aliases,
        chats: [slimChat('c1', { askedProducts: [{ name: 'Fshese e vogel', id: null, stock: null, at: NOW - D }] })],
        events: [{ event_name: 'product_inquiry', t: NOW - 2 * D, params: { sender_id: 'c2', products: 'RM519' } }] });
    assert.deepEqual(asks.map(a => [a.sender, a.id]), [['c1', 'wd1'], ['c2', 'wd1']]);
});

test('8. demand rising: more people in 30 days than usual', () => {
    const products = [{ _id: 'k4', name: 'Test K 4', stock: 3 }, { _id: 'sc3', name: 'Test SC 3', stock: 2 }];
    const ask = (sender, days, id) => ({ sender, t: NOW - days * D, id, name: id });
    const asks = [ask('a', 5, 'k4'), ask('b', 10, 'k4'), ask('c', 20, 'k4'), ask('d', 60, 'k4'),          // 3 now, 1 in the 90 before
        ask('e', 5, 'sc3'), ask('f', 6, 'sc3'), ask('g', 7, 'sc3'), ask('h', 40, 'sc3'), ask('i', 50, 'sc3'), ask('j', 70, 'sc3'), ask('k', 80, 'sc3'), ask('l', 100, 'sc3')];
    const r = demandTrend(asks, products, NOW);
    assert.deepEqual(r.map(x => [x.name, x.recent, x.usual]), [['Test K 4', 3, 0.3]]);
});

test('9. post ideas, strongest first, no product twice', () => {
    const p = (id, extra) => ({ _id: id, name: 'Test ' + id, price: 100, stock: 2, ...extra });
    const ideas = postIdeas({
        backIn: [{ product: p('a'), people: [{}, {}] }],
        trend: [{ product: p('b'), recent: 4 }, { product: p('z', { stock: 0 }), recent: 5 }],
        asked: [{ product: p('a'), status: 'in', people: 3 }, { product: p('c'), status: 'in', people: 2 }, { product: null, status: 'none', people: 9 }],
        unsold: [{ product: p('d'), stock: 3, value: 300 }, { product: p('e'), stock: 1, value: 0 }]
    });
    assert.deepEqual(ideas.map(i => [i.product._id, i.kind]), [['a', 'back'], ['b', 'rising'], ['c', 'asked'], ['d', 'offer']]);
    assert.match(ideas[0].caption, /sërish në gjendje/);
});

test('7. the bot health warning', () => {
    assert.equal(botHealth(null, NOW), null);
    assert.equal(botHealth({ lastCustomerMessageAt: NOW - D, lastAiOkAt: NOW - D }, NOW), null);
    const credit = botHealth({ lastAiOkAt: NOW - 5 * D, lastAiError: { at: NOW - D, message: 'ResourceExhausted: 429 Your prepayment credits are depleted' } }, NOW);
    assert.equal(credit.sev, 'crit');
    assert.match(credit.why, /credit/);
    assert.match(credit.why, /Google AI Studio/, 'an old error without a provider was Gemini');
    const openaiCredit = botHealth({ lastAiOkAt: NOW - 5 * D, lastAiError: { at: NOW - D, provider: 'OpenAI', message: "OpenAI RateLimitError: Error code: 429 - insufficient_quota" } }, NOW);
    assert.match(openaiCredit.why, /OpenAI key .*platform\.openai\.com/);
    assert.doesNotMatch(openaiCredit.why, /Google/);
    const deadKey = botHealth({ lastAiOkAt: NOW - 5 * D, lastAiError: { at: NOW - D, provider: 'OpenAI', message: 'OpenAI AuthenticationError: Error code: 401 - invalid_api_key' } }, NOW);
    assert.match(deadKey.why, /OpenAI key doesn’t work any more.*OPENAI_API_KEY/);
    const deadGemini = botHealth({ lastAiOkAt: NOW - 5 * D, lastAiError: { at: NOW - D, message: 'Unauthenticated: 401 The bound service account is deleted or disabled.' } }, NOW);
    assert.match(deadGemini.why, /Gemini key .*GEMINI_API_KEY/);
    assert.equal(botHealth({ lastAiOkAt: NOW, lastAiError: { at: NOW - D, message: 'x' } }, NOW), null, 'a later good read clears it');
    assert.equal(botHealth({ lastCustomerMessageAt: NOW - 4 * D }, NOW).sev, 'warn');
});
