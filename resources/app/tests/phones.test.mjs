// Checks for phone-number suggestions (www/app/igcustomers.js phoneSuggestions).
// Run from resources/app: node --test tests/phones.test.mjs
// Every name and number below is made up. This repository is public.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phoneSuggestions, suggestionKey } from '../www/app/igcustomers.js';

const NOW = new Date(2026, 10, 19, 12).getTime();
const e = (name, phoneDigits = '') => ({ name, phoneDigits, count: 1 });
const dir = [e('Test Arben Hoxha'), e('Test Besa Kola'), e('Test Has Phone', '0691112222'), e('Ana'), e('Test Gent Dushku'), e('Test Dritan Vata')];

test('a name typed next to a phone number in a chat', () => {
    const raw = new Map([
        ['c1', { username: 'test.arben', messages: [{ role: 'user', at: NOW - 5, text: 'Test Arben Hoxha, Durres, 069 123 4567' }] }],
        ['c2', { username: 'test.besa', messages: [{ role: 'user', at: NOW - 9, text: 'numri: 0681112233' }, { role: 'user', at: NOW - 8, text: 'emri Test Besa Kola' }] }],
        ['c3', { messages: [{ role: 'user', at: NOW, text: 'Test Has Phone 0699999999' }, { role: 'user', at: NOW, text: 'Ana 0697777777' }] }],
        ['c4', { messages: [{ role: 'user', at: NOW, text: 'Test Gent Dushku' }, { role: 'user', at: NOW, text: '0690000001' }, { role: 'user', at: NOW, text: 'ose 0690000002' }] }],
        ['c5', { messages: [{ role: 'shop', at: NOW, text: 'Test Dritan Vata 0695555555' }] }],
        ['c6', { ignored: true, messages: [{ role: 'user', at: NOW, text: 'Test Dritan Vata 0695555555' }] }],
    ]);
    const s = phoneSuggestions(dir, raw);
    assert.deepEqual(s.map(x => [x.entry.name, x.phone, x.username]), [['Test Arben Hoxha', '069 123 4567', 'test.arben'], ['Test Besa Kola', '068 111 2233', 'test.besa']]);
});

test('the bot order of a chat, and suggestions from the older inbox', () => {
    const raw = new Map([['c1', { username: 'u', lastOrderAt: NOW, previousOrder: { clientName: 'test dritan vata', telephone: '+355 69 444 5555' } }]]);
    const stored = [{ _id: 's1', name: 'TEST GENT DUSHKU', phone: '0682223333', username: 'test.gent', at: NOW - 400 * 86400000, snippet: 'Test Gent Dushku 0682223333' }];
    const s = phoneSuggestions(dir, raw, { stored });
    assert.deepEqual(s.map(x => [x.entry.name, x.phone, x.from]), [['Test Dritan Vata', '069 444 5555', 'instagram'], ['Test Gent Dushku', '068 222 3333', 'inbox']]);
});

test('"Not them" is never suggested again; one-word names and customers with a phone never are', () => {
    const raw = new Map([['c1', { messages: [{ role: 'user', at: NOW, text: 'Test Arben Hoxha 0691234567' }] }]]);
    const notThem = new Set([suggestionKey('Test Arben Hoxha', '069 123 4567')]);
    assert.deepEqual(phoneSuggestions(dir, raw, { notThem }), []);
    assert.equal(suggestionKey('Test Arben Hoxha', '+355691234567'), suggestionKey('test arben hoxha', '069 123 4567'));
});
