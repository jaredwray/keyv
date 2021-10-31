const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite').default;
const { keyvOfficialTests } = require('@keyv/test-suite');
const Keyv = require('this');
const KeyvRedis = require('@keyv/redis');

keyvOfficialTests(test, Keyv, 'redis://localhost', 'redis://foo');

const store = () => new KeyvRedis('redis://localhost');
keyvTestSuite(test, Keyv, store);
