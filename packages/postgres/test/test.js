const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite').default;
const {keyvOfficialTests, keyvIteratorTests} = require('@keyv/test-suite');
const Keyv = require('keyv');
const KeyvPostgres = require('this');

keyvOfficialTests(test, Keyv, 'postgresql://postgres:postgres@localhost:5432/keyv_test', 'postgresql://foo');

const store = () => new KeyvPostgres({uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test', iterationLimit: 2});
keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

