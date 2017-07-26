import test from 'ava';
import Keyv from 'keyv';
import keyvTestSuite, { keyvOfficialTests } from 'get-root-module';

keyvOfficialTests(test, Keyv, 'redis://localhost', 'redis://foo');

const store = () => new Map();
keyvTestSuite(test, Keyv, store);
