const test = require('ava');
const { keyvOfficialTests } = require('@keyv/test-suite');
const Keyv = require('keyv');
const KeyvPostgres = require('this');
const keyvTestSuite = require('@keyv/test-suite');

keyvOfficialTests(test, Keyv, 'postgresql://postgres:postgres@localhost:5432/keyv_test', 'postgresql://foo');

const store = () => new KeyvPostgres({ uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test' });
keyvTestSuite.keyvApiTests(test, Keyv, store);
