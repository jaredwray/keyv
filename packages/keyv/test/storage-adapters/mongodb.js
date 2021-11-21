const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite').default;
const Keyv = require('this');
const KeyvMongo = require('@keyv/mongo');

const store = () => new KeyvMongo('mongodb://127.0.0.1:27017');
keyvTestSuite(test, Keyv, store);
