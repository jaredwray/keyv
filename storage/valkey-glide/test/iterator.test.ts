import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import KeyvValkeyGlide from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

describe("iterator", () => {
	test("should iterate over entries within the namespace without passing one in", async () => {
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkeyGlide(valkeyUri, { namespace });
		await store.clear();

		const entries = new Map<string, string>();
		for (let i = 0; i < 4; i++) {
			const key = faker.string.alphanumeric(10);
			const value = faker.string.alphanumeric(10);
			entries.set(key, value);
			await store.set(key, value);
		}

		const collected = new Map<string, string>();
		for await (const [key, value] of store.iterator()) {
			expect(value).not.toBeNull();
			collected.set(key, value as string);
		}

		expect(collected.size).toBe(entries.size);
		for (const [key, value] of entries) {
			expect(collected.get(key)).toBe(value);
		}

		await store.clear();
		await store.disconnect();
	});

	test("should iterate the root keyspace when no namespace or useSets prefix is set", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const key = faker.string.alphanumeric(16);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);

		let found: string | undefined;
		for await (const [collectedKey, collectedValue] of store.iterator<string>()) {
			if (collectedKey === key) {
				found = collectedValue;
				break;
			}
		}

		expect(found).toBe(value);
		await store.delete(key);
		await store.disconnect();
	});

	test("should not yield keys from another namespace when this namespace contains glob metacharacters", async () => {
		const base = faker.string.alphanumeric(6);
		const namespaceA = `${base}*`;
		const namespaceB = `${base}X`;

		const storeA = new KeyvValkeyGlide(valkeyUri, { namespace: namespaceA });
		const storeB = new KeyvValkeyGlide(valkeyUri, { namespace: namespaceB });
		await storeA.clear();
		await storeB.clear();

		const keyA = faker.string.alphanumeric(10);
		const keyB = faker.string.alphanumeric(10);
		await storeA.set(keyA, faker.string.alphanumeric(10));
		await storeB.set(keyB, faker.string.alphanumeric(10));

		const collected = new Set<string>();
		for await (const [key] of storeA.iterator()) {
			collected.add(key);
		}

		expect(collected.has(keyA)).toBe(true);
		expect(collected.has(keyB)).toBe(false);

		await storeA.clear();
		await storeB.clear();
		await storeA.disconnect();
		await storeB.disconnect();
	});

	test("should yield undefined when the namespace is empty", async () => {
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkeyGlide(valkeyUri, { namespace });
		await store.clear();
		const first = await store.iterator().next();
		expect(first.value).toBeUndefined();
		expect(first.value).not.toBeNull();
		await store.disconnect();
	});
});
