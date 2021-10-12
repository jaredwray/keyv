const test = require('ava');
const { keyvOfficialTests } = require('@keyv/test-suite');
const Keyv = require('keyv');

keyvOfficialTests(test, Keyv, 'postgresql://postgres:postgres@localhost:5432/keyv_test', 'postgresql://foo');

