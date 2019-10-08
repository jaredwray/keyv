import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from '@keyv/test-suite';
import Keyv from 'keyv';
import KeyvRedis from 'this';

const { REDIS_HOST = 'localhost' } = process.env;
const redisURI = `redis://${REDIS_HOST}`;

keyvOfficialTests(test, Keyv, redisURI, 'redis://foo');

const store = () => new KeyvRedis(redisURI);
keyvTestSuite(test, Keyv, store);
