import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from 'keyv-test-suite';
import Keyv from 'keyv';
import Keyvpostgres from 'this';

keyvOfficialTests(test, Keyv, 'postgresql://postgres@localhost:5432/keyv_test', 'postgresql://foo');

const store = () => new Keyvpostgres('postgresql://postgres@localhost:5432/keyv_test');
keyvTestSuite(test, Keyv, store);
