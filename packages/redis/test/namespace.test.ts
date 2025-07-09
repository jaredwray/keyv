import {
	describe, test, expect, beforeEach,
} from 'vitest';
import {type RedisClientType} from '@redis/client';
import {delay} from '@keyv/test-suite';
import KeyvRedis from '../src/index.js';

describe('Namespace', () => {
	beforeEach(async () => {
		const keyvRedis = new KeyvRedis();
		const client = await keyvRedis.getClient() as RedisClientType;
		await client.flushDb();
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

	test('should clear with no namespace', async () => {
		const keyvRedis = new KeyvRedis();
		await keyvRedis.set('foo90', 'bar');
		await keyvRedis.set('foo902', 'bar2');
		await keyvRedis.set('foo903', 'bar3');
		await keyvRedis.clear();
		const value = await keyvRedis.get('foo90');
		expect(value).toBeUndefined();
		await keyvRedis.disconnect();
	});

	test('should clear with no namespace and useUnlink to false', async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.useUnlink = false;
		await keyvRedis.set('foo90', 'bar');
		await keyvRedis.set('foo902', 'bar2');
		await keyvRedis.set('foo903', 'bar3');
		await keyvRedis.clear();
		const value = await keyvRedis.get('foo90');
		expect(value).toBeUndefined();
		await keyvRedis.disconnect();
	});

	test('should clear with no namespace but not the namespace ones', async () => {
		const keyvRedis = new KeyvRedis();
		const client = await keyvRedis.getClient() as RedisClientType;
		await client.flushDb();
		keyvRedis.namespace = 'ns1';
		await keyvRedis.set('foo91', 'bar');
		keyvRedis.namespace = undefined;
		await keyvRedis.set('foo912', 'bar2');
		await keyvRedis.set('foo913', 'bar3');
		await keyvRedis.clear();
		keyvRedis.namespace = 'ns1';
		const value = await keyvRedis.get('foo91');
		expect(value).toBe('bar');
		await keyvRedis.disconnect();
	});

	test('should not clear all with no namespace if noNamespaceAffectsAll is false', async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.noNamespaceAffectsAll = false;

		keyvRedis.namespace = 'ns1';
		await keyvRedis.set('foo91', 'bar');
		keyvRedis.namespace = undefined;
		await keyvRedis.set('foo912', 'bar2');
		await keyvRedis.set('foo913', 'bar3');
		await keyvRedis.clear();
		keyvRedis.namespace = 'ns1';
		const value = await keyvRedis.get('foo91');
		expect(value).toBeDefined();
	});

	test('should clear all with no namespace if noNamespaceAffectsAll is true', async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.noNamespaceAffectsAll = true;

		keyvRedis.namespace = 'ns1';
		await keyvRedis.set('foo91', 'bar');
		keyvRedis.namespace = undefined;
		await keyvRedis.set('foo912', 'bar2');
		await keyvRedis.set('foo913', 'bar3');
		await keyvRedis.clear();
		keyvRedis.namespace = 'ns1';
		const value = await keyvRedis.get('foo91');
		expect(value).toBeUndefined();
	});

	test('should clear namespace but not other ones', async () => {
		const keyvRedis = new KeyvRedis();
		const client = await keyvRedis.getClient() as RedisClientType;
		await client.flushDb();
		keyvRedis.namespace = 'ns1';
		await keyvRedis.set('foo921', 'bar');
		keyvRedis.namespace = 'ns2';
		await keyvRedis.set('foo922', 'bar2');
		await keyvRedis.clear();
		keyvRedis.namespace = 'ns1';
		const value = await keyvRedis.get('foo921');
		expect(value).toBe('bar');
		await keyvRedis.disconnect();
	});

	test('should be able to set many keys with namespace', async () => {
		const keyvRedis = new KeyvRedis('redis://localhost:6379', {namespace: 'ns-many1'});
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

	test('should be able to has many keys with namespace', async () => {
		const keyvRedis = new KeyvRedis('redis://localhost:6379', {namespace: 'ns-many2'});
		await keyvRedis.setMany([{key: 'foo-has-many1', value: 'bar'}, {key: 'foo-has-many2', value: 'bar2'}, {key: 'foo-has-many3', value: 'bar3', ttl: 5}]);
		await delay(10);
		const exists = await keyvRedis.hasMany(['foo-has-many1', 'foo-has-many2', 'foo-has-many3']);
		expect(exists).toEqual([true, true, false]);
		await keyvRedis.disconnect();
	});

	test('should be able to delete many with namespace', async () => {
		const keyvRedis = new KeyvRedis('redis://localhost:6379', {namespace: 'ns-dm1'});
		await keyvRedis.setMany([{key: 'foo-delete-many1', value: 'bar'}, {key: 'foo-delete-many2', value: 'bar2'}, {key: 'foo-delete-many3', value: 'bar3', ttl: 5}]);
		await keyvRedis.deleteMany(['foo-delete-many2', 'foo-delete-many3']);
		await delay(10);
		const value = await keyvRedis.get('foo-delete-many1');
		expect(value).toBe('bar');
		const value2 = await keyvRedis.get('foo-delete-many2');
		expect(value2).toBeUndefined();
		const value3 = await keyvRedis.get('foo-delete-many3');
		expect(value3).toBeUndefined();
		await keyvRedis.disconnect();
	});
});
