import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import KeyvValkey from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

describe("iterator", () => {
	test("should iterate over entries within the namespace without passing one in", async () => {
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkey(valkeyUri, { namespace });
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

	test("should iterate over entries when useSets is true", async () => {
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkey(valkeyUri, { useSets: true, namespace });
		await store.clear();

		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		await store.set(key1, faker.string.alphanumeric(10));
		await store.set(key2, faker.string.alphanumeric(10));

		const collected = new Map<string, string>();
		for await (const [key, value] of store.iterator()) {
			expect(value).not.toBeNull();
			collected.set(key, value as string);
		}

		expect(collected.size).toBe(2);
		await store.clear();
		await store.disconnect();
	});

	test("should match glob metacharacters in the namespace literally", async () => {
		const base = faker.string.alphanumeric(8);
		// `[a-z]`, `?`, `*` and a trailing backslash would all be glob syntax if left unescaped
		const store = new KeyvValkey(valkeyUri, { namespace: `${base}[a-z]?*\\` });
		const sibling = new KeyvValkey(valkeyUri, { namespace: `${base}xy-prod` });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);
		await sibling.set(faker.string.alphanumeric(10), faker.string.alphanumeric(10));

		const collected: Array<[string, string | undefined]> = [];
		for await (const entry of store.iterator<string>()) {
			collected.push(entry);
		}

		expect(collected).toEqual([[key, value]]);

		await store.clear();
		await sibling.clear();
		await store.disconnect();
		await sibling.disconnect();
	});

	test("should yield undefined when the namespace is empty", async () => {
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkey(valkeyUri, { namespace });
		await store.clear();
		const first = await store.iterator().next();
		expect(first.value).toBeUndefined();
		expect(first.value).not.toBeNull();
		await store.disconnect();
	});

	test("should not error when iterating without a namespace", async () => {
		const store = new KeyvValkey(valkeyUri);
		const result = await store.iterator().next();
		expect(result.done === true || Array.isArray(result.value)).toBe(true);
		if (Array.isArray(result.value)) {
			expect(result.value[1]).not.toBeNull();
		}

		await store.disconnect();
	});
});
