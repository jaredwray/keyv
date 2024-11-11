import {describe, test, expect} from 'vitest';
import {createClient, type RedisClientType} from 'redis';
import {delay} from '@keyv/test-suite';
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

describe('KeyvRedis Methods', () => {
	test('should be able to connect, set, delete, and disconnect', async () => {
		const keyvRedis = new KeyvRedis();
		await keyvRedis.set('foo', 'bar');
		const value = await keyvRedis.get('foo');
		expect(value).toBe('bar');
		const deleted = await keyvRedis.delete('foo');
		expect(deleted).toBe(true);
		await keyvRedis.disconnect();
	});

	test('should be able to set a ttl', async () => {
		const keyvRedis = new KeyvRedis();
		await keyvRedis.set('foo', 'bar', 10);
		await delay(15);
		const value = await keyvRedis.get('foo');
		expect(value).toBeUndefined();
		await keyvRedis.disconnect();
	});

	test('should return false on delete if key does not exist', async () => {
		const keyvRedis = new KeyvRedis();
		const deleted = await keyvRedis.delete('foo');
		expect(deleted).toBe(false);
		await keyvRedis.disconnect();
	});
});
