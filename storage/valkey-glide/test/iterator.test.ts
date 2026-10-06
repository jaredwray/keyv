import process from "node:process";
import { faker } from "@faker-js/faker";
import { Decoder } from "@valkey/valkey-glide";
import { describe, expect, test } from "vitest";
import KeyvValkeyGlide from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370/1";

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
		await store.clear();
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

	test("should iterate over entries when useSets is true", async () => {
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkeyGlide(valkeyUri, { useSets: true, namespace });
		await store.clear();

		const entries = new Map<string, string>();
		for (let i = 0; i < 3; i++) {
			const key = faker.string.alphanumeric(10);
			const value = faker.string.alphanumeric(10);
			entries.set(key, value);
			await store.set(key, value);
		}

		const collected = new Map<string, unknown>();
		for await (const [key, value] of store.iterator()) {
			collected.set(key, value);
		}

		expect(collected).toEqual(entries);
		await store.clear();
		await store.disconnect();
	});

	test("should match every glob metacharacter in the namespace literally", async () => {
		const base = faker.string.alphanumeric(8);
		// `[a-z]`, `?`, `*` and a trailing backslash would all be glob syntax if left unescaped.
		const store = new KeyvValkeyGlide(valkeyUri, { namespace: `${base}[a-z]?*\\` });
		const sibling = new KeyvValkeyGlide(valkeyUri, { namespace: `${base}xy-prod` });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);
		await sibling.set(faker.string.alphanumeric(10), faker.string.alphanumeric(10));

		const collected: Array<[string, unknown]> = [];
		for await (const entry of store.iterator()) {
			collected.push(entry);
		}

		expect(collected).toEqual([[key, value]]);

		await store.clear();
		await sibling.clear();
		await store.disconnect();
		await sibling.disconnect();
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

	test("should yield a binary value as its bytes instead of failing", async () => {
		const store = new KeyvValkeyGlide(valkeyUri, { namespace: faker.string.alphanumeric(8) });
		const bytes = Buffer.from([0xff, 0xfe, 0xfd, 0x00, 0x01]);
		const binaryKey = faker.string.alphanumeric(10);
		const textKey = faker.string.alphanumeric(10);
		const text = faker.string.alphanumeric(10);
		await store.set(binaryKey, bytes);
		await store.set(textKey, text);

		const collected = new Map<string, unknown>();
		for await (const [key, value] of store.iterator()) {
			collected.set(key, value);
		}

		expect(collected.get(binaryKey)).toEqual(bytes);
		expect(collected.get(textKey)).toBe(text);
		await store.clear();
		await store.disconnect();
	});

	test("should iterate and clear when GLIDE's default decoder returns Buffers", async () => {
		const store = new KeyvValkeyGlide({
			uri: valkeyUri,
			namespace: faker.string.alphanumeric(8),
			defaultDecoder: Decoder.Bytes,
		});
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);

		const collected: Array<[string, unknown]> = [];
		for await (const entry of store.iterator()) {
			collected.push(entry);
		}

		expect(collected).toEqual([[key, value]]);
		await store.clear();
		expect(await store.get(key)).toBeUndefined();
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
