import * as test from 'vitest';
import keyvTestSuite, {keyvIteratorTests} from '@keyv/test-suite';
import {KeyvSqlite} from '@keyv/sqlite';
import Keyv from '../src/index.js';

const store = () => new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000});
// @ts-expect-error Keyv type
keyvTestSuite(test, Keyv, store);
// @ts-expect-error Keyv type
keyvIteratorTests(test, Keyv, store);
