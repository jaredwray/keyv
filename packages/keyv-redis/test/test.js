import test from 'ava';
import keyvTestSuite from 'keyv-test-suite';
import Keyv from 'keyv';
import KeyvRedis from '../';

const store = new KeyvRedis();
keyvTestSuite(test, Keyv, store);
