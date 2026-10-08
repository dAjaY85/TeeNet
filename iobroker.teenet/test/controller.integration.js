'use strict';
const { tests } = require('@iobroker/testing');
const path = require('node:path');
tests.packageFiles(path.join(__dirname, '..'));
tests.integration(path.join(__dirname, '..'), { allowedExitCodes: [11] });
