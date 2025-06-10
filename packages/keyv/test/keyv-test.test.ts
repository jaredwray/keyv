import {
	describe, test, expect, beforeEach,
} from 'vitest';
import {faker} from '@faker-js/faker';
import {Keyv} from '../src/index.js';
import {createKeyv} from '../src/generic-store.js';

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

		test('should use the store to set multiple keys', async () => {
			const map = new Map();
			const keyv = createKeyv(map);
			const result = await keyv.setMany(testData);
			expect(result).toEqual([true, true, true, true, true]);
			const resultValue = await keyv.get(testData[0].key);
			expect(resultValue.value).toEqual(testData[0].value);
		});

		test('should emit and return false on error', async () => {
			const map = new Map();
			map.set = () => {
				throw new Error('Test Error');
			};

			const keyv = createKeyv(map);
			let errorEmitted = false;
			keyv.on('error', () => {
				errorEmitted = true;
			});

			const result = await keyv.setMany(testData);
			expect(result).toEqual([false, false, false, false, false]);
			expect(errorEmitted).toBe(true);
		});
	});

	describe('deleteMany', async () => {
		test('should emit and return false on error', async () => {
			const map = new Map();
			const keyv = createKeyv(map);
			keyv.store.deleteMany = () => {
				throw new Error('Test Error');
			};

			let errorEmitted = false;
			keyv.on('error', () => {
				errorEmitted = true;
			});

			const result = await keyv.deleteMany(testKeys);
			expect(result).toEqual(false);
			expect(errorEmitted).toBe(true);
		});
	});

	describe('getMany', async () => {
		test('should set many items and then get them', async () => {
			const keyv = createKeyv(new Map());
			await keyv.setMany(testData);
			const result = await keyv.getMany(testKeys);
			expect(result.length).toBe(5);
		});

		test('should set many items and then get them with get', async () => {
			const keyv = createKeyv(new Map());
			await keyv.setMany(testData);
			const result = await keyv.get(testKeys);
			expect(result.length).toBe(5);
		});

		test('should set many items and then get them raw', async () => {
			const keyv = createKeyv(new Map());
			await keyv.setMany(testData);
			const result = await keyv.getMany(testKeys, {raw: true});
			expect(result.length).toBe(5);
			expect(result[0]?.value.value).toBe(testData[0].value);
		});
	});

	describe('hasMany', async () => {
		test('should set many items and then check if they exist', async () => {
			const keyv = createKeyv(new Map());
			await keyv.setMany(testData);
			const result = await keyv.hasMany(testKeys);
			expect(result.length).toBe(5);
		});

		test('should use the store hasMany function', async () => {
			const map = new Map();
			const keyv = createKeyv(map);
			keyv.store.hasMany = async () => [true, true, true, true, true];

			await keyv.setMany(testData);
			const result = await keyv.has(testKeys);
			expect(result.length).toBe(5);
		});

		test('should be able to get less on hasMany', async () => {
			const keyv = createKeyv(new Map());
			await keyv.setMany(testData);
			const resultList = await keyv.hasMany(testKeys);
			expect(resultList.length).toBe(5);
			const deleteResult = await keyv.delete(testData[0].key);
			expect(deleteResult).toBe(true);
			const result = await keyv.hasMany(testKeys);
			expect(result.length).toBe(5);
			expect(result[0]).toBe(false);
		});
	});
});
