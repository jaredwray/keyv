const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite');
const { keyvOfficialTests } = require('@keyv/test-suite');
const Keyv = require('keyv');
const KeyvSqlite = require('this');

keyvOfficialTests(test, Keyv, 'sqlite://test/testdb.sqlite', 'sqlite://non/existent/database.sqlite');

const store = () => new KeyvSqlite({ uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000 });

keyvTestSuite.keyvApiTests(test, Keyv, store);
keyvTestSuite.keyvNamepsaceTests(test, Keyv, store);
keyvTestSuite.keyvValueTests(test, Keyv, store);
