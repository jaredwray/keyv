import { faker } from "@faker-js/faker";
import { describe, expect, it } from "vitest";
import { BigMap, createKeyv, defaultHashFunction } from "../src/index.js";

enum FakeDataType {
	STRING = "string",
	NUMBER = "number",
}

function getFake<T>(
	type: FakeDataType,
	amount = 1,
): Array<{ key: string; value: T }> {
	if (type === FakeDataType.STRING) {
		return Array.from({ length: amount }, () => ({
			key: faker.string.alpha(5),
			value: faker.string.alpha(10) as T,
		}));
	}

	return Array.from({ length: amount }, () => ({
		key: faker.string.alpha(5),
		value: faker.number.int({ min: 1, max: 100 }) as T,
	}));
}

describe("BigMap Instance", () => {
	it("should create an instance of BigMap", () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap).toBeInstanceOf(BigMap);
	});

	it("should initialize with an empty map", () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.size).toBe(0);
		expect(bigMap.get("nonExistingKey")).toBeUndefined();
		expect(bigMap.has("nonExistingKey")).toBe(false);
	});

	it("should allow setting a custom store size", () => {
		const customSize = 10;
		const bigMap = new BigMap<string, number>({ storeSize: customSize });
		expect(bigMap.storeSize).toBe(customSize);
	});

	it("should default store size to 4", () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.storeSize).toBe(4);
	});

	it("should throw an error when store size is set to less than 1", () => {
		expect(() => {
			new BigMap<string, number>({ storeSize: 0 });
		}).toThrow("Store size must be at least 1.");
	});

	it("should throw an error when setting store size less than 1", () => {
		const bigMap = new BigMap<string, number>();
		expect(() => {
			bigMap.storeSize = 0;
		}).toThrow("Store size must be at least 1.");
	});

	it("should allow setting a custom hash function", () => {
		const customHashFunction = (key: string, storeSize: number) =>
			key.length % storeSize;

		const bigMap = new BigMap<string, number>({
			storeHashFunction: customHashFunction,
		});

		expect(bigMap.storeHashFunction).toBe(customHashFunction);

		bigMap.storeHashFunction = undefined;
		expect(bigMap.storeHashFunction).toBe(defaultHashFunction);
	});

	it("should not throw an error when store size is set to 1", () => {
		const bigMap = new BigMap<string, number>();
		expect(() => {
			bigMap.storeSize = 1;
		}).not.toThrow();
	});

	it("should clear entries when store size is set", () => {
		const bigMap = new BigMap<string, number>();

		const dataSet = getFake<number>(FakeDataType.NUMBER, 2);
		dataSet.forEach((item) => {
			bigMap.set(item.key, item.value);
		});

		expect(bigMap.size).toBe(2);

		bigMap.storeSize = 5; // This should clear the map
		expect(bigMap.size).toBe(0);
		expect(bigMap.get(dataSet[0].key)).toBeUndefined();
		expect(bigMap.get(dataSet[1].key)).toBeUndefined();
	});

	it("should have the correct store size", () => {
		const bigMap = new BigMap<string, number>({ storeSize: 3 });
		const dataSet = getFake<number>(FakeDataType.NUMBER, 50);
		dataSet.forEach((item) => {
			bigMap.set(item.key, item.value);
		});

		expect(bigMap.size).toBe(50);

		// Remove some items
		for (let i = 0; i < 20; i++) {
			bigMap.delete(dataSet[i].key);
		}

		expect(bigMap.size).toBe(30);
	});
});

describe("BigMap Iterators", () => {
	it("should iterate using for..of", () => {
		const bigMap = new BigMap<string, string>();

		const dataSet = getFake<string>(FakeDataType.STRING, 3);
		for (const data of dataSet) {
			bigMap.set(data.key, data.value);
		}

		const entries: Array<[string, string]> = [];
		for (const [key, value] of bigMap) {
			entries.push([key, value]);
		}

		expect(entries.length).toBe(3);
		for (const entry of entries) {
			expect(
				dataSet.some(
					(data) => data.key === entry[0] && data.value === entry[1],
				),
			).toBe(true);
		}
	});

	it("should iterate over keys", () => {
		const bigMap = new BigMap<string, number>();

		const dataSet = getFake<number>(FakeDataType.NUMBER, 2);

		for (const data of dataSet) {
			bigMap.set(data.key, data.value);
		}

		const keys: string[] = [];
		for (const key of bigMap.keys()) {
			keys.push(key);
		}

		expect(keys).toContain(dataSet[0].key);
		expect(keys).toContain(dataSet[1].key);
		expect(keys.length).toBe(2);
	});

	it("should iterate over entries", () => {
		const bigMap = new BigMap<string, number>();

		const dataSet = getFake<number>(FakeDataType.NUMBER, 2);

		for (const data of dataSet) {
			bigMap.set(data.key, data.value);
		}

		const entries: Array<[string, number]> = [];
		for (const [key, value] of bigMap.entries()) {
			entries.push([key, value]);
		}

		for (const entry of entries) {
			expect(
				dataSet.some(
					(data) => data.key === entry[0] && data.value === entry[1],
				),
			).toBe(true);
		}

		expect(entries.length).toBe(2);
	});

	it("should iterate over keys for forEach function", () => {
		const bigMap = new BigMap<string, string>();

		const dataSet = getFake<string>(FakeDataType.STRING, 2);

		for (const data of dataSet) {
			bigMap.set(data.key, data.value);
		}

		const keys: string[] = [];
		bigMap.forEach((_value, key) => {
			keys.push(key);
		});

		expect(keys).toContain(dataSet[0].key);
		expect(keys).toContain(dataSet[1].key);
	});

	it("should pass the BigMap instance as third argument in forEach", () => {
		const bigMap = new BigMap<string, number>();
		bigMap.set("key1", 10);
		bigMap.set("key2", 20);

		bigMap.forEach((_value, _key, map) => {
			expect(map).toBe(bigMap);
		});
	});

	it("should apply thisArg correctly in forEach", () => {
		const bigMap = new BigMap<string, number>();
		bigMap.set("key1", 10);
		bigMap.set("key2", 20);

		const context = { sum: 0 };
		bigMap.forEach(function (value) {
			this.sum += value;
		}, context);

		expect(context.sum).toBe(30);
	});

	it("should iterate over values", () => {
		const bigMap = new BigMap<string, number>();

		const dataSet = getFake<number>(FakeDataType.NUMBER, 2);
		for (const data of dataSet) {
			bigMap.set(data.key, data.value);
		}

		const values: number[] = [];
		for (const value of bigMap.values()) {
			values.push(value);
		}

		expect(values).toContain(dataSet[0].value);
		expect(values).toContain(dataSet[1].value);
		expect(values.length).toBe(2);
	});
});

describe("BigMap Hash", () => {
	it("should use the default hash function", () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.storeHashFunction).toBe(defaultHashFunction);
	});

	it("should use a custom hash function", () => {
		const customHashFunction = (key: string, storeSize: number) =>
			key.length % storeSize;
		const bigMap = new BigMap<string, number>({
			storeHashFunction: customHashFunction,
		});
		expect(bigMap.storeHashFunction).toBe(customHashFunction);
	});

	it("should return the same hash for the same key", () => {
		const bigMap = new BigMap<string, number>();
		const key = "testKey";
		const hash1 = bigMap.storeHashFunction?.(key, bigMap.storeSize);
		const hash2 = bigMap.storeHashFunction?.(key, bigMap.storeSize);
		expect(hash1).toBe(hash2);
		// Test with a different key
		const differentKey = "differentKey";
		const hash3 = bigMap.storeHashFunction?.(differentKey, bigMap.storeSize);
		expect(hash1).not.toBe(hash3);
	});
});

describe("BigMap Store", () => {
	it("should initialize the store with empty maps", () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.store).toHaveLength(4);
		for (const map of bigMap.store) {
			expect(map).toBeInstanceOf(Map);
		}
	});

	it("should return index of 0 when store size is 1", () => {
		const bigMap = new BigMap<string, number>({ storeSize: 1 });
		expect(bigMap.getStoreMap(0)).toBeInstanceOf(Map);
		expect(bigMap.storeSize).toBe(1);
		expect(bigMap.getStore("key")).toBeDefined();
	});

	it("should get the correct store map by index", () => {
		const bigMap = new BigMap<string, number>();
		const map = bigMap.getStoreMap(0);
		expect(map).toBeInstanceOf(Map);
	});

	it("should throw an error for invalid store map index", () => {
		const bigMap = new BigMap<string, number>();
		expect(() => bigMap.getStoreMap(4)).toThrowError(
			"Index out of bounds: 4. Valid range is 0 to 3.",
		);
	});

	it("should be able to get the store from getStore()", () => {
		const bigMap = new BigMap<string, number>();
		const key = "testKey";
		const store = bigMap.getStore(key);
		expect(store).toBeInstanceOf(Map);
	});

	it("should get the store from a custom hash function", () => {
		const customHashFunction = (key: string, storeSize: number) =>
			key.length % storeSize;
		const bigMap = new BigMap<string, number>({
			storeHashFunction: customHashFunction,
		});
		const key = "testKey";
		const store = bigMap.getStore(key);
		expect(store).toBeInstanceOf(Map);
		expect(bigMap.storeHashFunction).toBe(customHashFunction);
	});

	it("should fallback to default hash function when storeHashFunction is undefined", () => {
		const bigMap = new BigMap<string, number>();
		// Force _storeHashFunction to be undefined by using Object.defineProperty
		Object.defineProperty(bigMap, "_storeHashFunction", {
			value: undefined,
			writable: true,
		});
		const key = "testKey";
		const store = bigMap.getStore(key);
		expect(store).toBeInstanceOf(Map);
	});
});

describe("BigMap Set / Get", () => {
	it("should set and get values", () => {
		const bigMap = new BigMap<string, number>();
		const data = getFake<number>(FakeDataType.NUMBER, 1)[0];
		bigMap.set(data.key, data.value);
		expect(bigMap.get(data.key)).toBe(data.value);
	});

	it("should return undefined for non-existing keys", () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.get("nonExistingKey")).toBeUndefined();
	});

	it("should do 500 sets and gets", () => {
		const bigMap = new BigMap<string, number>();
		const dataSet = getFake<number>(FakeDataType.NUMBER, 500);

		dataSet.forEach((item) => {
			bigMap.set(item.key, item.value);
		});

		dataSet.forEach((item) => {
			expect(bigMap.get(item.key)).toBe(item.value);
		});
	});
});

describe("BigMap Delete", () => {
	it("should delete keys", () => {
		const bigMap = new BigMap<string, number>();
		const data = getFake<number>(FakeDataType.NUMBER, 1)[0];
		bigMap.set(data.key, data.value);
		expect(bigMap.delete(data.key)).toBe(true);
		expect(bigMap.get(data.key)).toBeUndefined();
	});

	it("should return false when deleting non-existing keys", () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.delete("nonExistingKey")).toBe(false);
	});
});

describe("BigMap Has", () => {
	it("should check if a key exists", () => {
		const bigMap = new BigMap<string, number>();
		const data = getFake<number>(FakeDataType.NUMBER, 1)[0];
		bigMap.set(data.key, data.value);
		expect(bigMap.has(data.key)).toBe(true);
		expect(bigMap.has("nonExistingKey")).toBe(false);
	});

	it("should return false for non-existing keys", () => {
		const bigMap = new BigMap<string, number>();
		expect(bigMap.has("nonExistingKey")).toBe(false);
	});
});

describe("BigMap Clear", () => {
	it("should clear all entries", () => {
		const bigMap = new BigMap<string, number>();
		const dataSet = getFake<number>(FakeDataType.NUMBER, 2);
		dataSet.forEach((item) => {
			bigMap.set(item.key, item.value);
		});

		expect(bigMap.size).toBe(2);
		bigMap.clear();
		expect(bigMap.size).toBe(0);
		expect(bigMap.get(dataSet[0].key)).toBeUndefined();
		expect(bigMap.has(dataSet[0].key)).toBe(false);
	});
});

describe("createKeyv", () => {
	it("should create a Keyv instance with BigMap adapter", () => {
		const keyv = createKeyv();
		expect(keyv).toBeDefined();
		expect(keyv.store).toBeInstanceOf(BigMap);
	});

	it("should create a Keyv instance with custom options", () => {
		const keyv = createKeyv({ storeSize: 8 });
		expect(keyv).toBeDefined();
		expect(keyv.store).toBeInstanceOf(BigMap);
		expect((keyv.store as BigMap<string, unknown>).storeSize).toBe(8);
	});

	it("should work with set and get operations", async () => {
		const keyv = createKeyv<string, number>();
		await keyv.set("testKey", 123);
		const value = await keyv.get<number>("testKey");
		expect(value).toBe(123);
	});

	it("should work with custom hash function", async () => {
		const customHashFunction = (key: string, storeSize: number) =>
			key.length % storeSize;
		const keyv = createKeyv({
			storeSize: 4,
			storeHashFunction: customHashFunction,
		});
		await keyv.set("test", "value");
		const value = await keyv.get("test");
		expect(value).toBe("value");
	});
});
