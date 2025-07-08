import process from 'node:process';
import {
	describe, test, expect,
	vi,
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

	test('should throw an error on client error', async () => {
		const keyvRedis = new KeyvRedis(redisUri, {throwErrors: true});

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(keyvRedis.client, 'get').mockImplementation(() => {
			throw new Error('Redis client error');
		});

		let didError = false;
		try {
			await keyvRedis.get(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe('Redis client error');
		}

		expect(didError).toBe(true);
		vi.spyOn(keyvRedis.client, 'get').mockRestore();
	});

	test('should not throw an error on client error', async () => {
		const keyvRedis = new KeyvRedis(redisUri, {throwErrors: false});

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(keyvRedis.client, 'get').mockImplementation(() => {
			throw new Error('Redis client error');
		});

		let didError = false;
		let result: string | undefined = '';
		try {
			result = await keyvRedis.get(data.key);
		} catch (error) {
			didError = true;
		}

		expect(didError).toBe(false);
		expect(result).toBeUndefined();
		vi.spyOn(keyvRedis.client, 'get').mockRestore();
	});
});
