import process from 'node:process';
import {
	describe, test, expect,
} from 'vitest';
import {faker} from '@faker-js/faker';
import KeyvRedis, {createKeyv, createKeyvNonBlocking} from '../src/index.js';

const redisUri = process.env.REDIS_URI ?? 'redis://localhost:6379';

describe('createKeyv', () => {
	test('should create Keyv instance with default options', async () => {
		const keyv = createKeyv(redisUri);
		expect(keyv).toBeDefined();
		expect(keyv.store).toBeInstanceOf(KeyvRedis);
		expect(keyv.namespace).toBeUndefined();
		expect(keyv.store.namespace).toBeUndefined();
		expect(keyv.useKeyPrefix).toBe(false);
	});

	test('should create Keyv instance with custom namespace', async () => {
		const namespace = faker.string.alphanumeric(10);
		const keyv = createKeyv(redisUri, {namespace});
		expect(keyv).toBeDefined();
		expect(keyv.store).toBeInstanceOf(KeyvRedis);
		expect(keyv.namespace).toBe(namespace);
		expect(keyv.store.namespace).toBe(namespace);
		expect(keyv.useKeyPrefix).toBe(false);
	});

	test('should create Keyv instance with custom namespace and errors enabled', async () => {
		const namespace = faker.string.alphanumeric(10);
		const keyv = createKeyv(redisUri, {namespace, throwOnErrors: true, throwOnConnectError: true});
		expect(keyv).toBeDefined();
		expect(keyv.store).toBeInstanceOf(KeyvRedis);
		expect(keyv.namespace).toBe(namespace);
		expect(keyv.store.namespace).toBe(namespace);
		expect(keyv.useKeyPrefix).toBe(false);
	});
});

describe('createKeyvNonBlocking', () => {
	test('should create Keyv instance with default options', async () => {
		const keyv = createKeyvNonBlocking(redisUri);
		expect(keyv).toBeDefined();
		expect(keyv.throwOnErrors).toBe(false);
		expect(keyv.store).toBeInstanceOf(KeyvRedis);
		expect(keyv.store.throwOnErrors).toBe(false);
		expect(keyv.store.throwOnConnectError).toBe(false);
		expect(keyv.namespace).toBeUndefined();
		expect(keyv.store.namespace).toBeUndefined();
		expect(keyv.useKeyPrefix).toBe(false);
	});
});
