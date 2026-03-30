import { faker } from "@faker-js/faker";
import type KeyvModule from "keyv";
import type * as Vitest from "vitest";
import type { KeyvStoreFn } from "./types";

const delay = async (ms: number) =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});

const keyvApiTests = (test: typeof Vitest, Keyv: typeof KeyvModule, store: KeyvStoreFn) => {
	test.beforeEach(async () => {
		const keyv = new Keyv({ store: store() });
		await keyv.clear();
	});

	test.it(".set(key, value) returns a Promise", (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		t.expect(keyv.set(key, value) instanceof Promise).toBeTruthy();
	});

	test.it(".set(key, value) resolves to true", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		t.expect(await keyv.set(key, value)).toBeTruthy();
	});

	test.it(".set(key, value) sets a value", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await keyv.set(key, value);
		t.expect(await keyv.get(key)).toBe(value);
	});

	test.it(".set(key, value, ttl) sets a value that expires", async (t) => {
		const ttl = 1000;
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await keyv.set(key, value, ttl);
		t.expect(await keyv.get(key)).toBe(value);
		await delay(ttl + 100);
		t.expect(await keyv.get(key)).toBeUndefined();
	});

	test.it(".get(key) returns a Promise", (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		t.expect(keyv.get(key) instanceof Promise).toBeTruthy();
	});

	test.it(".get(key) resolves to value", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await keyv.set(key, value);
		t.expect(await keyv.get(key)).toBe(value);
	});

	test.it(".get(key) with nonexistent key resolves to undefined", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		t.expect(await keyv.get(key)).toBeUndefined();
	});

	test.it(".get([keys]) should return array values", async (t) => {
		const keyv = new Keyv({ store: store() });
		const ttl = 3000;
		const key1 = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.alphanumeric(10);
		const value2 = faker.lorem.sentence();
		const key3 = faker.string.alphanumeric(10);
		const value3 = faker.lorem.sentence();
		await keyv.set(key1, value1, ttl);
		await keyv.set(key2, value2, ttl);
		await keyv.set(key3, value3, ttl);
		const values = (await keyv.get([key1, key2, key3])) as string[];
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values[0]).toBe(value1);
		t.expect(values[1]).toBe(value2);
		t.expect(values[2]).toBe(value3);
	});

	test.it(".get([keys]) should return array value undefined when expires", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key1 = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.alphanumeric(10);
		const value2 = faker.lorem.sentence();
		const key3 = faker.string.alphanumeric(10);
		const value3 = faker.lorem.sentence();
		await keyv.set(key1, value1);
		await keyv.set(key2, value2, 1000);
		await keyv.set(key3, value3);
		await delay(1100);
		const values = await keyv.get([key1, key2, key3]);
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values[0]).toBe(value1);
		t.expect(values[1]).toBeUndefined();
		t.expect(values[2]).toBe(value3);
	});

	test.it(".get([keys]) should return array values with undefined", async (t) => {
		const keyv = new Keyv({ store: store() });
		const ttl = 3000;
		const key1 = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		const value3 = faker.lorem.sentence();
		await keyv.set(key1, value1, ttl);
		await keyv.set(key3, value3, ttl);
		const values = (await keyv.get([key1, key2, key3])) as string[] | undefined[];
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values[0]).toBe(value1);
		t.expect(values[1]).toBeUndefined();
		t.expect(values[2]).toBe(value3);
	});

	test.it(".get([keys]) should return undefined array for all no existent keys", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		const values = await keyv.get([key1, key2, key3]);
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values).toEqual([undefined, undefined, undefined]);
	});

	test.it(".delete(key) returns a Promise", (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		t.expect(keyv.delete(key) instanceof Promise).toBeTruthy();
	});

	test.it(".delete([key]) returns a Promise", (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		t.expect(keyv.delete([key]) instanceof Promise).toBeTruthy();
	});

	test.it(".delete(key) resolves to true", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await keyv.set(key, value);
		t.expect(await keyv.delete(key)).toBeTruthy();
	});

	test.it(".delete(key) with nonexistent key resolves to false", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		t.expect(await keyv.delete(key)).toBeFalsy();
	});

	test.it(".delete(key) deletes a key", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await keyv.set(key, value);
		t.expect(await keyv.delete(key)).toBeTruthy();
		t.expect(await keyv.get(key)).toBeUndefined();
	});

	test.it(".deleteMany([keys]) should delete multiple key", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key1 = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.alphanumeric(10);
		const value2 = faker.lorem.sentence();
		const key3 = faker.string.alphanumeric(10);
		const value3 = faker.lorem.sentence();
		await keyv.set(key1, value1);
		await keyv.set(key2, value2);
		await keyv.set(key3, value3);
		const result = await keyv.delete([key1, key2, key3]);
		t.expect(Array.isArray(result)).toBe(true);
		t.expect(await keyv.get(key1)).toBeUndefined();
		t.expect(await keyv.get(key2)).toBeUndefined();
		t.expect(await keyv.get(key3)).toBeUndefined();
	});

	test.it(".deleteMany([keys]) with nonexistent keys resolves to array of false", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		const result = await keyv.delete([key1, key2, key3]);
		t.expect(Array.isArray(result)).toBe(true);
		t.expect((result as boolean[]).every((v) => v === false)).toBe(true);
	});

	test.it(".clear() returns a Promise", async (t) => {
		const keyv = new Keyv({ store: store() });
		const returnValue = keyv.clear();
		t.expect(returnValue instanceof Promise).toBeTruthy();
		await returnValue;
	});

	test.it(".clear() resolves to undefined", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		t.expect(await keyv.clear()).toBeUndefined();
		await keyv.set(key, value);
		t.expect(await keyv.clear()).toBeUndefined();
	});

	test.it(".clear() deletes all key/value pairs", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key1 = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.alphanumeric(10);
		const value2 = faker.lorem.sentence();
		await keyv.set(key1, value1);
		await keyv.set(key2, value2);
		await keyv.clear();
		t.expect(await keyv.get(key1)).toBeUndefined();
		t.expect(await keyv.get(key2)).toBeUndefined();
	});

	test.it(".has(key) where key is the key we are looking for", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		const nonExistentKey = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		t.expect(await keyv.has(key)).toBeTruthy();
		t.expect(await keyv.has(nonExistentKey)).toBeFalsy();
	});
};

export default keyvApiTests;
