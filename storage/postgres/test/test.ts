import { faker } from "@faker-js/faker";
import keyvTestSuite, { keyvIteratorTests } from "@keyv/test-suite";
import Keyv from "keyv";
import * as test from "vitest";
import KeyvPostgres, { createKeyv } from "../src/index.js";

const postgresUri = "postgresql://postgres:postgres@localhost:5432/keyv_test";

const store = () => new KeyvPostgres({ uri: postgresUri, iterationLimit: 2 });
keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test.beforeEach(async () => {
	const keyv = store();
	await keyv.clear();
});

test.it("should be able to pass in just uri as string", async (t) => {
	const keyv = new KeyvPostgres(postgresUri);
	const key = faker.string.alphanumeric(10);
	const value = faker.lorem.sentence();
	await keyv.set(key, value);
	t.expect(await keyv.get(key)).toBe(value);
});

test.it("test schema as non public", async (t) => {
	const keyv1 = new KeyvPostgres({
		uri: "postgresql://postgres:postgres@localhost:5432/keyv_test",
		schema: "keyvtest1",
	});
	const keyv2 = new KeyvPostgres({
		uri: "postgresql://postgres:postgres@localhost:5432/keyv_test",
		schema: "keyvtest2",
	});
	const key1 = faker.string.alphanumeric(10);
	const value1 = faker.lorem.sentence();
	const key2 = faker.string.alphanumeric(10);
	const value2 = faker.lorem.sentence();
	await keyv1.set(key1, value1);
	await keyv2.set(key2, value2);
	t.expect(await keyv1.get(key1)).toBe(value1);
	t.expect(await keyv2.get(key2)).toBe(value2);
});

test.it("iterator with default namespace", async (t) => {
	const keyv = new KeyvPostgres({ uri: postgresUri });
	const key1 = faker.string.alphanumeric(10);
	const value1 = faker.lorem.sentence();
	const key2 = faker.string.alphanumeric(10);
	const value2 = faker.lorem.sentence();
	const key3 = faker.string.alphanumeric(10);
	const value3 = faker.lorem.sentence();
	await keyv.set(key1, value1);
	await keyv.set(key2, value2);
	await keyv.set(key3, value3);

	const keys: string[] = [];
	const values: string[] = [];
	for await (const [key, value] of keyv.iterator()) {
		keys.push(key);
		values.push(value as string);
	}

	t.expect(keys).toContain(key1);
	t.expect(keys).toContain(key2);
	t.expect(keys).toContain(key3);
	t.expect(values).toContain(value1);
	t.expect(values).toContain(value2);
	t.expect(values).toContain(value3);
});

test.it(".clear() with undefined namespace", async (t) => {
	const keyv = store();
	t.expect(await keyv.clear()).toBeUndefined();
});

test.it("close connection successfully", async (t) => {
	const keyv = store();
	const key = faker.string.alphanumeric(10);
	t.expect(await keyv.get(key)).toBeUndefined();
	await keyv.disconnect();
	try {
		await keyv.get(key);
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	}
});

test.it(
	"create two instances and make sure they do not conflict",
	async (t) => {
		const postgresUri =
			"postgresql://postgres:postgres@localhost:5432/keyv_test";
		const postgresA = new KeyvPostgres({ uri: postgresUri });
		const postgresB = new KeyvPostgres({ uri: postgresUri });
		const keyvA = new Keyv({
			store: postgresA,
			namespace: "namespace-a",
		});
		const keyvB = new Keyv({
			store: postgresB,
			namespace: "namespace-b",
		});

		const key = faker.string.alphanumeric(10);
		const valueA = faker.lorem.sentence();
		const valueB = faker.lorem.sentence();

		t.expect(await keyvA.set(key, valueA)).toBe(true);
		t.expect(await keyvA.get(key)).toBe(valueA);
		t.expect(await keyvB.set(key, valueB)).toBe(true);
		t.expect(await keyvB.get(key)).toBe(valueB);
	},
);

test.it("helper to create Keyv instance with postgres", async (t) => {
	const keyv = createKeyv({ uri: postgresUri });
	const key = faker.string.alphanumeric(10);
	const value = faker.lorem.sentence();
	t.expect(await keyv.set(key, value)).toBe(true);
	t.expect(await keyv.get(key)).toBe(value);
});

test.it("test unlogged table", async (t) => {
	const keyv = createKeyv({ uri: postgresUri, useUnloggedTable: true });
	const key = faker.string.alphanumeric(10);
	const value = faker.lorem.sentence();
	t.expect(await keyv.set(key, value)).toBe(true);
	t.expect(await keyv.get(key)).toBe(value);
});

test.it(".setMany support", async (t) => {
	const keyv = new KeyvPostgres(postgresUri);
	const key1 = faker.string.alphanumeric(10);
	const value1 = faker.lorem.sentence();
	const key2 = faker.string.alphanumeric(10);
	const value2 = faker.lorem.sentence();
	const key3 = faker.string.alphanumeric(10);
	const value3 = faker.lorem.sentence();
	await keyv.set(key1, value1);
	await keyv.setMany([
		{ key: key1, value: value1 },
		{ key: key2, value: value2 },
		{ key: key3, value: value3 },
	]);
	t.expect(await keyv.getMany([key1, key2, key3])).toStrictEqual([
		value1,
		value2,
		value3,
	]);
});

test.it("emits error when connection fails", async (t) => {
	const errors: unknown[] = [];
	const keyv = new KeyvPostgres({
		uri: "postgresql://invalid:invalid@localhost:9999/nonexistent",
	});
	keyv.on("error", (error: unknown) => {
		errors.push(error);
	});

	// Wait for the connection attempt to fail
	await new Promise((resolve) => {
		setTimeout(resolve, 1000);
	});

	t.expect(errors.length).toBeGreaterThan(0);
});
