'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { config, parseMetric, command, validSource } = require('../lib/protocol');

test('broker addresses, prefixes and input options are validated', () => {
    assert.equal(config({ brokerHost: '192.168.1.10' }).url, 'mqtt://192.168.1.10:1883');
    assert.equal(config({ brokerHost: '::1', tls: true }).url, 'mqtts://[::1]:8883');
    for (const raw of [{ brokerHost: '' }, { brokerHost: 'mqtt://x' }, { brokerHost: 'x', topicPrefix: 'a/#' },
        { brokerHost: 'x', brokerPort: 70000 }, { brokerHost: 'x', inputInterval: 60 },
        { brokerHost: 'x', pvEnabled: true }, { brokerHost: 'x', batteryEnabled: true }]) assert.throws(() => config(raw));
    const disabled = config({ brokerHost: 'x', pvState: 'test.pv', batterySocState: 'test.soc' });
    assert.equal(disabled.pvState, ''); assert.equal(disabled.batterySocState, '');
});

test('strict metric parsing rejects broken, oversized and out-of-range payloads', () => {
    assert.equal(parseMetric('estimate_w', Buffer.from('2300.5')), 2300.5);
    assert.equal(parseMetric('house_power_w', Buffer.from('-100')), -100);
    assert.equal(parseMetric('enabled', Buffer.from('true')), true);
    assert.equal(parseMetric('estimate_w', Buffer.from('null')), null);
    for (const value of ['', 'NaN', 'Infinity', '1junk', ' ', '{}', '50001', '-1']) assert.equal(parseMetric('estimate_w', Buffer.from(value)), undefined);
    assert.equal(parseMetric('enabled', Buffer.from('yes')), undefined);
    assert.equal(parseMetric('mode', Buffer.from('foobar')), undefined);
    assert.equal(parseMetric('estimate_w', Buffer.alloc(1000)), undefined);
    assert.equal(parseMetric('not/a/metric', Buffer.from('1')), undefined);
});

test('power command accepts only existing firmware steps and explicit types', () => {
    for (const n of [0, 2, 2.5, 3, 3.5, 6, 8, 11]) assert.equal(command('power_kw', n), String(n));
    for (const n of ['6', 1.5, 3.6, 4, 5, 5.5, 5.52, 12, NaN, Infinity]) assert.throws(() => command('power_kw', n));
    assert.equal(command('enabled', false), 'false');
    assert.throws(() => command('enabled', 'false'));
    assert.throws(() => command('mode', 'grid_limit'));
});

test('source timestamps, quality and acknowledgement are checked without renewing their age', () => {
    const s = { val: 4, ack: true, ts: 10000, q: 0 };
    assert.equal(validSource(s, 90, 20000), true);
    assert.equal(validSource(s, 90, 101000), false);
    for (const change of [{ val: null }, { val: '4' }, { val: NaN }, { ack: false }, { q: 0x40 }, { ts: 1000000 }]) {
        assert.equal(validSource({ ...s, ...change }, 90, 20000), false);
    }
});
