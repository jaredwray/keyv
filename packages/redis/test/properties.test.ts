import process from 'node:process';
import {
	describe, test, expect,
} from 'vitest';
import KeyvRedis from '../src/index.js';

const redisUri = process.env.REDIS_URI ?? 'redis://localhost:6379';

describe('properties', () => {
	test('should get and set throwOnConnectError', async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const client = await keyvRedis.getClient();
		expect(client).toBeDefined();

		keyvRedis.throwOnConnectError = false;
		expect(keyvRedis.throwOnConnectError).toBe(false);
		keyvRedis.throwOnConnectError = true;
		expect(keyvRedis.throwOnConnectError).toBe(true);
	});
});
