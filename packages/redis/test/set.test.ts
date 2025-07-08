import process from 'node:process';
import {
	describe, test, expect, vi,
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

	test('should throw error on bad uri', async () => {
		const keyvRedis = new KeyvRedis(redisBadUri);

		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		let didError = false;

		try {
			await keyvRedis.set(data.key, data.value);
		} catch {
			didError = true;
		}

		expect(didError).toBe(true);
	});

	test('should throw error on bad uri', async () => {
		const keyvRedis = new KeyvRedis(redisBadUri, {throwOnConnectError: false, throwErrors: true});

		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		// Set the set value to throw an error on the client
		keyvRedis.client.set = () => {
			throw new Error('Redis client error');
		};

		let didError = false;
		try {
			await keyvRedis.set(data.key, data.value);
		} catch {
			didError = true;
		}

		expect(didError).toBe(true);
	});

	test('should set a value with ttl', async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
			ttl: 100, // 100 milliseconds
		};

		await keyvRedis.set(data.key, data.value, data.ttl);

		const result = await keyvRedis.get(data.key);

		expect(result).toBe(data.value);

		await delay(200); // Wait for ttl to expire

		const expiredResult = await keyvRedis.get(data.key);
		expect(expiredResult).toBeUndefined();
	});

	test('should set a value with ttl', async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
			ttl: 100, // 100 milliseconds
		};

		await keyvRedis.set(data.key, data.value, data.ttl);

		const result = await keyvRedis.get(data.key);

		expect(result).toBe(data.value);

		await delay(200); // Wait for ttl to expire

		const expiredResult = await keyvRedis.get(data.key);
		expect(expiredResult).toBeUndefined();
	});

	test('show throw on redis client set and get error', async () => {
		const keyvRedis = new KeyvRedis(redisUri, {throwErrors: true});

		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		// Mock the set method to throw an error
		vi.spyOn(keyvRedis.client, 'set').mockImplementation(() => {
			throw new Error('Redis set error');
		});

		let didError = false;
		try {
			await keyvRedis.set(data.key, data.value);
		} catch {
			didError = true;
		}

		expect(didError).toBe(true);
		vi.spyOn(keyvRedis.client, 'set').mockRestore();
	});

	test('show throw on redis client setMany and get error', async () => {
		const keyvRedis = new KeyvRedis(redisUri, {throwErrors: true});

		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		// Mock the set method to throw an error
		vi.spyOn(keyvRedis.client, 'multi').mockImplementation(() => {
			throw new Error('Redis setMany error');
		});

		let didError = false;
		try {
			await keyvRedis.setMany([data, data, data]);
		} catch {
			didError = true;
		}

		expect(didError).toBe(true);
		vi.spyOn(keyvRedis.client, 'multi').mockRestore();
	});
});
