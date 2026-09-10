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
