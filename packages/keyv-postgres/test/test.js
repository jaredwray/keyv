const test = require('ava');
const { keyvOfficialTests } = require('@keyv/test-suite');
const Keyv = require('keyv');
const KeyvPostgres = require('this');
const keyvTestSuite = require('@keyv/test-suite');

keyvOfficialTests(test, Keyv, 'postgresql://postgres:postgres@localhost:5432/keyv_test', 'postgresql://foo');

const storeApi = () => new KeyvPostgres({ uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test', table: 'cacheApi' });
const storeValue = () => new KeyvPostgres({ uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test', table: 'cacheValue' });
keyvTestSuite.keyvApiTests(test, Keyv, storeApi);
keyvTestSuite.keyvValueTests(test, Keyv, storeValue);
