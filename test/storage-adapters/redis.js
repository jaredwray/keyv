import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from '@keyv/test-suite';
import Keyv from 'this';
import KeyvRedis from '@keyv/redis';

keyvOfficialTests(test, Keyv, 'redis://localhost', 'redis://foo');

const store = () => new KeyvRedis('redis://localhost');
keyvTestSuite(test, Keyv, store);
