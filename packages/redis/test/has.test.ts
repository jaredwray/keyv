import process from 'node:process';
import {
	describe, test, expect, vi,
} from 'vitest';
import {faker} from '@faker-js/faker';
import KeyvRedis, {RedisErrorMessages} from '../src/index.js';

const redisUri = process.env.REDIS_URI ?? 'redis://localhost:6379';
const redisBadUri = process.env.REDIS_BAD_URI ?? 'redis://localhost:6378';

describe('has', () => {
	test('should return true for existing keys', async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		await keyvRedis.set(data.key, data.value);

		const result = await keyvRedis.has(data.key);

		expect(result).toBe(true);
	});

	test('should return false for non-existing keys', async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const data = {
			key: faker.string.alphanumeric(10),
		};

		const result = await keyvRedis.has(data.key);

		expect(result).toBe(false);
	});

	test('should throw on connection error', async () => {
		const keyvRedis = new KeyvRedis(redisBadUri, {throwOnConnectError: true});

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(keyvRedis.client, 'exists').mockImplementation(() => {
			throw new Error('Redis client error');
		});

		let didError = false;
		try {
			await keyvRedis.has(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe(RedisErrorMessages.RedisClientNotConnectedThrown);
		}

		expect(didError).toBe(true);
		vi.spyOn(keyvRedis.client, 'exists').mockRestore();
	});

	test('should not throw on connection error when throwOnConnectError is false', async () => {
		const keyvRedis = new KeyvRedis(redisBadUri, {throwOnConnectError: false});

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(keyvRedis.client, 'exists').mockImplementation(() => {
			throw new Error('Redis client error');
		});

		let didError = false;
		try {
			await keyvRedis.has(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe('Redis client error');
		}

		expect(didError).toBe(false);
		vi.spyOn(keyvRedis.client, 'exists').mockRestore();
	});

	test('should throw an error when throwErrors is true and an error occurs', async () => {
		const keyvRedis = new KeyvRedis(redisUri, {throwErrors: true});

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(keyvRedis.client, 'exists').mockImplementation(() => {
			throw new Error('Redis client error');
		});

		let didError = false;
		try {
			await keyvRedis.has(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe('Redis client error');
		}

		expect(didError).toBe(true);
		vi.spyOn(keyvRedis.client, 'exists').mockRestore();
	});

	test('should not throw an error on hasMany when throwErrors is false', async () => {
		const keyvRedis = new KeyvRedis(redisUri, {throwErrors: false});

		const data = {
			keys: [faker.string.alphanumeric(10), faker.string.alphanumeric(10)],
		};

		vi.spyOn(keyvRedis.client, 'multi').mockImplementation(() => {
			throw new Error('Redis client error');
		});

		let didError = false;
		try {
			await keyvRedis.hasMany(data.keys);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe('Redis client error');
		}

		expect(didError).toBe(false);
		vi.spyOn(keyvRedis.client, 'multi').mockRestore();
	});

	test('should throw an error on hasMany when throwErrors is true', async () => {
		const keyvRedis = new KeyvRedis(redisUri, {throwErrors: true});

		const data = {
			keys: [faker.string.alphanumeric(10), faker.string.alphanumeric(10)],
		};

		vi.spyOn(keyvRedis.client, 'multi').mockImplementation(() => {
			throw new Error('Redis client error');
		});

		let didError = false;
		try {
			await keyvRedis.hasMany(data.keys);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe('Redis client error');
		}

		expect(didError).toBe(true);
		vi.spyOn(keyvRedis.client, 'multi').mockRestore();
	});
});
