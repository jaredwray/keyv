import * as test from 'vitest';
import keyvTestSuite, {keyvIteratorTests} from '@keyv/test-suite';
import {Keyv} from 'keyv';
import KeyvRedis from '../src/index.js';

const redisUrl = 'redis://localhost:6379/5';
const store = () => new KeyvRedis(redisUrl);

test.afterAll(async () => {
	const client = await store().getClient();
	await client.flushDb();
	await store().disconnect();
});

keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

