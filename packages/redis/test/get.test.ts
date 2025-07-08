import process from 'node:process';
import {
	describe, test, expect,
} from 'vitest';
import {faker} from '@faker-js/faker';
import KeyvRedis from '../src/index.js';

const redisUri = process.env.REDIS_URI ?? 'redis://localhost:6379';
const redisBadUri = process.env.REDIS_BAD_URI ?? 'redis://localhost:6378';

describe('get', () => {
	test('should get many values', async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const data = {
			key1: faker.string.alphanumeric(10),
			value1: faker.lorem.sentence(),
			key2: faker.string.alphanumeric(10),
			value2: faker.lorem.sentence(),
		};

		await keyvRedis.set(data.key1, data.value1);
		await keyvRedis.set(data.key2, data.value2);

		const results = await keyvRedis.getMany([data.key1, data.key2]);

		expect(results).toEqual([data.value1, data.value2]);
	});

	test('should return undefined for keys that do not exist', async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const data = {
			key1: faker.string.alphanumeric(10),
			key2: faker.string.alphanumeric(10),
		};

		const results = await keyvRedis.getMany([data.key1, data.key2]);

		expect(results).toEqual([undefined, undefined]);
	});

	test('should handle empty array input', async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const results = await keyvRedis.getMany([]);
		expect(results).toEqual([]);
	});
});
