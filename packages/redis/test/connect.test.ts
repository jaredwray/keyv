/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import process from 'node:process';
import {
	describe, test, expect,
} from 'vitest';
import {faker} from '@faker-js/faker';
import KeyvRedis, {RedisErrorMessages} from '../src/index.js';

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

	test('can set connectTimeout', async () => {
		const keyvRedis = new KeyvRedis(redisUri, {connectTimeout: 1000});
		expect(keyvRedis.connectTimeout).toBe(1000);
		await expect(keyvRedis.getClient()).resolves.toBeDefined();
		keyvRedis.connectTimeout = 5000; // Reset to default for other tests
		expect(keyvRedis.connectTimeout).toBe(5000);
		await expect(keyvRedis.getClient()).resolves.toBeDefined();
	});

	test('fails to set connectTimeout to 0', async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		let errorMessage = '';
		keyvRedis.on('error', error => {
			expect(error).toBe('connectTimeout must be greater than 0');
			errorMessage = error;
		});
		keyvRedis.connectTimeout = 0; // Attempt to set to 0
		expect(keyvRedis.connectTimeout).toBe(200); // Default value
		expect(errorMessage).toBe('connectTimeout must be greater than 0');
	});

	test('fails to set connectTimeout to 0 on KeyvRedisOptions', async () => {
		const keyvRedis = new KeyvRedis(redisUri, {connectTimeout: 0});
		expect(keyvRedis.connectTimeout).toBe(200); // Default value
	});

	test('should gracefully fail on set with bad redis uri', async () => {
		const keyvRedis = new KeyvRedis(redisBadUri);
		let errorMessage = '';
		keyvRedis.on('error', error => {
			expect(error).toBeDefined();
			errorMessage = error.message;
		});
		await expect(keyvRedis.set(faker.string.uuid(), faker.lorem.sentence())).resolves.toBeUndefined();
		expect(errorMessage).toBe(RedisErrorMessages.RedisClientNotConnected);
	});

	test('should gracefully fail on setMany with bad redis uri', async () => {
		const keyvRedis = new KeyvRedis(redisBadUri);
		let errorMessage = '';

		keyvRedis.on('error', error => {
			expect(error).toBeDefined();
			errorMessage = error.message;
		});

		const data = [
			{key: faker.string.uuid(), value: faker.lorem.sentence()},
			{key: faker.string.uuid(), value: faker.lorem.sentence()},
		];

		await expect(keyvRedis.setMany(data)).resolves.toBeUndefined();
		expect(errorMessage).toBe(RedisErrorMessages.RedisClientNotConnected);
	});

	test('should gracefully hanlde has with bad redis uri', async () => {
		const keyvRedis = new KeyvRedis(redisBadUri);
		let errorMessage = '';

		keyvRedis.on('error', error => {
			expect(error).toBeDefined();
			errorMessage = error.message;
		});

		await expect(keyvRedis.has(faker.string.uuid())).resolves.toBe(false);
		expect(errorMessage).toBe(RedisErrorMessages.RedisClientNotConnected);
	});

	test('should gracefully handle hasMany with bad redis uri', async () => {
		const keyvRedis = new KeyvRedis(redisBadUri);
		let errorMessage = '';

		keyvRedis.on('error', error => {
			expect(error).toBeDefined();
			errorMessage = error.message;
		});

		const keys = [faker.string.uuid(), faker.string.uuid()];
		await expect(keyvRedis.hasMany(keys)).resolves.toEqual([false, false]);
		expect(errorMessage).toBe(RedisErrorMessages.RedisClientNotConnected);
	});

	test('should gracefully handle get with bad redis uri', async () => {
		const keyvRedis = new KeyvRedis(redisBadUri);
		let errorMessage = '';

		keyvRedis.on('error', error => {
			expect(error).toBeDefined();
			errorMessage = error.message;
		});

		await expect(keyvRedis.get(faker.string.uuid())).resolves.toBeUndefined();
		expect(errorMessage).toBe(RedisErrorMessages.RedisClientNotConnected);
	});

	test('should gracefully handle getMany with bad redis uri', async () => {
		const keyvRedis = new KeyvRedis(redisBadUri);
		let errorMessage = '';

		keyvRedis.on('error', error => {
			expect(error).toBeDefined();
			errorMessage = error.message;
		});

		const keys = [faker.string.uuid(), faker.string.uuid()];
		await expect(keyvRedis.getMany(keys)).resolves.toEqual([undefined, undefined]);
		expect(errorMessage).toBe(RedisErrorMessages.RedisClientNotConnected);
	});

	test('should gracefully handle delete with bad redis uri', async () => {
		const keyvRedis = new KeyvRedis(redisBadUri);
		let errorMessage = '';

		keyvRedis.on('error', error => {
			expect(error).toBeDefined();
			errorMessage = error.message;
		});

		await expect(keyvRedis.delete(faker.string.uuid())).resolves.toBe(false);
		expect(errorMessage).toBe(RedisErrorMessages.RedisClientNotConnected);
	});

	test('should gracefully handle deleteMany with bad redis uri', async () => {
		const keyvRedis = new KeyvRedis(redisBadUri);
		let errorMessage = '';

		keyvRedis.on('error', error => {
			expect(error).toBeDefined();
			errorMessage = error.message;
		});

		const keys = [faker.string.uuid(), faker.string.uuid()];
		await expect(keyvRedis.deleteMany(keys)).resolves.toBe(false);
		expect(errorMessage).toBe(RedisErrorMessages.RedisClientNotConnected);
	});
});
