import process from 'node:process';
import {
	describe, test, expect,
} from 'vitest';
import {faker} from '@faker-js/faker';
import {delay} from '@keyv/test-suite';
import KeyvRedis from '../src/index.js';

const redisUri = process.env.REDIS_URI ?? 'redis://localhost:6379';
const redisBadUri = process.env.REDIS_BAD_URI ?? 'redis://localhost:6378';

describe('set', () => {
	test('should set a value', async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		await keyvRedis.set(data.key, data.value);

		const result = await keyvRedis.get(data.key);

		expect(result).toBe(data.value);
	});

	test('should set a value and commandTimeout', async () => {
		const keyvRedis = new KeyvRedis(redisUri, {commandTimeout: 1000});
		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		await keyvRedis.set(data.key, data.value);

		const result = await keyvRedis.get(data.key);

		expect(result).toBe(data.value);

		const expiredResult = await keyvRedis.get(data.key);
		expect(expiredResult).toBeUndefined();
	});

	test('should return no-op value on bad uri', async () => {
		const keyvRedis = new KeyvRedis(redisBadUri, {throwOnConnectError: false, commandTimeout: 500});

		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		await keyvRedis.set(data.key, data.value);
	});

	test('should set a value with ttl', async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
			ttl: 400, // 400 milliseconds
		};

		await keyvRedis.set(data.key, data.value, data.ttl);

		const result = await keyvRedis.get(data.key);

		expect(result).toBe(data.value);

		await delay(500); // Wait for ttl to expire

		const expiredResult = await keyvRedis.get(data.key);
		expect(expiredResult).toBeUndefined();
	});

	test('should set a value with ttl and commandTimeout', async () => {
		const keyvRedis = new KeyvRedis(redisUri, {commandTimeout: 1000});
		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
			ttl: 400, // 400 milliseconds
		};

		await keyvRedis.set(data.key, data.value, data.ttl);

		const result = await keyvRedis.get(data.key);

		expect(result).toBe(data.value);

		await delay(500); // Wait for ttl to expire

		const expiredResult = await keyvRedis.get(data.key);
		expect(expiredResult).toBeUndefined();
	});
});
