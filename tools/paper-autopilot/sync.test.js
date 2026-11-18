// Checks for how a filed Kärcher order meets the lines already on the order list.
// Run from tools/paper-autopilot: node --test sync.test.js. Everything below is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plannedLineFor } from './sync.js';

const planned = [
    { name: 'Test machine', productId: 'p1', code: '' },
    { name: 'Test detergent 1L', code: '6.000-002.0' },
    { name: 'Test hose', productId: 'p3' }
];

test('an ordered item finds the line planned for it: by material number, product, or name', () => {
    assert.equal(plannedLineFor(planned, { code: '6.000-002.0' }, null), 1);
    assert.equal(plannedLineFor(planned, { code: '60000020' }, null), 1, 'dots and dashes don’t matter');
    assert.equal(plannedLineFor(planned, { code: '1.000-001.0' }, { _id: 'p1', name: 'Something else' }), 0);
    assert.equal(plannedLineFor(planned, { code: '2.000-003.0' }, { _id: 'p9', name: 'test HOSE ' }), 2);
});

test('an item nobody planned gets a line of its own', () => {
    assert.equal(plannedLineFor(planned, { code: '9.999-999.9' }, null), -1);
    assert.equal(plannedLineFor(planned, { code: '9.999-999.9' }, { _id: 'p9', name: 'Unplanned' }), -1);
    assert.equal(plannedLineFor([], { code: '6.000-002.0' }, null), -1);
});
