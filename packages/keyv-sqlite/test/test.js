import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from 'keyv-test-suite';
import Keyv from 'keyv';
import KeyvSqlite from 'this';

keyvOfficialTests(test, Keyv, 'sqlite://:memory:', 'sqlite://non/existent/database.sqlite');

const store = () => new KeyvSqlite('sqlite://:memory:');
keyvTestSuite(test, Keyv, store);
