import process from 'node:process';
import {
	describe, test, expect,
} from 'vitest';
import KeyvRedis from '../src/index.js';

const redisUri = process.env.REDIS_URI ?? 'redis://localhost:6379';

describe('properties', () => {
	test('should get and set throwOnConnectError', async () => {
		const keyvRedis = new KeyvRedis(redisUri, {throwOnConnectError: true});
		const client = await keyvRedis.getClient();
		expect(client).toBeDefined();

		expect(keyvRedis.throwOnConnectError).toBe(true);
		keyvRedis.throwOnConnectError = false;
		expect(keyvRedis.throwOnConnectError).toBe(false);
		keyvRedis.throwOnConnectError = true;
		expect(keyvRedis.throwOnConnectError).toBe(true);
	});

	test('should get and set throwErrors', async () => {
		const keyvRedis = new KeyvRedis(redisUri, {throwErrors: true});
		const client = await keyvRedis.getClient();
		expect(client).toBeDefined();
		expect(keyvRedis.throwErrors).toBe(true);
		keyvRedis.throwErrors = false;
		expect(keyvRedis.throwErrors).toBe(false);
		keyvRedis.throwErrors = true;
		expect(keyvRedis.throwErrors).toBe(true);
	});

	test('should get and set commandTimeout', async () => {
		const keyvRedis = new KeyvRedis(redisUri, {commandTimeout: 1000});
		const client = await keyvRedis.getClient();
		expect(client).toBeDefined();

		expect(keyvRedis.commandTimeout).toBe(1000);
		keyvRedis.commandTimeout = 2000;
		expect(keyvRedis.commandTimeout).toBe(2000);
		keyvRedis.commandTimeout = undefined;
		expect(keyvRedis.commandTimeout).toBeUndefined();
	});
});
