'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { once } = require('node:events');
const mqtt = require('mqtt');
const Bridge = require('../lib/bridge');
const { FakeAdapter } = require('./helpers');

async function waitFor(fn) {
    const limit = Date.now() + 5000;
    while (!fn()) {
        if (Date.now() > limit) throw new Error('Testbedingung wurde nicht erreicht.');
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}

test('real MQTT broker: control, feedback, separate device namespaces and offline protection', { timeout: 15000 }, async t => {
    const { Aedes } = await import('aedes');
    const aedes = await Aedes.createBroker();
    const server = net.createServer(aedes.handle);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const esp = mqtt.connect(`mqtt://127.0.0.1:${port}`, { clientId: 'test_esp', reconnectPeriod: 0 });
    t.after(async () => {
        esp.end(true);
        await new Promise(resolve => aedes.close(resolve));
        await new Promise(resolve => server.close(resolve));
    });
    await once(esp, 'connect');
    const commands = [];
    esp.on('message', (topic, payload, packet) => commands.push({ topic, value: payload.toString(), retained: packet.retain }));
    await esp.subscribeAsync('wallbox-ems/command/#');
    const io = new FakeAdapter({ brokerPort: port, readOnly: false });
    const bridge = new Bridge(io, mqtt);
    t.after(() => bridge.stop());
    await bridge.start();
    await waitFor(() => bridge.broker);
    await esp.publishAsync('other-device/availability', 'online', { retain: true, qos: 1 });
    await esp.publishAsync('other-device/sensor/estimate_w', '10000');
    await esp.publishAsync('wallbox-ems/availability', 'online', { retain: true, qos: 1 });
    await esp.publishAsync('wallbox-ems/sensor/estimate_w', '2300');
    for (const [key, value] of [['manual_power_kw', '6'], ['enabled', 'false'], ['mode', 'off']]) await esp.publishAsync(`wallbox-ems/sensor/${key}`, value);
    await waitFor(() => io.value('info.connection'));
    await waitFor(() => io.value('control.mode') === 'off');
    assert.equal(io.value('wallbox.power_w'), 2300);
    await bridge.enqueue(() => bridge.write('teenet.0.control.power_kw', { val: 6, ack: false }));
    await waitFor(() => commands.length === 1);
    assert.deepEqual(commands[0], { topic: 'wallbox-ems/command/power_kw', value: '6', retained: false });
    for (const [key, value] of [['manual_power_kw', '6'], ['enabled', 'true'], ['mode', 'manual']]) await esp.publishAsync(`wallbox-ems/sensor/${key}`, value);
    await waitFor(() => io.value('info.commandStatus') === 'Rückmeldung bestätigt');
    await esp.publishAsync('wallbox-ems/availability', 'offline', { retain: true, qos: 1 });
    await waitFor(() => io.value('info.connection') === false);
    await bridge.enqueue(() => bridge.write('teenet.0.control.enabled', { val: true, ack: false }));
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(commands.length, 1);
});
