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

	beforeEach(() => {
		testData = [];
		for (let i = 0; i < 5; i++) {
			testData.push({
				key: faker.string.alphanumeric(10),
				value: faker.string.alphanumeric(10),
			});
		}
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
			expect(result.length).toEqual(testData.length);
			const resultValue = await keyv.get(testData[0].key);
			expect(resultValue).toEqual(testData[0].value);
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

		test('should set many items on keyv set function with array', async () => {
			const keyv = createKeyv(new Map());
			const result = await keyv.set(testData);
			expect(result.length).toBe(5);
		});
	});
});
