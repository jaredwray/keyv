import {describe, test, expect} from 'vitest';
import {KeyvGenericStore} from '../src/generic-store.js';

// eslint-disable-next-line no-promise-executor-return
const sleep = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Keyv Generic Store Options', () => {
	test('should accept a store as the first argument', () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		expect(keyv.store).toBe(store);
		const newStore = new Map();
		keyv.store = newStore;
		expect(keyv.store).toBe(newStore);
	});

	test('should set the namespace option', () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store, {namespace: 'test'});
		expect(keyv.namespace).toBe('test');
	});

	test('should be able to set get the keySeparator', () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store, {keySeparator: 'test'});
		expect(keyv.keySeparator).toBe('test');
		keyv.keySeparator = 'new';
		expect(keyv.keySeparator).toBe('new');
	});

	test('should be able to get the features', () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		expect(keyv.features.createKeyv).toBe(false);
		expect(keyv.features.iterable).toBe(true);
		expect(keyv.features.serialization).toBe(true);
		expect(keyv.features.namespace).toBe(true);
		expect(keyv.features.timeToLive).toBe(true);
	});

	test('should be able to get the options', () => {
		const store = new Map();
		const options = {namespace: 'test'};
		const keyv = new KeyvGenericStore(store, options);
		expect(keyv.opts).toEqual(options);
	});
});

describe('Keyv Generic Store Namespace', () => {
	test('should return the namespace if it is a string', () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store, {namespace: 'test'});
		expect(keyv.getNamespace()).toBe('test');
	});

	test('should return the namespace if it is a function', () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store, {namespace: () => 'test'});
		expect(keyv.getNamespace()).toBe('test');
	});

	test('should set the namespace', () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		keyv.namespace = 'test';
		expect(keyv.namespace).toBe('test');
	});

	test('should set the namespace as a function', () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		expect(keyv.namespace).toBe(undefined);
		keyv.setNamespace(() => 'test');
		expect(keyv.namespace).toBe('test');
	});

	test('should set the key prefix', () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		expect(keyv.getKeyPrefix('key1', 'ns1')).toBe('ns1::key1');
		expect(keyv.getKeyPrefix('key1')).toBe('key1');
	});

	test('should get the key prefix data', () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		expect(keyv.getKeyPrefixData('ns1::key1')).toEqual({key: 'key1', namespace: 'ns1'});
		expect(keyv.getKeyPrefixData('key1')).toEqual({key: 'key1', namespace: undefined});
	});
});

describe('Keyv Generic set / get / has Operations', () => {
	test('should set a value', async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		await keyv.set('key1', 'value1');
		expect(await keyv.get('key1')).toBe('value1');
	});

	test('should get undefined for a non-existent key', async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		expect(await keyv.get('key1')).toBe(undefined);
	});

	test('should handle get with a ttl and expiration', async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		await keyv.set('key1', {val: 'value1'}, 10);
		await sleep(20);
		expect(await keyv.get('key1')).toBe(undefined);
	});

	test('should handle has', async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		await keyv.set('key1', 'value1');
		expect(await keyv.has('key1')).toBe(true);
		expect(await keyv.has('key2')).toBe(false);
	});

	test('should be able to get many keys', async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		await keyv.set('key1', 'value1');
		await keyv.set('key2', 'value2');
		await keyv.set('key3', 'value3');
		const values = await keyv.getMany(['key1', 'key2', 'key3', 'key4']);
		expect(values[0] as string).toBe('value1');
		expect(values[1] as string).toBe('value2');
		expect(values[2] as string).toBe('value3');
		expect(values[3]).toBe(undefined);
	});
});

describe('Keyv Generic Delete / Clear Operations', () => {
	test('should delete a key', async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		await keyv.set('key1', 'value1');
		await keyv.delete('key1');
		expect(await keyv.get('key1')).toBe(undefined);
	});

	test('should clear all keys', async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		await keyv.set('key1', 'value1');
		await keyv.clear();
		expect(await keyv.get('key1')).toBe(undefined);
	});

	test('should delete many keys', async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		await keyv.set('key1', 'value1');
		await keyv.set('key2', 'value2');
		await keyv.set('key3', 'value3');
		await keyv.deleteMany(['key1', 'key2']);
		expect(await keyv.get('key1')).toBe(undefined);
		expect(await keyv.get('key2')).toBe(undefined);
		expect(await keyv.get('key3')).toBe('value3');
	});
});
