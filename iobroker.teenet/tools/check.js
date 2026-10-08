'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const Ajv = require('ajv');
const root = path.join(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const pkg = read('package.json'), io = read('io-package.json');
assert.equal(pkg.version, io.common.version);
assert.equal(pkg.name, `iobroker.${io.common.name}`);
for (const [schema, name] of [['tools/io-package-schema.json', 'io-package.json'], ['tools/admin-schema.json', 'admin/jsonConfig.json']]) {
    const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
    const validate = ajv.compile(read(schema));
    if (!validate(read(name))) throw new Error(`${name}: ${JSON.stringify(validate.errors)}`);
}
assert.ok(io.encryptedNative.includes('brokerPassword') && io.protectedNative.includes('brokerPassword'));
for (const file of ['main.js', ...fs.readdirSync(path.join(root, 'lib')).filter(f => f.endsWith('.js')).map(f => `lib/${f}`)]) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
}
for (const file of ['README.md', 'LICENSE', 'admin/teenet.png']) assert.ok(fs.existsSync(path.join(root, file)), `${file} fehlt`);
console.log('Adapterstruktur, offizielle JSON-Schemas, Passwortschutz und JavaScript-Syntax geprüft.');
