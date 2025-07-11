import {describe, expect, it} from 'vitest';
import {BigMap} from '../src/index.js';

describe('BigMap', () => {
	it('should create an instance of BigMap', () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap).toBeInstanceOf(BigMap);
	});

	it('should set and get values', () => {
		const bigMap = new BigMap<string, number>();
		bigMap.set('key1', 1);
		expect(bigMap.get('key1')).toBe(1);
	});

	it('should return undefined for non-existing keys', () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.get('nonExistingKey')).toBeUndefined();
	});

	it('should delete keys', () => {
		const bigMap = new BigMap<string, number>();
		bigMap.set('key2', 2);
		expect(bigMap.delete('key2')).toBe(true);
		expect(bigMap.get('key2')).toBeUndefined();
	});

	it('should return false when deleting non-existing keys', () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.delete('nonExistingKey')).toBe(false);
	});

	it('should check if a key exists', () => {
		const bigMap = new BigMap<string, number>();
		bigMap.set('key3', 3);
		expect(bigMap.has('key3')).toBe(true);
		expect(bigMap.has('nonExistingKey')).toBe(false);
	});

	it('should clear all entries', () => {
		const bigMap = new BigMap<string, number>();
		bigMap.set('key4', 4);
		bigMap.clear();
		expect(bigMap.size).toBe(0);
	});

	it('should iterate over entries with forEach', () => {
		const bigMap = new BigMap<string, number>();
		bigMap.set('key5', 5);
		bigMap.set('key6', 6);

		const entries: Array<[string, number]> = [];
		for (const [key, value] of bigMap.entries()) {
			entries.push([key, value]);
		}

		expect(entries).toEqual([['key5', 5], ['key6', 6]]);
	});
});
