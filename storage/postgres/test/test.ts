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

test.it(
	".hasMany() returns correct booleans for existing and non-existing keys",
	async (t) => {
		const keyv = new KeyvPostgres(postgresUri);
		const key1 = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.alphanumeric(10);
		const value2 = faker.lorem.sentence();
		const key3 = faker.string.alphanumeric(10);
		await keyv.set(key1, value1);
		await keyv.set(key2, value2);
		const result = await keyv.hasMany([key1, key2, key3]);
		t.expect(result).toStrictEqual([true, true, false]);
	},
);

test.it(
	".hasMany() with all non-existent keys returns all false",
	async (t) => {
		const keyv = new KeyvPostgres(postgresUri);
		const result = await keyv.hasMany([
			"nonexistent1",
			"nonexistent2",
			"nonexistent3",
		]);
		t.expect(result).toStrictEqual([false, false, false]);
	},
);

test.it("should have correct default property values", (t) => {
	const keyv = new KeyvPostgres();
	t.expect(keyv.uri).toBe("postgresql://localhost:5432");
	t.expect(keyv.table).toBe("keyv");
	t.expect(keyv.keySize).toBe(255);
	t.expect(keyv.schema).toBe("public");
	t.expect(keyv.iterationLimit).toBe(10);
	t.expect(keyv.useUnloggedTable).toBe(false);
	t.expect(keyv.ssl).toBeUndefined();
	t.expect(keyv.namespace).toBeUndefined();
	t.expect(keyv.namespacePrefix).toBe("keyv_");
});

test.it("should set properties from constructor options", (t) => {
	const keyv = new KeyvPostgres({
		uri: postgresUri,
		table: "custom_table",
		keySize: 512,
		schema: "custom_schema",
		iterationLimit: 50,
		useUnloggedTable: true,
		ssl: { rejectUnauthorized: false },
	});
	t.expect(keyv.uri).toBe(postgresUri);
	t.expect(keyv.table).toBe("custom_table");
	t.expect(keyv.keySize).toBe(512);
	t.expect(keyv.schema).toBe("custom_schema");
	t.expect(keyv.iterationLimit).toBe(50);
	t.expect(keyv.useUnloggedTable).toBe(true);
	t.expect(keyv.ssl).toEqual({ rejectUnauthorized: false });
});

test.it("should set uri when string is passed to constructor", (t) => {
	const keyv = new KeyvPostgres(postgresUri);
	t.expect(keyv.uri).toBe(postgresUri);
	t.expect(keyv.table).toBe("keyv");
	t.expect(keyv.schema).toBe("public");
});

test.it("should be able to get and set individual properties", (t) => {
	const keyv = new KeyvPostgres({ uri: postgresUri });
	keyv.table = "new_table";
	t.expect(keyv.table).toBe("new_table");
	keyv.schema = "new_schema";
	t.expect(keyv.schema).toBe("new_schema");
	keyv.keySize = 512;
	t.expect(keyv.keySize).toBe(512);
	keyv.iterationLimit = 25;
	t.expect(keyv.iterationLimit).toBe(25);
	keyv.useUnloggedTable = true;
	t.expect(keyv.useUnloggedTable).toBe(true);
	keyv.ssl = { rejectUnauthorized: false };
	t.expect(keyv.ssl).toEqual({ rejectUnauthorized: false });
	keyv.uri = "postgresql://localhost:5433";
	t.expect(keyv.uri).toBe("postgresql://localhost:5433");
	keyv.namespace = "test-ns";
	t.expect(keyv.namespace).toBe("test-ns");
	keyv.namespace = undefined;
	t.expect(keyv.namespace).toBeUndefined();
});

test.it("opts getter should return correct object", (t) => {
	const keyv = new KeyvPostgres({
		uri: postgresUri,
		table: "opts_table",
		iterationLimit: 99,
	});
	const opts = keyv.opts;
	t.expect(opts.table).toBe("opts_table");
	t.expect(opts.iterationLimit).toBe(99);
	t.expect(opts.dialect).toBe("postgres");
	t.expect(opts.uri).toBe(postgresUri);
	t.expect(opts.schema).toBe("public");
	t.expect(opts.keySize).toBe(255);
	t.expect(opts.useUnloggedTable).toBe(false);
	t.expect(opts.namespacePrefix).toBe("keyv_");
});

test.it("opts setter should update individual properties", (t) => {
	const keyv = new KeyvPostgres({ uri: postgresUri });
	keyv.opts = {
		table: "updated_table",
		schema: "updated_schema",
		keySize: 1024,
	};
	t.expect(keyv.table).toBe("updated_table");
	t.expect(keyv.schema).toBe("updated_schema");
	t.expect(keyv.keySize).toBe(1024);
	t.expect(keyv.uri).toBe(postgresUri);
});

test.it("emits error when connection fails", async (t) => {
	const keyv = new KeyvPostgres({
		uri: "postgresql://invalid:invalid@localhost:9999/nonexistent",
	});

	const error = await new Promise((resolve) => {
		keyv.on("error", (error: unknown) => resolve(error));
	});

	t.expect(error).toBeInstanceOf(Error);
});

test.it("namespacePrefix getter and setter", (t) => {
	const keyv = new KeyvPostgres({ uri: postgresUri });
	t.expect(keyv.namespacePrefix).toBe("keyv_");
	keyv.namespacePrefix = "cache_";
	t.expect(keyv.namespacePrefix).toBe("cache_");
});

test.it("namespacePrefix can be set from constructor options", (t) => {
	const keyv = new KeyvPostgres({
		uri: postgresUri,
		namespacePrefix: "app_",
	});
	t.expect(keyv.namespacePrefix).toBe("app_");
});

test.it(
	"namespace-per-table: two namespaces use separate tables with data isolation",
	async (t) => {
		const storeA = new KeyvPostgres({ uri: postgresUri });
		const storeB = new KeyvPostgres({ uri: postgresUri });
		const keyvA = new Keyv({ store: storeA, namespace: "nstbl_a" });
		const keyvB = new Keyv({ store: storeB, namespace: "nstbl_b" });

		const key = faker.string.alphanumeric(10);
		const valueA = faker.lorem.sentence();
		const valueB = faker.lorem.sentence();

		await keyvA.set(key, valueA);
		await keyvB.set(key, valueB);

		t.expect(await keyvA.get(key)).toBe(valueA);
		t.expect(await keyvB.get(key)).toBe(valueB);

		await keyvA.clear();
		await keyvB.clear();
	},
);

test.it(
	"namespace-per-table: clear() only clears the namespace table",
	async (t) => {
		const storeA = new KeyvPostgres({ uri: postgresUri });
		const storeB = new KeyvPostgres({ uri: postgresUri });
		const keyvA = new Keyv({ store: storeA, namespace: "clr_a" });
		const keyvB = new Keyv({ store: storeB, namespace: "clr_b" });

		await keyvA.set("foo", "bar");
		await keyvB.set("foo", "baz");

		await keyvA.clear();

		t.expect(await keyvA.get("foo")).toBeUndefined();
		t.expect(await keyvB.get("foo")).toBe("baz");

		await keyvB.clear();
	},
);

test.it(
	"namespace-per-table: iterator yields all entries from namespace table",
	async (t) => {
		const store = new KeyvPostgres({ uri: postgresUri });
		store.namespace = "iter_ns";
		await store.clear();
		await store.set("k1", "v1");
		await store.set("k2", "v2");
		await store.set("k3", "v3");

		const entries: Array<[string, string]> = [];
		for await (const entry of store.iterator()) {
			entries.push(entry);
		}

		t.expect(entries.length).toBe(3);
		const keys = entries.map(([k]) => k);
		t.expect(keys).toContain("k1");
		t.expect(keys).toContain("k2");
		t.expect(keys).toContain("k3");

		await store.clear();
	},
);

test.it(
	"namespace-per-table: custom namespacePrefix creates correct table",
	async (t) => {
		const store = new KeyvPostgres({
			uri: postgresUri,
			namespacePrefix: "cache_",
		});
		store.namespace = "tokens";
		await store.set("t1", "val1");
		t.expect(await store.get("t1")).toBe("val1");
		await store.clear();
	},
);

test.it(
	"namespace-per-table: no namespace uses prefix as table name",
	async (t) => {
		const store = new KeyvPostgres({ uri: postgresUri });
		// No namespace set — table should be "keyv"
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await store.set(key, value);
		t.expect(await store.get(key)).toBe(value);
	},
);
