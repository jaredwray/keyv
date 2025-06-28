import process from 'node:process';
import {
	describe, test, expect,
} from 'vitest';
import {delay} from '@keyv/test-suite';
import KeyvRedis, {createKeyv} from '../src/index.js';

const redisUri = process.env.REDIS_URI ?? 'redis://localhost:6379';
const redisBadUri = process.env.REDIS_BAD_URI ?? 'redis://localhost:6378';

describe('connect', () => {
	test('connects to redis', async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		expect(keyvRedis.client).toBeDefined();
	});

	test('fails to connect to bad redis uri', async () => {
		const keyvRedis = new KeyvRedis(redisBadUri);
		await expect(keyvRedis.getClient()).rejects.toThrow();
	});
});
