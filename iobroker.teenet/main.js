'use strict';

const utils = require('@iobroker/adapter-core');
const mqtt = require('mqtt');
const Bridge = require('./lib/bridge');

class TeeNet extends utils.Adapter {
    constructor(options = {}) {
        super({ ...options, name: 'teenet' });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        this.bridge = new Bridge(this, mqtt);
        try { await this.bridge.start(); }
        catch (error) {
            this.log.error(`Einrichtung prüfen: ${error.message}`);
            await this.setStateAsync('info.lastError', { val: error.message, ack: true });
            await this.bridge.stop();
        }
    }

    onStateChange(id, state) { this.bridge?.enqueue(() => this.bridge.write(id, state)); }

    onUnload(callback) {
        if (!this.bridge) return callback();
        this.bridge.stop().then(() => callback(), () => callback());
    }
}

if (require.main !== module) module.exports = options => new TeeNet(options);
else new TeeNet();
