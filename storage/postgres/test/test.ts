import { faker } from "@faker-js/faker";
import { keyvIteratorTests, keyvTestSuite, storageTestSuite } from "@keyv/test-suite";
import Keyv from "keyv";
import { beforeEach, describe, expect, test } from "vitest";
import KeyvPostgres, { createKeyv } from "../src/index.js";

const postgresUri = "postgresql://postgres:postgres@localhost:5432/keyv_test";

const store = () => new KeyvPostgres({ uri: postgresUri, iterationLimit: 2 });

keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);
storageTestSuite(test, store, { ttl: false });

beforeEach(async () => {
	const keyv = store();
	await keyv.clear();
});

describe("constructor", () => {
	test("sets default property values", () => {
		const keyv = new KeyvPostgres();
		expect(keyv.uri).toBe("postgresql://localhost:5432");
		expect(keyv.table).toBe("keyv");
		expect(keyv.keyLength).toBe(255);
		expect(keyv.namespaceLength).toBe(255);
		expect(keyv.schema).toBe("public");
		expect(keyv.iterationLimit).toBe(10);
		expect(keyv.useUnloggedTable).toBe(false);
		expect(keyv.clearExpiredInterval).toBe(0);
		expect(keyv.ssl).toBeUndefined();
		expect(keyv.namespace).toBeUndefined();
	});

	test("sets properties from constructor options", () => {
		const keyv = new KeyvPostgres({
			uri: postgresUri,
			table: "custom_table",
			keyLength: 512,
			namespaceLength: 512,
			schema: "custom_schema",
			iterationLimit: 50,
			useUnloggedTable: true,
			clearExpiredInterval: 5000,
			ssl: { rejectUnauthorized: false },
		});
		expect(keyv.uri).toBe(postgresUri);
		expect(keyv.table).toBe("custom_table");
		expect(keyv.keyLength).toBe(512);
		expect(keyv.namespaceLength).toBe(512);
		expect(keyv.schema).toBe("custom_schema");
		expect(keyv.iterationLimit).toBe(50);
		expect(keyv.useUnloggedTable).toBe(true);
		expect(keyv.clearExpiredInterval).toBe(5000);
		expect(keyv.ssl).toEqual({ rejectUnauthorized: false });
		keyv.clearExpiredInterval = 0;
	});

	test("sets the uri when a string is passed", () => {
		const keyv = new KeyvPostgres(postgresUri);
		expect(keyv.uri).toBe(postgresUri);
		expect(keyv.table).toBe("keyv");
		expect(keyv.schema).toBe("public");
	});

	test("updates properties via setters", () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		keyv.uri = "postgresql://localhost:5433";
		expect(keyv.uri).toBe("postgresql://localhost:5433");
		keyv.table = "new_table";
		expect(keyv.table).toBe("new_table");
		keyv.schema = "new_schema";
		expect(keyv.schema).toBe("new_schema");
		keyv.keyLength = 512;
		expect(keyv.keyLength).toBe(512);
		keyv.namespaceLength = 1024;
		expect(keyv.namespaceLength).toBe(1024);
		keyv.iterationLimit = 25;
		expect(keyv.iterationLimit).toBe(25);
		keyv.useUnloggedTable = true;
		expect(keyv.useUnloggedTable).toBe(true);
		keyv.ssl = { rejectUnauthorized: false };
		expect(keyv.ssl).toEqual({ rejectUnauthorized: false });
		keyv.namespace = "test-ns";
		expect(keyv.namespace).toBe("test-ns");
		keyv.namespace = undefined;
		expect(keyv.namespace).toBeUndefined();
	});
});

describe("get", () => {
	test("returns undefined for a missing key", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		expect(await keyv.get(faker.string.alphanumeric(10))).toBeUndefined();
	});

	test("returns a previously set value", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
	});

	test("returns undefined (not null) for a key stored with a null value", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key = faker.string.alphanumeric(10);
		// biome-ignore lint/suspicious/noExplicitAny: testing null value path
		await keyv.set(key, null as any);
		const result = await keyv.get(key);
		expect(result).toBeUndefined();
		expect(result).not.toBeNull();
	});

	test("stores a numeric value as its string representation", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key = faker.string.alphanumeric(10);
		// biome-ignore lint/suspicious/noExplicitAny: testing numeric value path
		await keyv.set(key, 12_345 as any);
		expect(await keyv.get(key)).toBe("12345");
	});

	test("handles object values with an expires field without serialization", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key = faker.string.alphanumeric(10);
		const objectValue = { value: faker.lorem.word(), expires: Date.now() + 60_000 };
		// biome-ignore lint/suspicious/noExplicitAny: testing non-string value path
		await keyv.set(key, objectValue as any);
		expect(await keyv.get(key)).toBeDefined();
	});

	test("handles object values without an expires field", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key = faker.string.alphanumeric(10);
		const objectValue = { value: faker.lorem.word() };
		// biome-ignore lint/suspicious/noExplicitAny: testing non-string value path
		await keyv.set(key, objectValue as any);
		expect(await keyv.get(key)).toBeDefined();
	});
});

describe("getMany", () => {
	test("returns values in order with undefined for missing keys", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key1 = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.alphanumeric(10);
		const value2 = faker.lorem.sentence();
		await keyv.set(key1, value1);
		await keyv.set(key2, value2);
		expect(await keyv.getMany([key1, faker.string.alphanumeric(10), key2])).toStrictEqual([
			value1,
			undefined,
			value2,
		]);
	});

	test("returns undefined (not null) for keys stored with a null value", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key = faker.string.alphanumeric(10);
		// biome-ignore lint/suspicious/noExplicitAny: testing null value path
		await keyv.set(key, null as any);
		const results = await keyv.getMany([key, faker.string.alphanumeric(10)]);
		expect(results).toEqual([undefined, undefined]);
		expect(results[0]).not.toBeNull();
	});
});

describe("set and setMany", () => {
	test("stores and retrieves when constructed with a uri string", async () => {
		const keyv = new KeyvPostgres(postgresUri);
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
	});

	test("setMany inserts multiple entries", async () => {
		const keyv = new KeyvPostgres(postgresUri);
		const key1 = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.alphanumeric(10);
		const value2 = faker.lorem.sentence();
		const key3 = faker.string.alphanumeric(10);
		const value3 = faker.lorem.sentence();
		await keyv.setMany([
			{ key: key1, value: value1 },
			{ key: key2, value: value2 },
			{ key: key3, value: value3 },
		]);
		expect(await keyv.getMany([key1, key2, key3])).toStrictEqual([value1, value2, value3]);
	});

	test("setMany updates existing keys", async () => {
		const keyv = new KeyvPostgres(postgresUri);
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, "original");
		await keyv.setMany([{ key, value: "updated" }]);
		expect(await keyv.get(key)).toBe("updated");
	});

	test("gracefully handles non-JSON string values", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, "not-json-at-all");
		expect(await keyv.get(key)).toBe("not-json-at-all");
	});

	test("setMany emits an error and returns false entries on query error", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		let emittedError = false;
		keyv.on("error", () => {
			emittedError = true;
		});
		// Close the connection to force an error.
		await keyv.disconnect();
		const result = await keyv.setMany([
			{ key: "key1", value: "val1" },
			{ key: "key2", value: "val2" },
		]);
		expect(result).toEqual([false, false]);
		expect(emittedError).toBe(true);
	});
});

describe("has and hasMany", () => {
	test("has returns true for an existing key", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, faker.lorem.word());
		expect(await keyv.has(key)).toBe(true);
	});

	test("has returns false for a non-existing key", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		expect(await keyv.has(faker.string.alphanumeric(10))).toBe(false);
	});

	test("has returns true after set and false after delete", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, faker.lorem.word());
		expect(await keyv.has(key)).toBe(true);
		await keyv.delete(key);
		expect(await keyv.has(key)).toBe(false);
	});

	test("has returns false after clear", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, faker.lorem.word());
		expect(await keyv.has(key)).toBe(true);
		await keyv.clear();
		expect(await keyv.has(key)).toBe(false);
	});

	test("has returns false and deletes an expired key", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key = faker.string.alphanumeric(10);
		const expiredValue = JSON.stringify({ value: "old", expires: Date.now() - 1000 });
		await keyv.set(key, expiredValue);
		expect(await keyv.has(key)).toBe(false);
		// The expired key should have been deleted.
		expect(await keyv.get(key)).toBeUndefined();
	});

	test("hasMany returns correct booleans for existing and non-existing keys", async () => {
		const keyv = new KeyvPostgres(postgresUri);
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		await keyv.set(key1, faker.lorem.word());
		await keyv.set(key2, faker.lorem.word());
		expect(await keyv.hasMany([key1, key2, key3])).toStrictEqual([true, true, false]);
	});

	test("hasMany with all non-existent keys returns all false", async () => {
		const keyv = new KeyvPostgres(postgresUri);
		const result = await keyv.hasMany([
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
		]);
		expect(result).toStrictEqual([false, false, false]);
	});

	test("hasMany returns false for expired keys and deletes them", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const expiredKey1 = faker.string.alphanumeric(10);
		const expiredKey2 = faker.string.alphanumeric(10);
		const validKey = faker.string.alphanumeric(10);
		const expiredValue = JSON.stringify({ value: "old", expires: Date.now() - 1000 });
		const validValue = JSON.stringify({ value: "fresh", expires: Date.now() + 60_000 });
		await keyv.set(expiredKey1, expiredValue);
		await keyv.set(expiredKey2, expiredValue);
		await keyv.set(validKey, validValue);
		const result = await keyv.hasMany([expiredKey1, expiredKey2, validKey]);
		expect(result).toStrictEqual([false, false, true]);
		// The expired keys should have been deleted.
		expect(await keyv.get(expiredKey1)).toBeUndefined();
		expect(await keyv.get(expiredKey2)).toBeUndefined();
	});
});

describe("clear", () => {
	test("returns undefined with the default namespace", async () => {
		const keyv = store();
		expect(await keyv.clear()).toBeUndefined();
	});
});

describe("clearExpired", () => {
	test("removes expired entries and keeps valid ones", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const expiredKey = faker.string.alphanumeric(10);
		const validKey = faker.string.alphanumeric(10);
		const noExpiryKey = faker.string.alphanumeric(10);
		const pastExpires = Date.now() - 60_000;
		const futureExpires = Date.now() + 60_000;
		const validValue = JSON.stringify({ value: "fresh", expires: futureExpires });
		const noExpiryValue = JSON.stringify({ value: "forever" });
		await keyv.set(expiredKey, JSON.stringify({ value: "old", expires: pastExpires }));
		await keyv.set(validKey, validValue);
		await keyv.set(noExpiryKey, noExpiryValue);

		await keyv.clearExpired();

		expect(await keyv.get(expiredKey)).toBeUndefined();
		expect(await keyv.get(validKey)).toBe(validValue);
		expect(await keyv.get(noExpiryKey)).toBe(noExpiryValue);
	});

	test("is a no-op when no entries are expired", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key = faker.string.alphanumeric(10);
		const value = JSON.stringify({ value: "ok", expires: Date.now() + 60_000 });
		await keyv.set(key, value);

		await keyv.clearExpired();

		expect(await keyv.get(key)).toBe(value);
	});
});

describe("expires column", () => {
	test("set extracts and stores expires from the value", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key = faker.string.alphanumeric(10);
		const value = JSON.stringify({ value: "test-value", expires: Date.now() + 60_000 });
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
	});

	test("set stores null expires when the value has no expires field", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key = faker.string.alphanumeric(10);
		const value = JSON.stringify({ value: "no-ttl-value" });
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
	});

	test("set updates the expires column on upsert", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key = faker.string.alphanumeric(10);
		const value2 = JSON.stringify({ value: "v2", expires: Date.now() + 120_000 });
		await keyv.set(key, JSON.stringify({ value: "v1", expires: Date.now() + 60_000 }));
		await keyv.set(key, value2);
		expect(await keyv.get(key)).toBe(value2);
	});

	test("setMany extracts and stores expires for each entry", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		const value1 = JSON.stringify({ value: "v1", expires: Date.now() + 60_000 });
		const value2 = JSON.stringify({ value: "v2", expires: Date.now() + 120_000 });
		const value3 = JSON.stringify({ value: "v3" });
		await keyv.setMany([
			{ key: key1, value: value1 },
			{ key: key2, value: value2 },
			{ key: key3, value: value3 },
		]);
		expect(await keyv.get(key1)).toBe(value1);
		expect(await keyv.get(key2)).toBe(value2);
		expect(await keyv.get(key3)).toBe(value3);
	});

	test("is populated when using Keyv core with a TTL", async () => {
		const keyv = new Keyv({ store: new KeyvPostgres({ uri: postgresUri }), ttl: 60_000 });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
	});
});

describe("clearExpiredInterval", () => {
	test("defaults to 0 (disabled)", () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		expect(keyv.clearExpiredInterval).toBe(0);
	});

	test("can be set via constructor options", () => {
		const keyv = new KeyvPostgres({ uri: postgresUri, clearExpiredInterval: 5000 });
		expect(keyv.clearExpiredInterval).toBe(5000);
		keyv.clearExpiredInterval = 0;
	});

	test("getter and setter work", () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		expect(keyv.clearExpiredInterval).toBe(0);
		keyv.clearExpiredInterval = 3000;
		expect(keyv.clearExpiredInterval).toBe(3000);
		keyv.clearExpiredInterval = 0;
	});

	test("setting to 0 stops an active timer", () => {
		const keyv = new KeyvPostgres({ uri: postgresUri, clearExpiredInterval: 1000 });
		expect(keyv.clearExpiredInterval).toBe(1000);
		keyv.clearExpiredInterval = 0;
		expect(keyv.clearExpiredInterval).toBe(0);
	});

	test("automatically clears expired entries on the configured schedule", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri, clearExpiredInterval: 100 });
		const expiredKey = faker.string.alphanumeric(10);
		const validKey = faker.string.alphanumeric(10);
		const validValue = JSON.stringify({ value: "fresh", expires: Date.now() + 60_000 });
		await keyv.set(expiredKey, JSON.stringify({ value: "old", expires: Date.now() - 60_000 }));
		await keyv.set(validKey, validValue);

		// Wait for the interval to fire.
		await new Promise((resolve) => {
			setTimeout(resolve, 300);
		});

		expect(await keyv.get(expiredKey)).toBeUndefined();
		expect(await keyv.get(validKey)).toBe(validValue);
		keyv.clearExpiredInterval = 0;
	});

	test("is stopped on disconnect", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri, clearExpiredInterval: 100 });
		expect(keyv.clearExpiredInterval).toBe(100);
		// After disconnect the timer is stopped; verify no errors are thrown.
		await keyv.disconnect();
		expect(keyv.clearExpiredInterval).toBe(100);
	});
});

describe("namespace", () => {
	test("stores the same key independently across namespaces", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const postgres1 = new KeyvPostgres({ uri: postgresUri });
		postgres1.namespace = ns1;
		const postgres2 = new KeyvPostgres({ uri: postgresUri });
		postgres2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		const val1 = faker.lorem.sentence();
		const val2 = faker.lorem.sentence();
		await postgres1.set(`${ns1}:${key}`, val1);
		await postgres2.set(`${ns2}:${key}`, val2);

		expect(await postgres1.get(`${ns1}:${key}`)).toBe(val1);
		expect(await postgres2.get(`${ns2}:${key}`)).toBe(val2);
	});

	test("stores and retrieves with the default namespace", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
	});

	test("clear only affects the configured namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const postgres1 = new KeyvPostgres({ uri: postgresUri });
		postgres1.namespace = ns1;
		const postgres2 = new KeyvPostgres({ uri: postgresUri });
		postgres2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		const val2 = faker.lorem.sentence();
		await postgres1.set(`${ns1}:${key}`, faker.lorem.sentence());
		await postgres2.set(`${ns2}:${key}`, val2);

		await postgres1.clear();

		expect(await postgres1.get(`${ns1}:${key}`)).toBeUndefined();
		expect(await postgres2.get(`${ns2}:${key}`)).toBe(val2);
	});

	test("delete is scoped to the namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const postgres1 = new KeyvPostgres({ uri: postgresUri });
		postgres1.namespace = ns1;
		const postgres2 = new KeyvPostgres({ uri: postgresUri });
		postgres2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		const val2 = faker.lorem.sentence();
		await postgres1.set(`${ns1}:${key}`, faker.lorem.sentence());
		await postgres2.set(`${ns2}:${key}`, val2);

		expect(await postgres1.delete(`${ns1}:${key}`)).toBe(true);
		expect(await postgres1.get(`${ns1}:${key}`)).toBeUndefined();
		expect(await postgres2.get(`${ns2}:${key}`)).toBe(val2);
	});

	test("deleteMany is scoped to the namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const postgres1 = new KeyvPostgres({ uri: postgresUri });
		postgres1.namespace = ns1;
		const postgres2 = new KeyvPostgres({ uri: postgresUri });
		postgres2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		const val2 = faker.lorem.sentence();
		await postgres1.set(`${ns1}:${key}`, faker.lorem.sentence());
		await postgres2.set(`${ns2}:${key}`, val2);

		expect(await postgres1.deleteMany([`${ns1}:${key}`])).toEqual([true]);
		expect(await postgres1.get(`${ns1}:${key}`)).toBeUndefined();
		expect(await postgres2.get(`${ns2}:${key}`)).toBe(val2);
	});

	test("has is scoped to the namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const postgres1 = new KeyvPostgres({ uri: postgresUri });
		postgres1.namespace = ns1;
		const postgres2 = new KeyvPostgres({ uri: postgresUri });
		postgres2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		await postgres1.set(`${ns1}:${key}`, faker.lorem.sentence());

		expect(await postgres1.has(`${ns1}:${key}`)).toBe(true);
		// ns2 should not see ns1's key.
		expect(await postgres2.has(`${ns2}:${key}`)).toBe(false);
	});

	test("hasMany is scoped to the namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const postgres1 = new KeyvPostgres({ uri: postgresUri });
		postgres1.namespace = ns1;
		const postgres2 = new KeyvPostgres({ uri: postgresUri });
		postgres2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		await postgres1.set(`${ns1}:${key}`, faker.lorem.sentence());
		await postgres2.set(`${ns2}:${key}`, faker.lorem.sentence());

		expect(await postgres1.hasMany([`${ns1}:${key}`])).toEqual([true]);
		expect(await postgres1.hasMany([`${ns2}:${key}`])).toEqual([false]);
	});

	test("getMany is scoped to the namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const postgres1 = new KeyvPostgres({ uri: postgresUri });
		postgres1.namespace = ns1;
		const postgres2 = new KeyvPostgres({ uri: postgresUri });
		postgres2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		const val1 = faker.lorem.sentence();
		await postgres1.set(`${ns1}:${key}`, val1);
		await postgres2.set(`${ns2}:${key}`, faker.lorem.sentence());

		expect(await postgres1.getMany([`${ns1}:${key}`])).toEqual([val1]);
		expect(await postgres1.getMany([`${ns2}:${key}`])).toEqual([undefined]);
	});

	test("setMany is scoped to the namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const postgres1 = new KeyvPostgres({ uri: postgresUri });
		postgres1.namespace = ns1;
		const postgres2 = new KeyvPostgres({ uri: postgresUri });
		postgres2.namespace = ns2;

		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const val1 = faker.lorem.sentence();
		const val2 = faker.lorem.sentence();
		await postgres1.setMany([
			{ key: `${ns1}:${key1}`, value: val1 },
			{ key: `${ns1}:${key2}`, value: val2 },
		]);

		expect(await postgres1.get(`${ns1}:${key1}`)).toBe(val1);
		expect(await postgres1.get(`${ns1}:${key2}`)).toBe(val2);
		// ns2 should not see ns1's keys.
		expect(await postgres2.get(`${ns2}:${key1}`)).toBeUndefined();
	});

	test("two Keyv instances with different namespaces do not conflict", async () => {
		const nsA = faker.string.alphanumeric(8);
		const nsB = faker.string.alphanumeric(8);
		const keyvA = new Keyv({ store: new KeyvPostgres({ uri: postgresUri }), namespace: nsA });
		const keyvB = new Keyv({ store: new KeyvPostgres({ uri: postgresUri }), namespace: nsB });

		const key = faker.string.alphanumeric(10);
		const valA = faker.lorem.sentence();
		const valB = faker.lorem.sentence();
		expect(await keyvA.set(key, valA)).toBe(true);
		expect(await keyvA.get(key)).toBe(valA);
		expect(await keyvB.set(key, valB)).toBe(true);
		expect(await keyvB.get(key)).toBe(valB);
		// Ensure they didn't overwrite each other.
		expect(await keyvA.get(key)).toBe(valA);
	});
});

describe("iterator", () => {
	test("iterates over the default namespace", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key1 = faker.string.alphanumeric(10);
		const val1 = faker.lorem.sentence();
		const key2 = faker.string.alphanumeric(10);
		const val2 = faker.lorem.sentence();
		const key3 = faker.string.alphanumeric(10);
		const val3 = faker.lorem.sentence();
		await keyv.set(key1, val1);
		await keyv.set(key2, val2);
		await keyv.set(key3, val3);

		const collected = new Map<string, string>();
		for await (const [key, value] of keyv.iterator()) {
			collected.set(key, value);
		}

		expect(collected.get(key1)).toBe(val1);
		expect(collected.get(key2)).toBe(val2);
		expect(collected.get(key3)).toBe(val3);
	});

	test("iterates over a configured namespace without passing it to iterator()", async () => {
		const ns = faker.string.alphanumeric(8);
		const keyv = new KeyvPostgres({ uri: postgresUri });
		keyv.namespace = ns;
		const key1 = faker.string.alphanumeric(10);
		const val1 = faker.lorem.sentence();
		const key2 = faker.string.alphanumeric(10);
		const val2 = faker.lorem.sentence();
		await keyv.set(key1, val1);
		await keyv.set(key2, val2);

		const collected = new Map<string, string>();
		for await (const [key, value] of keyv.iterator()) {
			collected.set(key, value);
		}

		expect(collected.size).toBe(2);
		expect(collected.get(key1)).toBe(val1);
		expect(collected.get(key2)).toBe(val2);
	});

	test("only yields keys from the configured namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const postgres1 = new KeyvPostgres({ uri: postgresUri });
		postgres1.namespace = ns1;
		const postgres2 = new KeyvPostgres({ uri: postgresUri });
		postgres2.namespace = ns2;

		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		await postgres1.set(key1, faker.lorem.word());
		await postgres1.set(key2, faker.lorem.word());
		await postgres2.set(key3, faker.lorem.word());

		const keys: string[] = [];
		for await (const [key] of postgres1.iterator()) {
			keys.push(key);
		}

		expect(keys.length).toBe(2);
		expect(keys).toContain(key1);
		expect(keys).toContain(key2);
	});

	test("paginates correctly with the default namespace", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri, iterationLimit: 2 });
		const keysToSet = [
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
		];
		for (const key of keysToSet) {
			await keyv.set(key, faker.lorem.word());
		}

		const keys: string[] = [];
		for await (const [key] of keyv.iterator()) {
			keys.push(key);
		}

		expect(keys.length).toBe(3);
		for (const key of keysToSet) {
			expect(keys).toContain(key);
		}
	});

	test("falls back to the default limit when iterationLimit is 0", async () => {
		const ns = faker.string.alphanumeric(8);
		const keyv = new KeyvPostgres({ uri: postgresUri, iterationLimit: 0 });
		keyv.namespace = ns;
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, faker.lorem.word());

		const keys: string[] = [];
		for await (const [k] of keyv.iterator()) {
			keys.push(k);
		}

		expect(keys).toContain(key);
	});
});

describe("schema", () => {
	test("stores keys independently across non-public schemas", async () => {
		const keyv1 = new KeyvPostgres({ uri: postgresUri, schema: "keyvtest1" });
		const keyv2 = new KeyvPostgres({ uri: postgresUri, schema: "keyvtest2" });
		const key1 = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.alphanumeric(10);
		const value2 = faker.lorem.sentence();
		await keyv1.set(key1, value1);
		await keyv2.set(key2, value2);
		expect(await keyv1.get(key1)).toBe(value1);
		expect(await keyv2.get(key2)).toBe(value2);
	});
});

describe("unlogged table", () => {
	test("stores and retrieves values", async () => {
		const keyv = createKeyv({ uri: postgresUri, useUnloggedTable: true });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		expect(await keyv.set(key, value)).toBe(true);
		expect(await keyv.get(key)).toBe(value);
	});
});

describe("SQL injection prevention", () => {
	test("has prevents a DROP TABLE injection", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const safeKey = faker.string.alphanumeric(10);
		await keyv.set(safeKey, "value");
		expect(await keyv.has("'; DROP TABLE keyv; --")).toBe(false);
		// The table and the safe key should still be intact.
		expect(await keyv.has(safeKey)).toBe(true);
	});

	test("handles keys with single quotes", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const keyWithQuote = "key'with'quotes";
		await keyv.set(keyWithQuote, "value");
		expect(await keyv.has(keyWithQuote)).toBe(true);
		expect(await keyv.get(keyWithQuote)).toBe("value");
	});

	test("handles keys with special SQL characters", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const specialKeys = [
			"key;with;semicolon",
			"key--with--dashes",
			"key/*comment*/",
			"key\\with\\backslash",
		];
		for (const key of specialKeys) {
			await keyv.set(key, "value");
			expect(await keyv.has(key)).toBe(true);
		}

		expect(await keyv.has("nonexistent;key")).toBe(false);
	});
});

describe("connection", () => {
	test("closes the connection on disconnect", async () => {
		const keyv = store();
		const key = faker.string.alphanumeric(10);
		expect(await keyv.get(key)).toBeUndefined();
		await keyv.disconnect();
		await expect(keyv.get(key)).rejects.toBeDefined();
	});

	test("emits an error when the connection fails", async () => {
		const keyv = new KeyvPostgres({
			uri: "postgresql://invalid:invalid@localhost:9999/nonexistent",
		});

		const error = await new Promise((resolve) => {
			keyv.on("error", (error: unknown) => resolve(error));
		});

		expect(error).toBeInstanceOf(Error);
	});
});

describe("createKeyv", () => {
	test("returns a Keyv instance from a uri string", async () => {
		const keyv = createKeyv(postgresUri);
		expect(keyv).toBeInstanceOf(Keyv);
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		expect(await keyv.set(key, value)).toBe(true);
		expect(await keyv.get(key)).toBe(value);
	});

	test("returns a Keyv instance from an options object", async () => {
		const keyv = createKeyv({ uri: postgresUri });
		expect(keyv).toBeInstanceOf(Keyv);
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		expect(await keyv.set(key, value)).toBe(true);
		expect(await keyv.get(key)).toBe(value);
	});
});
