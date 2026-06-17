import { faker } from "@faker-js/faker";
import type { KeyvMemoryAdapter } from "keyv";
import { describe, expect, test } from "vitest";
import { BigMap, BigMapEvents, createKeyv, defaultHashFunction } from "../src/index.js";

enum FakeDataType {
	STRING = "string",
	NUMBER = "number",
}

type FakeEntry<T> = { key: string; value: T };

/**
 * Generates an array of fake entries with guaranteed-unique keys so that
 * assertions on size and per-key values are never flaky.
 */
function fakeEntries<T>(type: FakeDataType, amount = 1): Array<FakeEntry<T>> {
	const entries: Array<FakeEntry<T>> = [];
	const seen = new Set<string>();

	while (entries.length < amount) {
		const key = faker.string.alphanumeric(12);
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		const value = (
			type === FakeDataType.STRING
				? faker.string.alpha(10)
				: faker.number.int({ min: 1, max: 1000 })
		) as T;
		entries.push({ key, value });
	}

	return entries;
}

/**
 * Convenience helper for tests that only need a single fake entry.
 */
function fakeEntry<T>(type: FakeDataType): FakeEntry<T> {
	return fakeEntries<T>(type, 1)[0];
}

describe("BigMap Instance", () => {
	test("should create an instance of BigMap", () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap).toBeInstanceOf(BigMap);
	});

	test("should initialize with an empty map", () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.size).toBe(0);
		expect(bigMap.get(faker.string.alpha(5))).toBeUndefined();
		expect(bigMap.has(faker.string.alpha(5))).toBe(false);
	});

	test("should default the store size to 2", () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.storeSize).toBe(2);
	});

	test("should allow setting a custom store size", () => {
		const customSize = 10;
		const bigMap = new BigMap<string, number>({ storeSize: customSize });
		expect(bigMap.storeSize).toBe(customSize);
	});

	test("should throw an error when constructed with a store size less than 1", () => {
		expect(() => new BigMap<string, number>({ storeSize: 0 })).toThrow(
			"Store size must be at least 1.",
		);
	});

	test("should throw an error when the store size is set to less than 1", () => {
		const bigMap = new BigMap<string, number>();
		expect(() => {
			bigMap.storeSize = 0;
		}).toThrow("Store size must be at least 1.");
	});

	test("should not throw an error when the store size is set to 1", () => {
		const bigMap = new BigMap<string, number>();
		expect(() => {
			bigMap.storeSize = 1;
		}).not.toThrow();
	});

	test("should allow setting a custom hash function", () => {
		const customHashFunction = (key: string, storeSize: number) => key.length % storeSize;
		const bigMap = new BigMap<string, number>({ storeHashFunction: customHashFunction });
		expect(bigMap.storeHashFunction).toBe(customHashFunction);

		bigMap.storeHashFunction = undefined;
		expect(bigMap.storeHashFunction).toBe(defaultHashFunction);
	});

	test("should clear entries when the store size is set", () => {
		const bigMap = new BigMap<string, number>();
		const entries = fakeEntries<number>(FakeDataType.NUMBER, 2);
		for (const { key, value } of entries) {
			bigMap.set(key, value);
		}

		expect(bigMap.size).toBe(2);

		bigMap.storeSize = 5; // This should clear the map
		expect(bigMap.size).toBe(0);
		expect(bigMap.get(entries[0].key)).toBeUndefined();
		expect(bigMap.get(entries[1].key)).toBeUndefined();
	});

	test("should report the correct size after sets and deletes", () => {
		const bigMap = new BigMap<string, number>({ storeSize: 3 });
		const entries = fakeEntries<number>(FakeDataType.NUMBER, 50);
		for (const { key, value } of entries) {
			bigMap.set(key, value);
		}

		expect(bigMap.size).toBe(50);

		for (let i = 0; i < 20; i++) {
			bigMap.delete(entries[i].key);
		}

		expect(bigMap.size).toBe(30);
	});
});

describe("BigMap Events", () => {
	test("should expose hookified event methods", () => {
		const bigMap = new BigMap<string, number>();
		expect(typeof bigMap.on).toBe("function");
		expect(typeof bigMap.once).toBe("function");
		expect(typeof bigMap.emit).toBe("function");
	});

	test("should emit a set event with the key and value", () => {
		const bigMap = new BigMap<string, number>();
		const { key, value } = fakeEntry<number>(FakeDataType.NUMBER);
		const received: FakeEntry<number>[] = [];
		bigMap.on(BigMapEvents.SET, (k: string, v: number) => {
			received.push({ key: k, value: v });
		});

		bigMap.set(key, value);

		expect(received).toEqual([{ key, value }]);
	});

	test("should emit a delete event with the key when an entry is removed", () => {
		const bigMap = new BigMap<string, number>();
		const { key, value } = fakeEntry<number>(FakeDataType.NUMBER);
		bigMap.set(key, value);

		let received: string | undefined;
		bigMap.on(BigMapEvents.DELETE, (k: string) => {
			received = k;
		});

		bigMap.delete(key);

		expect(received).toBe(key);
	});

	test("should not emit a delete event when the key does not exist", () => {
		const bigMap = new BigMap<string, number>();
		let emitted = false;
		bigMap.on(BigMapEvents.DELETE, () => {
			emitted = true;
		});

		expect(bigMap.delete(faker.string.alpha(5))).toBe(false);
		expect(emitted).toBe(false);
	});

	test("should emit a clear event when the map is cleared", () => {
		const bigMap = new BigMap<string, number>();
		let emitted = false;
		bigMap.on(BigMapEvents.CLEAR, () => {
			emitted = true;
		});

		bigMap.clear();

		expect(emitted).toBe(true);
	});
});

describe("BigMap Iterators", () => {
	test("should iterate using for..of", () => {
		const bigMap = new BigMap<string, string>();
		const entries = fakeEntries<string>(FakeDataType.STRING, 3);
		for (const { key, value } of entries) {
			bigMap.set(key, value);
		}

		const result: Array<[string, string]> = [];
		for (const [key, value] of bigMap) {
			result.push([key, value]);
		}

		expect(result.length).toBe(3);
		for (const [key, value] of result) {
			expect(entries.some((entry) => entry.key === key && entry.value === value)).toBe(true);
		}
	});

	test("should iterate over keys", () => {
		const bigMap = new BigMap<string, number>();
		const entries = fakeEntries<number>(FakeDataType.NUMBER, 2);
		for (const { key, value } of entries) {
			bigMap.set(key, value);
		}

		const keys = [...bigMap.keys()];
		expect(keys.length).toBe(2);
		expect(keys).toContain(entries[0].key);
		expect(keys).toContain(entries[1].key);
	});

	test("should iterate over values", () => {
		const bigMap = new BigMap<string, number>();
		const entries = fakeEntries<number>(FakeDataType.NUMBER, 2);
		for (const { key, value } of entries) {
			bigMap.set(key, value);
		}

		const values = [...bigMap.values()];
		expect(values.length).toBe(2);
		expect(values).toContain(entries[0].value);
		expect(values).toContain(entries[1].value);
	});

	test("should iterate over entries", () => {
		const bigMap = new BigMap<string, number>();
		const entries = fakeEntries<number>(FakeDataType.NUMBER, 2);
		for (const { key, value } of entries) {
			bigMap.set(key, value);
		}

		const result = [...bigMap.entries()];
		expect(result.length).toBe(2);
		for (const [key, value] of result) {
			expect(entries.some((entry) => entry.key === key && entry.value === value)).toBe(true);
		}
	});

	test("should iterate over keys with forEach", () => {
		const bigMap = new BigMap<string, string>();
		const entries = fakeEntries<string>(FakeDataType.STRING, 2);
		for (const { key, value } of entries) {
			bigMap.set(key, value);
		}

		const keys: string[] = [];
		bigMap.forEach((_value, key) => {
			keys.push(key);
		});

		expect(keys).toContain(entries[0].key);
		expect(keys).toContain(entries[1].key);
	});

	test("should pass the BigMap instance as the third argument in forEach", () => {
		const bigMap = new BigMap<string, number>();
		const entries = fakeEntries<number>(FakeDataType.NUMBER, 2);
		for (const { key, value } of entries) {
			bigMap.set(key, value);
		}

		bigMap.forEach((_value, _key, map) => {
			expect(map).toBe(bigMap);
		});
	});

	test("should apply thisArg correctly in forEach", () => {
		const bigMap = new BigMap<string, number>();
		const entries = fakeEntries<number>(FakeDataType.NUMBER, 3);
		for (const { key, value } of entries) {
			bigMap.set(key, value);
		}

		const expectedSum = entries.reduce((sum, { value }) => sum + value, 0);
		const context = { sum: 0 };
		bigMap.forEach(function (value) {
			this.sum += value;
		}, context);

		expect(context.sum).toBe(expectedSum);
	});
});

describe("BigMap Hash", () => {
	test("should use the default hash function", () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.storeHashFunction).toBe(defaultHashFunction);
	});

	test("should use a custom hash function", () => {
		const customHashFunction = (key: string, storeSize: number) => key.length % storeSize;
		const bigMap = new BigMap<string, number>({ storeHashFunction: customHashFunction });
		expect(bigMap.storeHashFunction).toBe(customHashFunction);
	});

	test("should return the same hash for the same key", () => {
		const bigMap = new BigMap<string, number>();
		// Fixed keys are used here because the assertion depends on two specific
		// keys landing in different buckets, which random keys cannot guarantee.
		const hash1 = bigMap.storeHashFunction?.("testKey", bigMap.storeSize);
		const hash2 = bigMap.storeHashFunction?.("testKey", bigMap.storeSize);
		const hash3 = bigMap.storeHashFunction?.("differentKey", bigMap.storeSize);
		expect(hash1).toBe(hash2);
		expect(hash1).not.toBe(hash3);
	});

	test("should update the hash function via the setter", () => {
		const bigMap = new BigMap<string, number>();
		const customHashFunction = (key: string, storeSize: number) => key.length % storeSize;
		bigMap.storeHashFunction = customHashFunction;
		expect(bigMap.storeHashFunction).toBe(customHashFunction);

		const { key, value } = fakeEntry<number>(FakeDataType.NUMBER);
		bigMap.set(key, value);
		expect(bigMap.get(key)).toBe(value);
	});
});

describe("BigMap Store", () => {
	test("should initialize the store with empty maps", () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.store).toHaveLength(2);
		for (const map of bigMap.store) {
			expect(map).toBeInstanceOf(Map);
		}
	});

	test("should get the correct store map by index", () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.getStoreMap(0)).toBeInstanceOf(Map);
	});

	test("should throw an error for an invalid store map index", () => {
		const bigMap = new BigMap<string, number>();
		expect(() => bigMap.getStoreMap(2)).toThrowError(
			"Index out of bounds: 2. Valid range is 0 to 1.",
		);
	});

	test("should get the store for a key via getStore()", () => {
		const bigMap = new BigMap<string, number>();
		const store = bigMap.getStore(faker.string.alpha(8));
		expect(store).toBeInstanceOf(Map);
	});

	test("should get the store for a key with a custom hash function", () => {
		const customHashFunction = (key: string, storeSize: number) => key.length % storeSize;
		const bigMap = new BigMap<string, number>({ storeHashFunction: customHashFunction });
		const store = bigMap.getStore(faker.string.alpha(8));
		expect(store).toBeInstanceOf(Map);
		expect(bigMap.storeHashFunction).toBe(customHashFunction);
	});

	test("should return the only store when the store size is 1", () => {
		const bigMap = new BigMap<string, number>({ storeSize: 1 });
		expect(bigMap.storeSize).toBe(1);
		expect(bigMap.getStoreMap(0)).toBeInstanceOf(Map);
		expect(bigMap.getStore(faker.string.alpha(8))).toBe(bigMap.getStoreMap(0));
	});
});

describe("BigMap Set / Get", () => {
	test("should set and get a value", () => {
		const bigMap = new BigMap<string, number>();
		const { key, value } = fakeEntry<number>(FakeDataType.NUMBER);
		bigMap.set(key, value);
		expect(bigMap.get(key)).toBe(value);
	});

	test("should return the BigMap instance from set() to allow chaining", () => {
		const bigMap = new BigMap<string, number>();
		const [first, second] = fakeEntries<number>(FakeDataType.NUMBER, 2);

		const result = bigMap.set(first.key, first.value).set(second.key, second.value);
		expect(result).toBe(bigMap);
		expect(bigMap.get(first.key)).toBe(first.value);
		expect(bigMap.get(second.key)).toBe(second.value);
	});

	test("should return undefined for a non-existing key", () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.get(faker.string.alpha(8))).toBeUndefined();
	});

	test("should handle 500 sets and gets", () => {
		const bigMap = new BigMap<string, number>();
		const entries = fakeEntries<number>(FakeDataType.NUMBER, 500);
		for (const { key, value } of entries) {
			bigMap.set(key, value);
		}

		for (const { key, value } of entries) {
			expect(bigMap.get(key)).toBe(value);
		}
	});
});

describe("BigMap Delete", () => {
	test("should delete a key", () => {
		const bigMap = new BigMap<string, number>();
		const { key, value } = fakeEntry<number>(FakeDataType.NUMBER);
		bigMap.set(key, value);
		expect(bigMap.delete(key)).toBe(true);
		expect(bigMap.get(key)).toBeUndefined();
	});

	test("should return false when deleting a non-existing key", () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.delete(faker.string.alpha(8))).toBe(false);
	});
});

describe("BigMap Has", () => {
	test("should return true for an existing key and false otherwise", () => {
		const bigMap = new BigMap<string, number>();
		const { key, value } = fakeEntry<number>(FakeDataType.NUMBER);
		bigMap.set(key, value);
		expect(bigMap.has(key)).toBe(true);
		expect(bigMap.has(faker.string.alpha(8))).toBe(false);
	});
});

describe("BigMap Clear", () => {
	test("should clear all entries", () => {
		const bigMap = new BigMap<string, number>();
		const entries = fakeEntries<number>(FakeDataType.NUMBER, 2);
		for (const { key, value } of entries) {
			bigMap.set(key, value);
		}

		expect(bigMap.size).toBe(2);
		bigMap.clear();
		expect(bigMap.size).toBe(0);
		expect(bigMap.get(entries[0].key)).toBeUndefined();
		expect(bigMap.has(entries[0].key)).toBe(false);
	});
});

describe("BigMap Non-String Keys", () => {
	test("should support number keys across set, get, has, delete, and getStore", () => {
		const bigMap = new BigMap<number, string>();
		const key = faker.number.int({ min: 1, max: 1_000_000 });
		const value = faker.string.alpha(8);

		bigMap.set(key, value);
		expect(bigMap.get(key)).toBe(value);
		expect(bigMap.has(key)).toBe(true);
		expect(bigMap.getStore(key)).toBeInstanceOf(Map);
		expect(bigMap.delete(key)).toBe(true);
		expect(bigMap.has(key)).toBe(false);
	});
});

describe("BigMap Single Bucket", () => {
	test("should get, set, has, and delete with a single-bucket BigMap", () => {
		const bigMap = new BigMap<string, number>({ storeSize: 1 });
		const { key, value } = fakeEntry<number>(FakeDataType.NUMBER);

		bigMap.set(key, value);
		expect(bigMap.get(key)).toBe(value);
		expect(bigMap.has(key)).toBe(true);
		expect(bigMap.delete(key)).toBe(true);
		expect(bigMap.get(key)).toBeUndefined();
		expect(bigMap.has(key)).toBe(false);
		expect(bigMap.delete(key)).toBe(false);
	});
});

describe("BigMap Non-Power-of-2 Store Size", () => {
	test("should use the modulo fallback for non-power-of-2 store sizes", () => {
		const bigMap = new BigMap<string, string>({ storeSize: 3 });
		const entries = fakeEntries<string>(FakeDataType.STRING, 100);
		for (const { key, value } of entries) {
			bigMap.set(key, value);
		}

		expect(bigMap.size).toBe(100);
		for (const { key, value } of entries) {
			expect(bigMap.get(key)).toBe(value);
		}
	});

	test("should return a valid index from defaultHashFunction for a non-power-of-2 size", () => {
		const result = defaultHashFunction(faker.string.alpha(7), 3);
		expect(result).toBeGreaterThanOrEqual(0);
		expect(result).toBeLessThan(3);
	});
});

describe("BigMap Bucket Distribution", () => {
	test("should populate all configured buckets", () => {
		const storeSize = 8;
		const bigMap = new BigMap<string, string>({ storeSize });
		const entries = fakeEntries<string>(FakeDataType.STRING, 1000);
		for (const { key, value } of entries) {
			bigMap.set(key, value);
		}

		for (let i = 0; i < storeSize; i++) {
			expect(bigMap.getStoreMap(i).size).toBeGreaterThan(0);
		}
	});

	test("should distribute single-character keys across multiple buckets", () => {
		const storeSize = 4;
		const bigMap = new BigMap<string, string>({ storeSize });
		// Fixed single-character keys are intentional: before the hash fix every
		// length-1 key collided into the same bucket.
		const chars = "abcdefghijklmnopqrstuvwxyz";
		for (const c of chars) {
			bigMap.set(c, c);
		}

		const usedBuckets = Array.from(
			{ length: storeSize },
			(_, i) => bigMap.getStoreMap(i).size,
		).filter((size) => size > 0).length;
		expect(usedBuckets).toBeGreaterThanOrEqual(2);
	});

	test("should distribute two-character keys across multiple buckets", () => {
		const storeSize = 4;
		const bigMap = new BigMap<string, string>({ storeSize });
		const pairs = ["ab", "cd", "ef", "gh", "ij", "kl", "mn", "op", "qr", "st", "uv", "wx"];
		for (const pair of pairs) {
			bigMap.set(pair, pair);
		}

		const usedBuckets = Array.from(
			{ length: storeSize },
			(_, i) => bigMap.getStoreMap(i).size,
		).filter((size) => size > 0).length;
		expect(usedBuckets).toBeGreaterThanOrEqual(2);
	});

	test("should normalize out-of-range hash values to valid bucket indices", () => {
		const storeSize = 4;
		// Custom hash that returns a value outside [0, storeSize - 1].
		const bigMap = new BigMap<string, string>({
			storeSize,
			storeHashFunction: () => 7,
		});

		const value = faker.string.alpha(6);
		bigMap.set("a", value);
		// 7 % 4 = 3, so the entry should land in bucket 3 without throwing.
		expect(bigMap.get("a")).toBe(value);
		expect(bigMap.getStoreMap(3).size).toBe(1);
	});

	test("should normalize negative hash values to valid bucket indices", () => {
		const storeSize = 4;
		const bigMap = new BigMap<string, string>({
			storeSize,
			storeHashFunction: () => -5,
		});

		const value = faker.string.alpha(6);
		bigMap.set("a", value);
		// abs(-5) % 4 = 1, so the entry should land in bucket 1.
		expect(bigMap.get("a")).toBe(value);
		expect(bigMap.getStoreMap(1).size).toBe(1);
	});
});

describe("createKeyv", () => {
	test("should create a Keyv instance with the BigMap adapter", () => {
		const keyv = createKeyv();
		expect(keyv).toBeDefined();
		expect((keyv.store as KeyvMemoryAdapter).store).toBeInstanceOf(BigMap);
	});

	test("should create a Keyv instance with custom options", () => {
		const keyv = createKeyv({ storeSize: 8 });
		expect(keyv).toBeDefined();
		const store = (keyv.store as KeyvMemoryAdapter).store as BigMap<string, unknown>;
		expect(store).toBeInstanceOf(BigMap);
		expect(store.storeSize).toBe(8);
	});

	test("should work with set and get operations", async () => {
		const keyv = createKeyv<string, number>();
		const { key, value } = fakeEntry<number>(FakeDataType.NUMBER);
		await keyv.set(key, value);
		expect(await keyv.get<number>(key)).toBe(value);
	});

	test("should work with a custom hash function", async () => {
		const customHashFunction = (key: string, storeSize: number) => key.length % storeSize;
		const keyv = createKeyv({ storeSize: 4, storeHashFunction: customHashFunction });
		const { key, value } = fakeEntry<string>(FakeDataType.STRING);
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
	});
});
