import {
	describe, test, expect, beforeEach,
} from 'vitest';
import {faker} from '@faker-js/faker';
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
	});

	describe('throwErrors', async () => {
		test('should get the current throwErrors value', async () => {
			const keyv = new Keyv(new Map());
			expect(keyv.throwErrors).toBe(false);
		});

		test('should set the throwErrors value', async () => {
			const keyv = new Keyv(new Map());
			keyv.throwErrors = true;
			expect(keyv.throwErrors).toBe(true);
		});

		test('should pass in the throwErrors option', async () => {
			const keyv = new Keyv(new Map(), {throwErrors: true});
			expect(keyv.throwErrors).toBe(true);
		});
	});
});
