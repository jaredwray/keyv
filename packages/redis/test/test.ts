import {describe, test, expect} from 'vitest';
import {createClient, type RedisClientType} from 'redis';
import KeyvRedis from '../src/index.js';

describe('KeyvRedis', () => {
	test('should be a class', () => {
		expect(KeyvRedis).toBeInstanceOf(Function);
	});

	test('should have a client property', () => {
		const keyvRedis = new KeyvRedis();
		expect(keyvRedis.client).toBeDefined();
	});

	test('should be able to set the client property', () => {
		const keyvRedis = new KeyvRedis();
		const client = createClient() as RedisClientType;
		keyvRedis.client = client;
		expect(keyvRedis.client).toBe(client);
	});

	test('should be able to pass in a client to constructor', () => {
		const client = createClient() as RedisClientType;
		const keyvRedis = new KeyvRedis(client);
		expect(keyvRedis.client).toBe(client);
	});

	test('should be able to pass in client options to constructor', () => {
		const uri = 'redis://foo:6379';
		const keyvRedis = new KeyvRedis({url: uri});
		expect(keyvRedis.client.options?.url).toBe(uri);
	});
});
