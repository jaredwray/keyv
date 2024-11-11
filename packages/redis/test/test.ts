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

	test('should be able to pass in the url and options to constructor', () => {
		const uri = 'redis://localhost:6379';
		const keyvRedis = new KeyvRedis(uri, {namespace: 'test'});
		expect(keyvRedis.client.options?.url).toBe(uri);
		expect(keyvRedis.namespace).toBe('test');
	});

	test('should be able to pass in the url and options to constructor', () => {
		const uri = 'redis://localhost:6379';
		const options = {
			namespace: 'test',
			keyPrefixSeparator: '->',
			clearBatchSize: 100,
		};
		const keyvRedis = new KeyvRedis(uri, options);
		expect(keyvRedis.client.options?.url).toBe(uri);
		expect(keyvRedis.namespace).toBe('test');
		expect(keyvRedis.keyPrefixSeparator).toBe('->');
		expect(keyvRedis.clearBatchSize).toBe(100);
	});

	test('should be able to get and set properties', () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.namespace = 'test';
		keyvRedis.keyPrefixSeparator = '->';
		keyvRedis.clearBatchSize = 1001;
		expect(keyvRedis.namespace).toBe('test');
		expect(keyvRedis.keyPrefixSeparator).toBe('->');
		expect(keyvRedis.clearBatchSize).toBe(1001);
	});

	test('should be able to get and set opts', () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.opts = {namespace: 'test', keyPrefixSeparator: ':1', clearBatchSize: 2000};
		expect(keyvRedis.opts).toEqual({
			namespace: 'test', keyPrefixSeparator: ':1', clearBatchSize: 2000,
		});
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

	test('if there is a namespace on key prefix', async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.namespace = 'ns1';
		const key = keyvRedis.createKeyPrefix('foo', 'ns2');
		expect(key).toBe('ns2::foo');
	});

	test('if no namespace on key prefix and no default namespace', async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.namespace = undefined;
		const key = keyvRedis.createKeyPrefix('foo');
		expect(key).toBe('foo');
	});

	test('if no namespace on key prefix and no default namespace', async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.namespace = 'ns1';
		const key = keyvRedis.createKeyPrefix('foo');
		expect(key).toBe('ns1::foo');
	});

	test('should do nothing if no keys on clear', async () => {
		const keyvRedis = new KeyvRedis();
		const client = await keyvRedis.getClient();
		await client.flushDb();
		await keyvRedis.clear();
		keyvRedis.namespace = 'ns1';
		await keyvRedis.clear();
		await keyvRedis.disconnect();
	});

	test('should return true on has if key exists', async () => {
		const keyvRedis = new KeyvRedis();
		await keyvRedis.set('hasfoo1', 'bar');
		const exists = await keyvRedis.has('hasfoo1');
		expect(exists).toBe(true);
		await keyvRedis.disconnect();
	});

	test('should return false on has if key does not exist', async () => {
		const keyvRedis = new KeyvRedis();
		const exists = await keyvRedis.has('hasfoo2');
		expect(exists).toBe(false);
		await keyvRedis.disconnect();
	});
});

describe('KeyvRedis Namespace', () => {
	test('should clear with no namespace', async () => {
		const keyvRedis = new KeyvRedis();
		await keyvRedis.set('foo', 'bar');
		await keyvRedis.set('foo2', 'bar2');
		await keyvRedis.set('foo3', 'bar3');
		await keyvRedis.clear();
		const value = await keyvRedis.get('foo');
		expect(value).toBeUndefined();
		await keyvRedis.disconnect();
	});

	test('should clear with no namespace but not the namespace ones', async () => {
		const keyvRedis = new KeyvRedis();
		const client = await keyvRedis.getClient();
		await client.flushDb();
		keyvRedis.namespace = 'ns1';
		await keyvRedis.set('foo', 'bar');
		keyvRedis.namespace = undefined;
		await keyvRedis.set('foo2', 'bar2');
		await keyvRedis.set('foo3', 'bar3');
		await keyvRedis.clear();
		keyvRedis.namespace = 'ns1';
		const value = await keyvRedis.get('foo');
		expect(value).toBe('bar');
		await keyvRedis.disconnect();
	});

	test('should clear namespace but not other ones', async () => {
		const keyvRedis = new KeyvRedis();
		const client = await keyvRedis.getClient();
		await client.flushDb();
		keyvRedis.namespace = 'ns1';
		await keyvRedis.set('foo1', 'bar');
		keyvRedis.namespace = 'ns2';
		await keyvRedis.set('foo2', 'bar2');
		await keyvRedis.clear();
		keyvRedis.namespace = 'ns1';
		const value = await keyvRedis.get('foo1');
		expect(value).toBe('bar');
		await keyvRedis.disconnect();
	});
});

describe('KeyvRedis Iterators', () => {
	test('should be able to iterate over keys', async () => {
		const keyvRedis = new KeyvRedis();
		await keyvRedis.set('foo', 'bar');
		await keyvRedis.set('foo2', 'bar2');
		await keyvRedis.set('foo3', 'bar3');
		const keys = [];
		for await (const [key, value] of keyvRedis.iterator()) {
			keys.push(key);
		}

		expect(keys).toEqual(['foo', 'foo3', 'foo2']);
		await keyvRedis.disconnect();
	});

	test('should be able to iterate over keys by namespace', async () => {
		const keyvRedis = new KeyvRedis();
		const namespace = 'ns1';
		await keyvRedis.set('foo', 'bar');
		await keyvRedis.set('foo2', 'bar2');
		await keyvRedis.set('foo3', 'bar3');
		keyvRedis.namespace = namespace;
		await keyvRedis.set('foo1', 'bar');
		await keyvRedis.set('foo12', 'bar2');
		await keyvRedis.set('foo13', 'bar3');
		const keys = [];
		const values = [];
		for await (const [key, value] of keyvRedis.iterator(namespace)) {
			keys.push(key);
			values.push(value);
		}

		expect(keys).toEqual(['foo1', 'foo12', 'foo13']);
		expect(values).toEqual(['bar', 'bar2', 'bar3']);
		await keyvRedis.disconnect();
	});
});
