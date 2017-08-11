import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from '@keyv/test-suite';
import Keyv from 'this';
import KeyvSqlite from '@keyv/sqlite';

keyvOfficialTests(test, Keyv, 'sqlite://test/testdb.sqlite', 'sqlite://non/existent/database.sqlite');

const store = () => new KeyvSqlite('sqlite://test/testdb.sqlite');
keyvTestSuite(test, Keyv, store);
