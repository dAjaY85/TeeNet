'use strict';
const { EventEmitter } = require('node:events');
const defaults = require('../io-package.json').native;

class FakeAdapter {
    constructor(overrides = {}, now = () => Date.now()) {
        this.namespace = 'teenet.0';
        this.config = { ...defaults, brokerHost: '127.0.0.1', ...overrides };
        this.objects = new Map(); this.states = new Map(); this.foreign = new Map(); this.foreignObjects = new Map();
        this.subscriptions = []; this.logs = []; this.now = now; this.writes = [];
        this.log = Object.fromEntries(['info', 'warn', 'error', 'debug'].map(level => [level, message => this.logs.push({ level, message })]));
    }
    async setObjectNotExistsAsync(id, obj) { if (!this.objects.has(id)) this.objects.set(id, obj); }
    async getObjectAsync(id) { return this.objects.get(id) || null; }
    async delStateAsync(id) { this.states.delete(id); }
    async delObjectAsync(id) { this.objects.delete(id); }
    async setStateChangedAsync(id, state) { this.writes.push({ id, ...state }); this.states.set(id, { ...state, ts: this.now() }); }
    async setStateAsync(id, state) { this.states.set(id, { ...state, ts: this.now() }); }
    async subscribeStatesAsync(pattern) { this.subscriptions.push(pattern); }
    async subscribeForeignStatesAsync(id) { this.subscriptions.push(id); }
    async getForeignStateAsync(id) { return this.foreign.get(id) || null; }
    async getForeignObjectAsync(id) { return this.foreignObjects.get(id) || null; }
    setInterval(fn) { this.tick = fn; return 1; }
    clearInterval() { this.tick = null; }
    value(id) { return this.states.get(id)?.val; }
}

class FakeClient extends EventEmitter {
    constructor() { super(); this.sent = []; this.connected = false; }
    subscribe(topics, options, cb) { this.topics = topics; cb(null, topics.map(topic => ({ topic, qos: 0 }))); }
    publish(topic, payload, options, cb) { this.sent.push({ topic, payload, ...options }); cb?.(); }
    end(force, options, cb) { this.connected = false; cb?.(); }
}

async function fixture(config = {}) {
    let time = 1000000;
    const now = () => time;
    const io = new FakeAdapter(config, now), client = new FakeClient();
    const bridge = new (require('../lib/bridge'))(io, { connect: (url, options) => { client.url = url; client.options = options; return client; } }, now);
    const start = async () => { await bridge.start(); client.connected = true; client.emit('connect'); await bridge.serial; };
    const receive = async (key, value, retained = false) => {
        client.emit('message', `wallbox-ems/${key}`, Buffer.from(String(value)), { retain: retained });
        await bridge.serial;
    };
    const online = async () => {
        await receive('availability', 'online', true);
        await receive('sensor/enabled', false);
        await receive('sensor/mode', 'off');
        await receive('sensor/manual_power_kw', 6);
    };
    const write = (key, val, ack = false) => bridge.enqueue(() => bridge.write(`teenet.0.control.${key}`, { val, ack }));
    return { io, client, bridge, start, receive, online, write, now, advance: ms => { time += ms; } };
}

module.exports = { FakeAdapter, FakeClient, fixture };
