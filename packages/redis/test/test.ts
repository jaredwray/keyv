import {describe, test, expect} from 'vitest';
import KeyvRedis from '../src/index.js';

describe('KeyvRedis', () => {
	test('should be a class', () => {
		expect(KeyvRedis).toBeInstanceOf(Function);
	});
});
