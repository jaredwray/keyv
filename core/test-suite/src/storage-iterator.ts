import { faker } from "@faker-js/faker";
import type { StorageFn, TestFunction } from "./types.js";

const storageIteratorTests = (test: TestFunction, store: StorageFn) => {
	test("iterator() returns an asyncIterator", (t) => {
		const s = store();
		t.expect(s.iterator).toBeDefined();
		/* v8 ignore next 3 -- @preserve */
		if (!s.iterator) {
			return;
		}

		const iterator = s.iterator();
		t.expect(typeof iterator[Symbol.asyncIterator]).toBe("function");
	});

	test("iterator() iterates over all stored pairs", async (t) => {
		const s = store();
		/* v8 ignore next 3 -- @preserve */
		if (!s.iterator) {
			return;
		}

		const namespace = faker.string.alphanumeric(8);
		s.namespace = namespace;

		const entries = new Map<string, string>();
		for (let i = 0; i < 3; i++) {
			const key = faker.string.alphanumeric(10);
			const value = faker.lorem.word();
			entries.set(key, value);
			await s.set(key, value);
		}

		const collected = new Map<string, string>();
		for await (const [key, value] of s.iterator(namespace)) {
			collected.set(key as string, value as string);
		}

		for (const [key] of entries) {
			t.expect(collected.has(key)).toBe(true);
		}
	});

	test("iterator() with namespace only yields namespaced keys", async (t) => {
		const s = store();
		/* v8 ignore next 3 -- @preserve */
		if (!s.iterator) {
			return;
		}

		const namespace = faker.string.alphanumeric(8);

		// Set keys without namespace
		const noNsKey = faker.string.alphanumeric(10);
		await s.set(noNsKey, faker.lorem.word());

		// Set keys with namespace
		s.namespace = namespace;
		const nsKey1 = faker.string.alphanumeric(10);
		const nsKey2 = faker.string.alphanumeric(10);
		const nsVal1 = faker.lorem.word();
		const nsVal2 = faker.lorem.word();
		await s.set(nsKey1, nsVal1);
		await s.set(nsKey2, nsVal2);

		const keys: string[] = [];
		for await (const [key] of s.iterator(namespace)) {
			keys.push(key as string);
		}

		t.expect(keys.length).toBe(2);
	});

	test("iterator() on empty store yields nothing", async (t) => {
		const s = store();
		/* v8 ignore next 3 -- @preserve */
		if (!s.iterator) {
			return;
		}

		const namespace = faker.string.alphanumeric(8);
		s.namespace = namespace;

		const entries: unknown[] = [];
		for await (const entry of s.iterator(namespace)) {
			/* v8 ignore next -- @preserve */
			entries.push(entry);
		}

		t.expect(entries.length).toBe(0);
	});
};

export default storageIteratorTests;
