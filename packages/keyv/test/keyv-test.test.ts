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

	const testData: TestData[] = [];

	beforeEach(() => {
		for (let i = 0; i < 10; i++) {
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
	});
});
