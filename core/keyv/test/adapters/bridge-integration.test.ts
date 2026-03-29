import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { faker } from "@faker-js/faker";
import { KeyvFile } from "keyv-file";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { KeyvBridgeAdapter } from "../../src/adapters/bridge.js";
import { Keyv } from "../../src/keyv.js";

// keyv-anyredis integration tests are skipped by default since they require a running Redis server.
// To run them, set REDIS_URL=redis://localhost:6379 in your environment and start Redis.

const tmpDir = path.join(os.tmpdir(), `keyv-bridge-test-${Date.now()}`);

afterAll(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("KeyvBridgeAdapter + keyv-file", () => {
	let store: InstanceType<typeof KeyvFile>;
	let bridge: KeyvBridgeAdapter;

	beforeEach(() => {
		const filename = path.join(tmpDir, `${faker.string.alphanumeric(8)}.json`);
		store = new KeyvFile({ filename, writeDelay: 0 });
		bridge = new KeyvBridgeAdapter(store);
	});

	test("should set and get a value", async () => {
		const key = faker.string.uuid();
		const value = { name: faker.person.fullName() };
		await bridge.set(key, value);
		const result = await bridge.get(key);
		expect(result).toEqual(value);
	});

	test("should return undefined for missing key", async () => {
		const result = await bridge.get("nonexistent");
		expect(result).toBeUndefined();
	});

	test("should delete a key", async () => {
		const key = faker.string.uuid();
		await bridge.set(key, "value");
		const deleted = await bridge.delete(key);
		expect(deleted).toBe(true);
		const result = await bridge.get(key);
		expect(result).toBeUndefined();
	});

	test("should clear the store", async () => {
		await bridge.set("key1", "value1");
		await bridge.set("key2", "value2");
		await bridge.clear();
		expect(await bridge.get("key1")).toBeUndefined();
		expect(await bridge.get("key2")).toBeUndefined();
	});

	test("should use has from the store", async () => {
		const key = faker.string.uuid();
		await bridge.set(key, "value");
		expect(await bridge.has(key)).toBe(true);
		expect(await bridge.has("nonexistent")).toBe(false);
	});

	test("should use getMany from the store", async () => {
		await bridge.set("key1", "value1");
		await bridge.set("key2", "value2");
		const result = await bridge.getMany(["key1", "key2", "key3"]);
		expect(result[0]).toBe("value1");
		expect(result[1]).toBe("value2");
		expect(result[2]).toBeUndefined();
	});

	test("should use deleteMany from the store", async () => {
		await bridge.set("key1", "value1");
		await bridge.set("key2", "value2");
		const result = await bridge.deleteMany(["key1", "key2"]);
		// keyv-file deleteMany returns a single boolean, so the bridge delegates as-is
		expect(result).toBeTruthy();
		expect(await bridge.get("key1")).toBeUndefined();
	});

	test("should work with namespace", async () => {
		const filename = path.join(tmpDir, `${faker.string.alphanumeric(8)}.json`);
		const nsStore = new KeyvFile({ filename, writeDelay: 0 });
		const bridge1 = new KeyvBridgeAdapter(nsStore, { namespace: "ns1" });
		const bridge2 = new KeyvBridgeAdapter(nsStore, { namespace: "ns2" });

		await bridge1.set("key", "value1");
		await bridge2.set("key", "value2");

		expect(await bridge1.get("key")).toBe("value1");
		expect(await bridge2.get("key")).toBe("value2");
	});

	test("should iterate over entries", async () => {
		await bridge.set("a", "1");
		await bridge.set("b", "2");
		const entries: unknown[] = [];
		for await (const entry of bridge.iterator()) {
			entries.push(entry);
		}

		expect(entries.length).toBeGreaterThanOrEqual(2);
	});

	test("should disconnect", async () => {
		await expect(bridge.disconnect()).resolves.toBeUndefined();
	});

	test("should work with Keyv class", async () => {
		const keyv = new Keyv({ store: bridge });
		const key = faker.string.uuid();
		const value = faker.string.alphanumeric(16);
		await keyv.set(key, value);
		const result = await keyv.get(key);
		expect(result).toBe(value);
		await keyv.delete(key);
		expect(await keyv.get(key)).toBeUndefined();
	});
});

// keyv-anyredis tests - requires a running Redis server
const redisUrl = process.env.REDIS_URL;
const describeRedis = redisUrl ? describe : describe.skip;

describeRedis("KeyvBridgeAdapter + keyv-anyredis", () => {
	// These tests will only run when REDIS_URL is set
	test.todo("should set and get a value with Redis");
	test.todo("should delete a key with Redis");
	test.todo("should clear the store with Redis");
	test.todo("should work with Keyv class and Redis");
});
