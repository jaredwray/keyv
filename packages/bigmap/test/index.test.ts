/* eslint-disable unicorn/no-array-for-each */
import {get} from 'node:http';
import {describe, expect, it} from 'vitest';
import {faker} from '@faker-js/faker';
import {BigMap, defaultHashFunction} from '../src/index.js';

enum FakeDataType {
	STRING = 'string',
	NUMBER = 'number',
}

function getFake<T>(type: FakeDataType, amount = 1): Array<{key: string; value: T}> {
	if (type === FakeDataType.STRING) {
		return Array.from({length: amount}, () => ({
			key: faker.string.alpha(5),
			value: faker.string.alpha(10) as T,
		}));
	}

	return Array.from({length: amount}, () => ({
		key: faker.string.alpha(5),
		value: faker.number.int({min: 1, max: 100}) as T,
	}));
}

describe('BigMap Instance', () => {
	it('should create an instance of BigMap', () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap).toBeInstanceOf(BigMap);
	});

	it('should initialize with an empty map', () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.size).toBe(0);
		expect(bigMap.get('nonExistingKey')).toBeUndefined();
		expect(bigMap.has('nonExistingKey')).toBe(false);
	});

	it('should allow setting a custom store size', () => {
		const customSize = 10;
		const bigMap = new BigMap<string, number>({storeSize: customSize});
		expect(bigMap.storeSize).toBe(customSize);
	});

	it('should default store size to 4', () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.storeSize).toBe(4);
	});

	it('should throw an error when store size is set to less than 1', () => {
		expect(() => {
			const bigMap = new BigMap<string, number>({storeSize: 0});
		}).toThrow('Store size must be at least 1.');
	});

	it('should throw an error when setting store size less than 1', () => {
		const bigMap = new BigMap<string, number>();
		expect(() => {
			bigMap.storeSize = 0;
		}).toThrow('Store size must be at least 1.');
	});

	it('should allow setting a custom hash function', () => {
		const customHashFunction = (key: string, storeSize: number) => key.length % storeSize;

		const bigMap = new BigMap<string, number>({storeHashFunction: customHashFunction});

		expect(bigMap.storeHashFunction).toBe(customHashFunction);

		bigMap.storeHashFunction = undefined;
		expect(bigMap.storeHashFunction).toBe(defaultHashFunction);
	});

	it('should not throw an error when store size is set to 1', () => {
		const bigMap = new BigMap<string, number>();
		expect(() => {
			bigMap.storeSize = 1;
		}).not.toThrow();
	});

	it('should clear entries when store size is set', () => {
		const bigMap = new BigMap<string, number>();

		const dataSet = getFake<number>(FakeDataType.NUMBER, 2);
		dataSet.forEach(item => {
			bigMap.set(item.key, item.value);
		});

		expect(bigMap.size).toBe(2);

		bigMap.storeSize = 5; // This should clear the map
		expect(bigMap.size).toBe(0);
		expect(bigMap.get(dataSet[0].key)).toBeUndefined();
		expect(bigMap.get(dataSet[1].key)).toBeUndefined();
	});
});

describe('BigMap Methods', () => {
	it('should set and get values', () => {
		const bigMap = new BigMap<string, string>();

		const dataSet = getFake<string>(FakeDataType.STRING, 1);
		dataSet.forEach(item => {
			bigMap.set(item.key, item.value);
		});

		expect(bigMap.get(dataSet[0].key)).toBe(dataSet[0].value);
	});

	it('should handle size with multiple sets, deletes, and clears', () => {
		const bigMap = new BigMap<string, number>();

		const dataSet = getFake<number>(FakeDataType.NUMBER, 5);
		dataSet.forEach(item => {
			bigMap.set(item.key, item.value);
		});

		expect(bigMap.size).toBe(dataSet.length);

		// Delete one item
		bigMap.delete(dataSet[0].key);
		expect(bigMap.size).toBe(dataSet.length - 1);

		// Delete fake key
		expect(bigMap.delete('nonExistingKey')).toBe(false);
		expect(bigMap.size).toBe(dataSet.length - 1);

		// Add a new item
		const newItem = getFake<number>(FakeDataType.NUMBER, 1)[0];
		bigMap.set(newItem.key, newItem.value);
		expect(bigMap.size).toBe(dataSet.length);

		// Set the same key again
		bigMap.set(dataSet[1].key, dataSet[1].value);
		expect(bigMap.size).toBe(dataSet.length);

		// Set a new key
		const anotherNewItem = getFake<number>(FakeDataType.NUMBER, 1)[0];
		bigMap.set(anotherNewItem.key, anotherNewItem.value);
		expect(bigMap.size).toBe(dataSet.length + 1);

		// Delete multiple items
		bigMap.delete(dataSet[2].key);
		bigMap.delete(dataSet[3].key);
		expect(bigMap.size).toBe(dataSet.length - 1);

		// Clear the map
		bigMap.clear();
		expect(bigMap.size).toBe(0);
		expect(bigMap.get(dataSet[0].key)).toBeUndefined();
		expect(bigMap.has(dataSet[0].key)).toBe(false);
		expect(bigMap.delete(dataSet[0].key)).toBe(false);
	});

	it('should return undefined for non-existing keys', () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.get('nonExistingKey')).toBeUndefined();
	});

	it('should delete keys', () => {
		const bigMap = new BigMap<string, number>();
		const data = getFake<number>(FakeDataType.NUMBER, 1)[0];

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
		const data = getFake<number>(FakeDataType.NUMBER, 1)[0];

		bigMap.set(data.key, data.value);
		expect(bigMap.has(data.key)).toBe(true);
		expect(bigMap.has('nonExistingKey')).toBe(false);
	});

	it('should clear all entries', () => {
		const bigMap = new BigMap<string, number>();
		const data = getFake<number>(FakeDataType.NUMBER, 1)[0];

		bigMap.set(data.key, data.value);
		bigMap.clear();
		expect(bigMap.size).toBe(0);
	});
});

describe('BigMap Iterators', () => {
	it('should iterate using for..of', () => {
		const bigMap = new BigMap<string, string>();

		const dataSet = getFake<string>(FakeDataType.STRING, 2);
		for (const data of dataSet) {
			bigMap.set(data.key, data.value);
		}

		const entries: Array<[string, string]> = [];
		for (const [key, value] of bigMap) {
			entries.push([key, value]);
		}

		expect(entries).toEqual([[dataSet[0].key, dataSet[0].value], [dataSet[1].key, dataSet[1].value]]);
	});

	it('should iterate over keys', () => {
		const bigMap = new BigMap<string, number>();

		const dataSet = getFake<number>(FakeDataType.NUMBER, 2);

		for (const data of dataSet) {
			bigMap.set(data.key, data.value);
		}

		const keys: string[] = [];
		for (const key of bigMap.keys()) {
			keys.push(key);
		}

		expect(keys).toEqual([dataSet[0].key, dataSet[1].key]);
	});

	it('should iterate over entries', () => {
		const bigMap = new BigMap<string, number>();

		const dataSet = getFake<number>(FakeDataType.NUMBER, 2);

		for (const data of dataSet) {
			bigMap.set(data.key, data.value);
		}

		const entries: Array<[string, number]> = [];
		for (const [key, value] of bigMap.entries()) {
			entries.push([key, value]);
		}

		expect(entries).toEqual([[dataSet[0].key, dataSet[0].value], [dataSet[1].key, dataSet[1].value]]);
	});

	it('should iterate over keys for forEach function', () => {
		const bigMap = new BigMap<string, string>();

		const dataSet = getFake<string>(FakeDataType.STRING, 2);

		for (const data of dataSet) {
			bigMap.set(data.key, data.value);
		}

		const keys: string[] = [];
		bigMap.forEach((value, key) => {
			keys.push(key);
		});

		expect(keys).toEqual([dataSet[0].key, dataSet[1].key]);
	});

	it('should iterate over entries with for..of', () => {
		const bigMap = new BigMap<string, string>();

		const dataSet = getFake<string>(FakeDataType.STRING, 2);

		for (const data of dataSet) {
			bigMap.set(data.key, data.value);
		}

		const entries: Array<[string, string]> = [];
		for (const [key, value] of bigMap.entries()) {
			entries.push([key, value]);
		}

		expect(entries).toEqual([[dataSet[0].key, dataSet[0].value], [dataSet[1].key, dataSet[1].value]]);
	});

	it('should iterate over values', () => {
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

		const values: number[] = [];
		for (const value of bigMap.values()) {
			values.push(value);
		}

		expect(values).toEqual([dataSet[0].value, dataSet[1].value]);
	});
});

describe('BigMap Hash', () => {
	it('should use the default hash function', () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.storeHashFunction).toBe(defaultHashFunction);
	});

	it('should use a custom hash function', () => {
		const customHashFunction = (key: string, storeSize: number) => key.length % storeSize;
		const bigMap = new BigMap<string, number>({storeHashFunction: customHashFunction});
		expect(bigMap.storeHashFunction).toBe(customHashFunction);
	});

	it('should return the same hash for the same key', () => {
		const bigMap = new BigMap<string, number>();
		const key = 'testKey';
		const hash1 = bigMap.storeHashFunction?.(key, bigMap.storeSize);
		const hash2 = bigMap.storeHashFunction?.(key, bigMap.storeSize);
		expect(hash1).toBe(hash2);
		// Test with a different key
		const differentKey = 'differentKey';
		const hash3 = bigMap.storeHashFunction?.(differentKey, bigMap.storeSize);
		expect(hash1).not.toBe(hash3);
	});
});

describe('BigMap Store', () => {
	it('should initialize the store with empty maps', () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.store).toHaveLength(4);
		for (const map of bigMap.store) {
			expect(map).toBeInstanceOf(Map);
		}
	});

	it('should get the correct store map by index', () => {
		const bigMap = new BigMap<string, number>();
		const map = bigMap.getStoreMap(0);
		expect(map).toBeInstanceOf(Map);
	});

	it('should throw an error for invalid store map index', () => {
		const bigMap = new BigMap<string, number>();
		expect(() => bigMap.getStoreMap(4)).toThrowError('Index out of bounds: 4. Valid range is 0 to 3.');
	});

	it('should be able to get the store from getStore()', () => {
		const bigMap = new BigMap<string, number>();
		const key = 'testKey';
		const store = bigMap.getStore(key);
		expect(store).toBeInstanceOf(Map);
	});

	it('should get the store from a custom hash function', () => {
		const customHashFunction = (key: string, storeSize: number) => key.length % storeSize;
		const bigMap = new BigMap<string, number>({storeHashFunction: customHashFunction});
		const key = 'testKey';
		const store = bigMap.getStore(key);
		expect(store).toBeInstanceOf(Map);
		expect(bigMap.storeHashFunction).toBe(customHashFunction);
	});
});

describe('BigMap Set / Get', () => {
	it('should set and get values', () => {
		const bigMap = new BigMap<string, number>();
		const key = 'testKey';
		const value = 42;
		bigMap.set(key, value);
		expect(bigMap.get(key)).toBe(value);
	});
});
