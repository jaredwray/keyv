import * as path from 'path';
import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from '@keyv/test-suite';
import Keyv from 'keyv';
import KeyvSqlite from '..';

const goodUri = `sqlite://${path.resolve(__dirname, 'testdb.sqlite')}`;
const badUri = 'sqlite://non/existent/database.sqlite';

keyvOfficialTests(test, Keyv, goodUri, badUri);

const store = () => new KeyvSqlite({ uri: goodUri, busyTimeout: 30000 });
keyvTestSuite(test, Keyv, store);
