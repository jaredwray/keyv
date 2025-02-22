import { describe, test, expect } from "vitest";
import { faker } from '@faker-js/faker';
import { Keyv } from '../src/index.js';	

describe('Keyv', async () => {
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
	});
});
