import process from 'node:process';
import {
	describe, test, expect, beforeEach
} from 'vitest';
import {createClient, type RedisClientType} from '@redis/client';
import {delay} from '@keyv/test-suite';
import KeyvRedis, {createKeyv} from '../src/index.js';

const redisUri = process.env.REDIS_URI ?? 'redis://localhost:6379';

describe('KeyvRedis', () => {
	test('should be a class', () => {
		expect(KeyvRedis).toBeInstanceOf(Function);
	});

	test('should have a client property', () => {
		const keyvRedis = new KeyvRedis();
		expect(keyvRedis.client).toBeDefined();
	});

	test('should be able to create Keyv instance', async () => {
		const keyv = createKeyv('redis://localhost:6379', {namespace: 'test'});
		expect(keyv).toBeDefined();
		expect(keyv.namespace).toBe('test');
		expect(keyv.store.namespace).toBe('test');
		await keyv.set('mykey', 'myvalue');
		await keyv.set('mykey2', {foo: 'bar'});
		const value = await keyv.get<string>('mykey');
		expect(value).toBe('myvalue');
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const value2 = await keyv.get('mykey2');
		expect(value2).toEqual({foo: 'bar'});
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
		expect((keyvRedis.client as RedisClientType).options?.url).toBe(uri);
	});

	test('should be able to pass in the url and options to constructor', () => {
		const uri = 'redis://localhost:6379';
		const keyvRedis = new KeyvRedis(uri, {namespace: 'test'});
		expect((keyvRedis.client as RedisClientType).options?.url).toBe(uri);
		expect(keyvRedis.namespace).toBe('test');
	});

	test('should be able to pass in the url and options to constructor', () => {
		const uri = 'redis://localhost:6379';
		const options = {
			namespace: 'test',
			keyPrefixSeparator: '->',
			clearBatchSize: 100,
			useUnlink: true,
			noNamespaceAffectsAll: true,
		};
		const keyvRedis = new KeyvRedis(uri, options);
		expect(keyvRedis.namespace).toBe('test');
		expect(keyvRedis.keyPrefixSeparator).toBe('->');
		expect(keyvRedis.clearBatchSize).toBe(100);
		expect(keyvRedis.useUnlink).toBe(true);
		expect(keyvRedis.noNamespaceAffectsAll).toBe(true);
	});

	test('should be able to get and set properties', () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.namespace = 'test';
		keyvRedis.keyPrefixSeparator = '->';
		keyvRedis.clearBatchSize = 1001;
		keyvRedis.useUnlink = false;
		expect(keyvRedis.namespace).toBe('test');
		expect(keyvRedis.keyPrefixSeparator).toBe('->');
		expect(keyvRedis.clearBatchSize).toBe(1001);
		expect(keyvRedis.useUnlink).toBe(false);
	});

	test('keyPrefixSeparator should be able to set to blank string', () => {
		const keyvRedis = new KeyvRedis('redis://localhost:6379', {keyPrefixSeparator: ''});
		expect(keyvRedis.keyPrefixSeparator).toBe('');
		keyvRedis.keyPrefixSeparator = '->';
		expect(keyvRedis.keyPrefixSeparator).toBe('->');
		keyvRedis.keyPrefixSeparator = '';
		expect(keyvRedis.keyPrefixSeparator).toBe('');
	});

	test('clearBatchSize should not set if 0 or less than', () => {
		const keyvRedis = new KeyvRedis('redis://localhost:6379', {clearBatchSize: 0});
		expect(keyvRedis.clearBatchSize).toBe(1000);
		keyvRedis.clearBatchSize = 200;
		expect(keyvRedis.clearBatchSize).toBe(200);
		let error = '';
		keyvRedis.on('error', message => {
			error = message as string;
		});
		keyvRedis.clearBatchSize = -1;
		expect(error).toBe('clearBatchSize must be greater than 0');
		expect(keyvRedis.clearBatchSize).toBe(200);
	});

	test('should be able to get and set opts', async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.opts = {
			namespace: 'test', keyPrefixSeparator: ':1', clearBatchSize: 2000, noNamespaceAffectsAll: true,
		};

		expect(keyvRedis.opts).toEqual({
			namespace: 'test',
			keyPrefixSeparator: ':1',
			clearBatchSize: 2000,
			dialect: 'redis',
			url: 'redis://localhost:6379',
			noNamespaceAffectsAll: true,
			throwErrors: false,
			throwOnConnectError: true,
			useUnlink: true,
		});
	});

	test('should get and set throwOnConnectError', async () => {
		const keyvRedis = new KeyvRedis(redisUri, {throwOnConnectError: true});
		const client = await keyvRedis.getClient();
		expect(client).toBeDefined();

		expect(keyvRedis.throwOnConnectError).toBe(true);
		keyvRedis.throwOnConnectError = false;
		expect(keyvRedis.throwOnConnectError).toBe(false);
		keyvRedis.throwOnConnectError = true;
		expect(keyvRedis.throwOnConnectError).toBe(true);
	});

	test('should get and set throwErrors', async () => {
		const keyvRedis = new KeyvRedis(redisUri, {throwErrors: true});
		const client = await keyvRedis.getClient();
		expect(client).toBeDefined();
		expect(keyvRedis.throwErrors).toBe(true);
		keyvRedis.throwErrors = false;
		expect(keyvRedis.throwErrors).toBe(false);
		keyvRedis.throwErrors = true;
		expect(keyvRedis.throwErrors).toBe(true);
	});
});

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

	test('should do nothing if no keys on clear', async () => {
		const keyvRedis = new KeyvRedis();
		const client = await keyvRedis.getClient() as RedisClientType;
		await client.flushDb();
		await keyvRedis.clear();
		keyvRedis.namespace = 'ns1';
		await keyvRedis.clear();
		await keyvRedis.disconnect();
	});
});
