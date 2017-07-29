import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from 'keyv-test-suite';
import Keyv from 'keyv';
import Keyvpostgres from 'this';

keyvOfficialTests(test, Keyv, 'postgresql://localhost:5432', 'postgresql://foo');

const store = () => new Keyvpostgres('postgresql://localhost:5432');
keyvTestSuite(test, Keyv, store);
