import {
	describe, test, expect, beforeEach, vi,
} from 'vitest';
import {faker, th} from '@faker-js/faker';
import {Keyv} from '../src/index.js';

describe('Keyv', async () => {
	type TestData = {
		key: string;
		value: string;
	};

	let testData: TestData[] = [];

	let testKeys: string[] = [];

	beforeEach(() => {
		testData = [];
		for (let i = 0; i < 5; i++) {
			testData.push({
				key: faker.string.alphanumeric(10),
				value: faker.string.alphanumeric(10),
			});
		}

		testKeys = testData.map(data => data.key);
	});

	describe('constructor', async () => {
		test('should be able to create a new instance', async () => {
			const keyv = new Keyv();
			expect(keyv).toBeDefined();
		});

		test('should be able to create a new instance with a store', async () => {
			const keyv = new Keyv(new Map());
			expect(keyv).toBeDefined();
		});

		test('when setting store property with undefined it should default to Map', async () => {
			const store = undefined;
			const keyv = new Keyv({store});
			expect(keyv.store).toBeInstanceOf(Map);
		});
	});

	describe('setMany', async () => {
		test('the function exists', async () => {
			const keyv = new Keyv();
			expect(keyv.setMany).toBeDefined();
		});

		test('returns a promise that is empty if nothing is sent in', async () => {
			const keyv = new Keyv();
			const result = await keyv.setMany([]);
			expect(result.length).toEqual(0);
		});

		test('returns multiple responses on in memory storage', async () => {
			const keyv = new Keyv();
			const result = await keyv.setMany(testData);
			expect(result.length).toEqual(testData.length);
			const resultValue = await keyv.get(testData[0].key);
			expect(resultValue).toEqual(testData[0].value);
		});

		test('does not call set when setMany is available', async () => {
			// eslint-disable-next-line max-nested-callbacks
			const setManyMock = vi.fn((data: TestData[]) => data.map(() => true));
			const store = Object.assign(new Map(), {setMany: setManyMock});
			const setSpy = vi.spyOn(store, 'set');
			const keyv = new Keyv(store);

			await keyv.setMany(testData);
			expect(setManyMock).toHaveBeenCalled();
			expect(setSpy).not.toHaveBeenCalled();
		});
	});

	describe('throwErrors', async () => {
		const throwingStore = new Map();
		throwingStore.get = () => {
			throw new Error('Test error');
		};

		throwingStore.set = () => {
			throw new Error('Test error');
		};

		throwingStore.delete = () => {
			throw new Error('Test error');
		};

		throwingStore.clear = () => {
			throw new Error('Test error');
		};

		throwingStore.has = () => {
			throw new Error('Test error');
		};

		test('should get the current throwOnErrors value', async () => {
			const keyv = new Keyv(throwingStore);
			expect(keyv.throwOnErrors).toBe(false);
		});

		test('should set the throwOnErrors value', async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = true;
			expect(keyv.throwOnErrors).toBe(true);
		});

		test('should pass in the throwOnErrors option', async () => {
			const keyv = new Keyv({store: throwingStore, throwOnErrors: true});
			expect(keyv.throwOnErrors).toBe(true);
		});

		test('should throw when setting a value', async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = true;
			await expect(keyv.set('key', 'value')).rejects.toThrow('Test error');
		});

		test('should not throw when setting a value with throwOnErrors set to false', async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = false;
			const result = await keyv.set(faker.string.alphanumeric(10), faker.string.alphanumeric(10));
			expect(result).toBe(false);
		});

		test('should throw when getting a value', async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = true;
			await expect(keyv.get('key')).rejects.toThrow('Test error');
		});

		test('should not throw when getting a value with throwOnErrors set to false', async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = false;
			const result = await keyv.get(faker.string.alphanumeric(10));
			expect(result).toBeUndefined();
		});

		test('should throw when deleting a value', async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = true;
			await expect(keyv.delete('key')).rejects.toThrow('Test error');
		});

		test('should not throw when deleting a value with throwOnErrors set to false', async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = false;
			const result = await keyv.delete(faker.string.alphanumeric(10));
			expect(result).toBe(false);
		});

		test('should throw when clearing the store', async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = true;
			await expect(keyv.clear()).rejects.toThrow('Test error');
		});

		test('should not throw when clearing the store with throwOnErrors set to false', async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = false;
			const result = await keyv.clear();
			expect(result).toBeUndefined();
		});

		test('should throw when checking if a key exists', async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = true;
			await expect(keyv.has('key')).rejects.toThrow('Test error');
		});

		test('should not throw when checking if a key exists with throwOnErrors set to false', async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = false;
			const result = await keyv.has(faker.string.alphanumeric(10));
			expect(result).toBe(false);
		});

		test('should throw when deleting multiple keys', async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = true;
			await expect(keyv.deleteMany(testKeys)).rejects.toThrow('Test error');
		});

		test('should throw when setting multiple keys', async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = true;
			await expect(keyv.setMany(testData)).rejects.toThrow('Test error');
		});
	});
});
