import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from '@keyv/test-suite';
import Keyv from 'keyv';
import KeyvSqlite from '..';

keyvOfficialTests(test, Keyv, 'sqlite://testdb.sqlite', 'sqlite://non/existent/database.sqlite');

const store = () => new KeyvSqlite({ uri: 'sqlite://testdb.sqlite', busyTimeout: 30000 });
keyvTestSuite(test, Keyv, store);
