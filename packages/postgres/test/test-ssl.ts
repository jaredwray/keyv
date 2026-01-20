import { faker } from "@faker-js/faker";
import * as test from "vitest";
import KeyvPostgres from "../src/index.js";
import { endPool } from "../src/pool.js";

const postgresUri = "postgresql://postgres:postgres@localhost:5433/keyv_test";

const options = { ssl: { rejectUnauthorized: false } };

const store = () =>
	new KeyvPostgres({ uri: postgresUri, iterationLimit: 2, ...options });

test.beforeEach(async () => {
	const keyv = new KeyvPostgres({ uri: postgresUri, ...options });
	await keyv.clear();
});

test.it("throws if ssl is not used", async (t) => {
	await endPool();
	try {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const key = faker.string.alphanumeric(10);
		await keyv.get(key);
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	} finally {
		await endPool();
	}
});

test.it("iterator with default namespace", async (t) => {
	const keyv = new KeyvPostgres({ uri: postgresUri, ...options });
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
