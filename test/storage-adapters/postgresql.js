import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from '@keyv/test-suite';
import Keyv from 'this';
import KeyvPostgres from '@keyv/postgres';

keyvOfficialTests(test, Keyv, 'postgresql://postgres@localhost:5432/keyv_test', 'postgresql://foo');

const store = () => new KeyvPostgres('postgresql://postgres@localhost:5432/keyv_test');
keyvTestSuite(test, Keyv, store);
