import test from 'ava';
import Keyv from 'keyv';
import keyvTestSuite, { keyvOfficialTests } from 'this';

keyvOfficialTests(test, Keyv, 'sqlite://test/testdb.sqlite', 'sqlite://non/existent/database.sqlite');

const store = () => new Map();
keyvTestSuite(test, Keyv, store);
