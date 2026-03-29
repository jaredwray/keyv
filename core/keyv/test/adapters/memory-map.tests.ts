import { describe, expect, test } from "vitest";
import { createKeyv } from "../../src/adapters/memory.js";
import { delay as sleep } from "../test-utils.js";

describe("KeyvMemoryAdapter with Map - createKeyv() Integration", () => {
	test("should work with createKeyv helper", async () => {
		const map = new Map<string, unknown>();
		const keyv = createKeyv(map);

		await keyv.set("key1", "value1");
		const result = await keyv.get("key1");
		expect(result).toBe("value1");
	});

	test("should set many items and then get them", async () => {
		const map = new Map<string, unknown>();
		const keyv = createKeyv(map);

		const testData = [
			{ key: "key1", value: "value1" },
			{ key: "key2", value: "value2" },
			{ key: "key3", value: "value3" },
		];

		await keyv.setMany(testData);
		const result = await keyv.getMany(testData.map((d) => d.key));
		expect(result.length).toBe(3);
	});

	test("should handle batch operations", async () => {
		const map = new Map<string, unknown>();
		const keyv = createKeyv(map);

		const testData = [
			{ key: "key1", value: "value1" },
			{ key: "key2", value: "value2" },
			{ key: "key3", value: "value3" },
			{ key: "key4", value: "value4" },
			{ key: "key5", value: "value5" },
		];

		await keyv.setMany(testData);
		const testKeys = testData.map((d) => d.key);

		// Get many
		const getResult = await keyv.getMany(testKeys);
		expect(getResult.length).toBe(5);

		// Has many
		const hasResult = await keyv.has(testKeys);
		expect(hasResult.length).toBe(5);
		expect(hasResult.every((r) => r === true)).toBe(true);

		// Delete many
		await keyv.deleteMany(["key1", "key2"]);
		expect(await keyv.get("key1")).toBe(undefined);
		expect(await keyv.get("key2")).toBe(undefined);
		expect(await keyv.has("key3")).toBe(true);
	});

	test("should handle TTL with createKeyv", async () => {
		const map = new Map<string, unknown>();
		const keyv = createKeyv(map);

		await keyv.set("expiring", "value", 10);
		await sleep(20);
		expect(await keyv.get("expiring")).toBe(undefined);
	});
});
