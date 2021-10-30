const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite').default;
const { keyvOfficialTests } = require('@keyv/test-suite');
const Keyv = require('this');
const KeyvMongo = require('@keyv/mongo');

keyvOfficialTests(test, Keyv, 'mongodb://127.0.0.1:27017', 'mongodb://127.0.0.1:1234');

const store = () => new KeyvMongo('mongodb://127.0.0.1:27017');
keyvTestSuite(test, Keyv, store);