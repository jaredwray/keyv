import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from '@keyv/test-suite';
import Keyv from 'keyv';
import KeyvRedis from 'this';

keyvOfficialTests(test, Keyv, 'redis://localhost', 'redis://foo');

const store = () => new KeyvRedis();
keyvTestSuite(test, Keyv, store);
