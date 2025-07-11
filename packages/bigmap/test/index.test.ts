import {describe, expect, it} from 'vitest';
import {faker} from '@faker-js/faker';
import {BigMap} from '../src/index.js';

describe('BigMap Instance', () => {
	it('should create an instance of BigMap', () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap).toBeInstanceOf(BigMap);
	});
});

describe('BigMap Methods', () => {
	it('should set and get values', () => {
		const bigMap = new BigMap<string, number>();
		const data = {
			key: faker.string.uuid(),
			value: faker.number.int({min: 1, max: 100}),
		};

		bigMap.set(data.key, data.value);
		expect(bigMap.get(data.key)).toBe(data.value);
	});

	it('should return undefined for non-existing keys', () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.get('nonExistingKey')).toBeUndefined();
	});

	it('should delete keys', () => {
		const bigMap = new BigMap<string, number>();
		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.number.int({min: 1, max: 100}),
		};

		bigMap.set(data.key, data.value);
		expect(bigMap.delete(data.key)).toBe(true);
		expect(bigMap.get(data.key)).toBeUndefined();
	});

	it('should return false when deleting non-existing keys', () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.delete('nonExistingKey')).toBe(false);
	});

	it('should check if a key exists', () => {
		const bigMap = new BigMap<string, number>();
		const data = {
			key: faker.string.alpha(5),
			value: faker.number.int({min: 1, max: 100}),
		};

		bigMap.set(data.key, data.value);
		expect(bigMap.has(data.key)).toBe(true);
		expect(bigMap.has('nonExistingKey')).toBe(false);
	});

	it('should clear all entries', () => {
		const bigMap = new BigMap<string, number>();
		const data = {
			key: faker.string.alpha(5),
			value: faker.number.int({min: 1, max: 100}),
		};

		bigMap.set(data.key, data.value);
		bigMap.clear();
		expect(bigMap.size).toBe(0);
	});
});

describe('BigMap Iterators', () => {
	it('should iterate over keys', () => {
		const bigMap = new BigMap<string, number>();

		const dataSet = [
			{
				key: faker.string.alpha(5),
				value: faker.number.int({min: 1, max: 100}),
			},
			{
				key: faker.string.alpha(5),
				value: faker.number.int({min: 1, max: 100}),
			},
		];

		for (const data of dataSet) {
			bigMap.set(data.key, data.value);
		}

		const keys: string[] = [];
		for (const key of bigMap.keys()) {
			keys.push(key);
		}

		expect(keys).toEqual([dataSet[0].key, dataSet[1].key]);
	});

	it('should iterate over entries with forEach', () => {
		const bigMap = new BigMap<string, number>();

		const dataSet = [
			{
				key: faker.string.alpha(5),
				value: faker.number.int({min: 1, max: 100}),
			},
			{
				key: faker.string.alpha(5),
				value: faker.number.int({min: 1, max: 100}),
			},
		];

		for (const data of dataSet) {
			bigMap.set(data.key, data.value);
		}

		const entries: Array<[string, number]> = [];
		for (const [key, value] of bigMap.entries()) {
			entries.push([key, value]);
		}

		expect(entries).toEqual([[dataSet[0].key, dataSet[0].value], [dataSet[1].key, dataSet[1].value]]);
	});

	it('should iterate over entries with for..of', () => {
		const bigMap = new BigMap<string, number>();

		const dataSet = [
			{
				key: faker.string.alpha(5),
				value: faker.number.int({min: 1, max: 100}),
			},
			{
				key: faker.string.alpha(5),
				value: faker.number.int({min: 1, max: 100}),
			},
		];

		for (const data of dataSet) {
			bigMap.set(data.key, data.value);
		}

		const entries: Array<[string, number]> = [];
		for (const [key, value] of bigMap.entries()) {
			entries.push([key, value]);
		}

		expect(entries).toEqual([[dataSet[0].key, dataSet[0].value], [dataSet[1].key, dataSet[1].value]]);
	});
});
