import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from 'keyv-test-suite';
import Keyv from 'keyv';
import KeyvSQLite from 'this';

keyvOfficialTests(test, Keyv, 'sqlite://:memory:', 'sqlite://path/to/database.sqlite');

const store = () => new KeyvSQLite();
keyvTestSuite(test, Keyv, store);
