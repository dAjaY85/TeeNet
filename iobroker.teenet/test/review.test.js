'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers');
const { parseMetric } = require('../lib/protocol');

test('restart clears old telemetry and control values until fresh feedback arrives', async () => {
    const f = await fixture();
    for (const id of ['wallbox.power_w', 'control.power_kw', 'energy.total_kwh']) f.io.states.set(id, { val: 11, ack: true, q: 0 });
    await f.start();
    for (const id of ['wallbox.power_w', 'control.power_kw', 'energy.total_kwh']) {
        assert.equal(f.io.value(id), null); assert.notEqual(f.io.states.get(id).q, 0);
    }
    await f.bridge.stop();
});

test('stop supersedes a pending power command and an old callback cannot cancel the stop', async () => {
    const f = await fixture({ readOnly: false }); await f.start(); await f.online();
    const callbacks = [];
    f.client.publish = (topic, payload, options, cb) => { f.client.sent.push({ topic, payload, ...options }); callbacks.push(cb); };
    await f.write('power_kw', 11); await f.write('enabled', false);
    assert.equal(f.client.sent.length, 2);
    assert.equal(f.client.sent[1].topic, 'wallbox-ems/command/enabled');
    assert.equal(f.client.sent[1].payload, 'false');
    assert.equal(f.bridge.pending.key, 'enabled');
    callbacks[0](new Error('late publish error')); await f.bridge.serial;
    assert.equal(f.bridge.pending.key, 'enabled');
    await f.receive('sensor/enabled', false);
    assert.equal(f.io.value('info.commandStatus'), 'Rückmeldung bestätigt');
    await f.bridge.stop();
});

test('all three stop forms bypass a pending command', async () => {
    for (const [key, value] of [['enabled', false], ['mode', 'off'], ['power_kw', 0]]) {
        const f = await fixture({ readOnly: false }); await f.start(); await f.online();
        await f.write('power_kw', 6); await f.write(key, value);
        assert.equal(f.client.sent.length, 2); assert.equal(f.bridge.pending.key, key);
        assert.equal(f.bridge.pending.value, value);
        await f.bridge.stop();
    }
});

test('enable while off restores the last observed active mode and requires both feedback fields', async () => {
    const f = await fixture({ readOnly: false }); await f.start(); await f.online();
    await f.receive('sensor/mode', 'pv'); await f.receive('sensor/mode', 'off');
    await f.write('enabled', true);
    assert.equal(f.client.sent.at(-1).topic, 'wallbox-ems/command/mode');
    assert.equal(f.client.sent.at(-1).payload, 'pv');
    await f.receive('sensor/enabled', true); assert.ok(f.bridge.pending);
    await f.receive('sensor/mode', 'pv'); assert.equal(f.bridge.pending, null);
    await f.bridge.stop();
});

test('partial telemetry does not make stale controls valid; stop remains possible', async () => {
    const f = await fixture({ readOnly: false }); await f.start(); await f.online();
    f.advance(91000); await f.receive('sensor/estimate_w', 2300); await f.bridge.tick();
    assert.equal(f.io.value('info.connection'), true);
    assert.equal(f.io.states.get('control.power_kw').q, 0x02);
    await f.write('power_kw', 6); assert.equal(f.client.sent.length, 0);
    await f.write('enabled', false); assert.equal(f.client.sent.length, 1);
    await f.bridge.stop();
});

test('read-only state writes are coalesced while source and telemetry freshness remain checked', async () => {
    const f = await fixture(); await f.start(); await f.online();
    await f.receive('sensor/estimate_w', 2300);
    const writes = f.io.writes.length;
    for (let i = 0; i < 50; i++) { f.advance(5); await f.receive('sensor/estimate_w', 2300); }
    assert.equal(f.io.writes.length, writes);
    const at = f.bridge.cache.get('estimate_w').at;
    assert.equal(at, f.now());
    for (let i = 0; i < 60; i++) { f.advance(1000); await f.bridge.tick(); }
    assert.equal(f.io.writes.length, writes);
    await f.bridge.stop();
});

test('unknown topics and unknown writable states are ignored', async () => {
    assert.equal(parseMetric('__proto__', Buffer.from('x')), undefined);
    assert.equal(parseMetric('constructor', Buffer.from('x')), undefined);
    const f = await fixture(); await f.start();
    const count = f.io.states.size;
    await f.write('unknown', true); assert.equal(f.io.states.size, count);
    await f.bridge.stop();
});

test('same ioBroker instance name on different hosts gets unique MQTT client IDs', async () => {
    const f = await fixture(), g = await fixture(); await f.start(); await g.start();
    assert.notEqual(f.client.options.clientId, g.client.options.clientId);
    await f.bridge.stop(); await g.bridge.stop();
});

test('subscription rejection cannot enable commands even if MQTT messages arrive', async () => {
    const f = await fixture({ readOnly: false });
    f.client.subscribe = (topics, options, cb) => cb(null, topics.map(topic => ({ topic, qos: 128 })));
    await f.start(); await f.online();
    assert.equal(f.bridge.broker, false);
    assert.equal(f.io.value('info.connection'), false);
    await f.write('enabled', false); assert.equal(f.client.sent.length, 0);
    await f.bridge.stop();
});

test('one source cannot be both power and SOC', async () => {
    const f = await fixture({ pvEnabled: true, pvState: 'source.value', batteryEnabled: true, batterySocState: 'source.value' });
    await assert.rejects(f.start(), /zugleich Leistung und SOC/);
});

test('minimal object tree has 22 states and removes legacy duplicates', async () => {
    const f = await fixture();
    for (const id of ['info.brokerConnected', 'wallbox.mode', 'inputs.problem']) {
        f.io.objects.set(id, { type: 'state' }); f.io.states.set(id, { val: 'old' });
    }
    f.io.objects.set('inputs', { type: 'channel' });
    await f.start();
    assert.equal([...f.io.objects.values()].filter(x => x.type === 'state').length, 22);
    for (const id of ['info.brokerConnected', 'wallbox.mode', 'inputs.problem', 'inputs']) {
        assert.equal(f.io.objects.has(id), false);
    }
    await f.bridge.stop();
});
