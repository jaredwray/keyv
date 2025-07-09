import {
	describe, test, expect, beforeEach,
} from 'vitest';
import {createClient, type RedisClientType} from '@redis/client';
import {delay} from '@keyv/test-suite';
import KeyvRedis, {createKeyv} from '../src/index.js';



describe('KeyvRedis Methods', () => {
	beforeEach(async () => {
		const keyvRedis = new KeyvRedis();
		const client = await keyvRedis.getClient() as RedisClientType;
		await client.flushDb();
		await keyvRedis.disconnect();
	});
	test('should be able to connect, set, delete, and disconnect', async () => {
		const keyvRedis = new KeyvRedis();
		await keyvRedis.set('foo', 'bar');
		const value = await keyvRedis.get('foo');
		expect(value).toBe('bar');
		const deleted = await keyvRedis.delete('foo');
		expect(deleted).toBe(true);
		await keyvRedis.disconnect();
	});

	test('should be able to connect, set, delete, and disconnect using useUnlink to false', async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.useUnlink = false;
		await keyvRedis.set('foo', 'bar');
		const value = await keyvRedis.get('foo');
		expect(value).toBe('bar');
		const deleted = await keyvRedis.delete('foo');
		expect(deleted).toBe(true);
		await keyvRedis.disconnect();
	});

	test('should be able to set a ttl', async () => {
		const keyvRedis = new KeyvRedis();
		await keyvRedis.set('foo76', 'bar', 10);
		await delay(15);
		const value = await keyvRedis.get('foo76');
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
		const key = keyvRedis.createKeyPrefix('foo77', 'ns2');
		expect(key).toBe('ns2::foo77');
	});

	test('if no namespace on key prefix and no default namespace', async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.namespace = undefined;
		const key = keyvRedis.createKeyPrefix('foo78');
		expect(key).toBe('foo78');
	});

	test('should do nothing if no keys on clear', async () => {
		const keyvRedis = new KeyvRedis();
		const client = await keyvRedis.getClient() as RedisClientType;
		await client.flushDb();
		await keyvRedis.clear();
		keyvRedis.namespace = 'ns1';
		await keyvRedis.clear();
		await keyvRedis.disconnect();
	});

	test('should return true on has if key exists', async () => {
		const keyvRedis = new KeyvRedis();
		await keyvRedis.set('hasfoo189', 'bar');
		const exists = await keyvRedis.has('hasfoo189');
		expect(exists).toBe(true);
		await keyvRedis.disconnect();
	});

	test('should return false on has if key does not exist', async () => {
		const keyvRedis = new KeyvRedis();
		const exists = await keyvRedis.has('hasfoo2');
		expect(exists).toBe(false);
		await keyvRedis.disconnect();
	});

	test('should be able to set many keys', async () => {
		const keyvRedis = new KeyvRedis();
		await keyvRedis.setMany([{key: 'foo-many1', value: 'bar'}, {key: 'foo-many2', value: 'bar2'}, {key: 'foo-many3', value: 'bar3', ttl: 5}]);
		const value = await keyvRedis.get('foo-many1');
		expect(value).toBe('bar');
		const value2 = await keyvRedis.get('foo-many2');
		expect(value2).toBe('bar2');
		await delay(10);
		const value3 = await keyvRedis.get('foo-many3');
		expect(value3).toBeUndefined();
		await keyvRedis.disconnect();
	});

	test('should be able to has many keys', async () => {
		const keyvRedis = new KeyvRedis();
		await keyvRedis.setMany([{key: 'foo-has-many1', value: 'bar'}, {key: 'foo-has-many2', value: 'bar2'}, {key: 'foo-has-many3', value: 'bar3', ttl: 5}]);
		await delay(10);
		const exists = await keyvRedis.hasMany(['foo-has-many1', 'foo-has-many2', 'foo-has-many3']);
		expect(exists).toEqual([true, true, false]);
		await keyvRedis.disconnect();
	});

	test('should be able to get many keys', async () => {
		const keyvRedis = new KeyvRedis();
		await keyvRedis.setMany([{key: 'foo-get-many1', value: 'bar'}, {key: 'foo-get-many2', value: 'bar2'}, {key: 'foo-get-many3', value: 'bar3', ttl: 5}]);
		await delay(10);
		const values = await keyvRedis.getMany(['foo-get-many1', 'foo-get-many2', 'foo-get-many3']);
		expect(values).toEqual(['bar', 'bar2', undefined]);
		await keyvRedis.disconnect();
	});

	test('should be able to call getMany with an empty array', async () => {
		const keyvRedis = new KeyvRedis();
		const values = await keyvRedis.getMany([]);
		expect(values).toEqual([]);
		await keyvRedis.disconnect();
	});

	test('should be able to delete many with namespace', async () => {
		const keyvRedis = new KeyvRedis();
		await keyvRedis.setMany([{key: 'foo-dm1', value: 'bar'}, {key: 'foo-dm2', value: 'bar2'}, {key: 'foo-dm3', value: 'bar3', ttl: 5}]);
		await keyvRedis.deleteMany(['foo-dm2', 'foo-dm3']);
		const value = await keyvRedis.get('foo-dm1');
		expect(value).toBe('bar');
		const value2 = await keyvRedis.get('foo-dm2');
		expect(value2).toBeUndefined();
		const value3 = await keyvRedis.get('foo-dm3');
		expect(value3).toBeUndefined();
		await keyvRedis.disconnect();
	});

	test('should be able to delete many with namespace with useUnlink false', async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.useUnlink = false;
		await keyvRedis.setMany([{key: 'foo-dm1', value: 'bar'}, {key: 'foo-dm2', value: 'bar2'}, {key: 'foo-dm3', value: 'bar3', ttl: 5}]);
		await keyvRedis.deleteMany(['foo-dm2', 'foo-dm3']);
		const value = await keyvRedis.get('foo-dm1');
		expect(value).toBe('bar');
		const value2 = await keyvRedis.get('foo-dm2');
		expect(value2).toBeUndefined();
		const value3 = await keyvRedis.get('foo-dm3');
		expect(value3).toBeUndefined();
		await keyvRedis.disconnect();
	});
});



describe('KeyvRedis Iterators', () => {
	beforeEach(async () => {
		const keyvRedis = new KeyvRedis();
		const client = await keyvRedis.getClient() as RedisClientType;
		await client.flushDb();
		await keyvRedis.disconnect();
	});
	test('should be able to iterate over keys', async () => {
		const keyvRedis = new KeyvRedis();
		await keyvRedis.set('foo95', 'bar');
		await keyvRedis.set('foo952', 'bar2');
		await keyvRedis.set('foo953', 'bar3');
		const keys = [];
		for await (const [key] of keyvRedis.iterator()) {
			keys.push(key);
		}

		expect(keys).toContain('foo95');
		expect(keys).toContain('foo952');
		expect(keys).toContain('foo953');
		await keyvRedis.disconnect();
	});

	test('should be able to iterate over keys by namespace', async () => {
		const keyvRedis = new KeyvRedis();
		const namespace = 'ns1';
		await keyvRedis.set('foo96', 'bar');
		await keyvRedis.set('foo962', 'bar2');
		await keyvRedis.set('foo963', 'bar3');
		keyvRedis.namespace = namespace;
		await keyvRedis.set('foo961', 'bar');
		await keyvRedis.set('foo9612', 'bar2');
		await keyvRedis.set('foo9613', 'bar3');
		const keys = [];
		const values = [];
		for await (const [key, value] of keyvRedis.iterator(namespace)) {
			keys.push(key);
			values.push(value);
		}

		expect(keys).toContain('foo961');
		expect(keys).toContain('foo9612');
		expect(keys).toContain('foo9613');
		expect(values).toContain('bar');
		expect(values).toContain('bar2');
		expect(values).toContain('bar3');

		await keyvRedis.disconnect();
	});

	test('should be able to iterate over all keys if namespace is undefined and noNamespaceAffectsAll is true', async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.noNamespaceAffectsAll = true;

		keyvRedis.namespace = 'ns1';
		await keyvRedis.set('foo1', 'bar1');
		keyvRedis.namespace = 'ns2';
		await keyvRedis.set('foo2', 'bar2');
		keyvRedis.namespace = undefined;
		await keyvRedis.set('foo3', 'bar3');

		const keys = [];
		const values = [];
		for await (const [key, value] of keyvRedis.iterator()) {
			keys.push(key);
			values.push(value);
		}

		expect(keys).toContain('ns1::foo1');
		expect(keys).toContain('ns2::foo2');
		expect(keys).toContain('foo3');
		expect(values).toContain('bar1');
		expect(values).toContain('bar2');
		expect(values).toContain('bar3');
	});

	test('should only iterate over keys with no namespace if name is undefined set and noNamespaceAffectsAll is false', async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.noNamespaceAffectsAll = false;

		keyvRedis.namespace = 'ns1';
		await keyvRedis.set('foo1', 'bar1');
		keyvRedis.namespace = 'ns2';
		await keyvRedis.set('foo2', 'bar2');
		keyvRedis.namespace = undefined;
		await keyvRedis.set('foo3', 'bar3');

		const keys = [];
		const values = [];
		for await (const [key, value] of keyvRedis.iterator()) {
			keys.push(key);
			values.push(value);
		}

		expect(keys).toContain('foo3');
		expect(values).toContain('bar3');

		expect(keys).not.toContain('foo1');
		expect(keys).not.toContain('ns1::foo1');
		expect(keys).not.toContain('ns2::foo2');
		expect(keys).not.toContain('foo2');
		expect(values).not.toContain('bar1');
		expect(values).not.toContain('bar2');
	});

	test('should be able to pass undefined on connect to get localhost', async () => {
		const keyv = createKeyv();
		const keyvRedis = keyv.store as KeyvRedis<string>;
		expect((keyvRedis.client as RedisClientType).options?.url).toBe('redis://localhost:6379');
	});

	test('should go to the RedisClientOptions if passed in', async () => {
		const reconnectStrategy = (times: number) => Math.min(times * 50, 2000);

		const keyvRedis = new KeyvRedis({
			socket: {
				host: 'localhost',
				port: 6379,
				reconnectStrategy,
			},
		});

		expect((keyvRedis.client as RedisClientType).options?.socket?.reconnectStrategy).toBe(reconnectStrategy);
	});
});
