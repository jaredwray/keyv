import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from 'keyv-test-suite';
import Keyv from 'this';
import KeyvSqlite from 'keyv-sqlite';

keyvOfficialTests(test, Keyv, 'sqlite://:memory:', 'sqlite://non/existent/database.sqlite');

const store = () => new KeyvSqlite('sqlite://:memory:');
keyvTestSuite(test, Keyv, store);
