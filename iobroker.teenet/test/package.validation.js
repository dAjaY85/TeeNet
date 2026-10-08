'use strict';
const { tests } = require('@iobroker/testing');
const path = require('node:path');
// Official schemas are also checked offline by tools/check.js.
tests.packageFiles(path.join(__dirname, '..'), { ignoreIoPackageValidation: true, ignoreJsonConfigValidation: true });
