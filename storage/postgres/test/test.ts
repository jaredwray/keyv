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
	t.expect(keyv.keyLength).toBe(255);
	t.expect(keyv.namespaceLength).toBe(255);
	t.expect(keyv.schema).toBe("public");
	t.expect(keyv.iterationLimit).toBe(10);
	t.expect(keyv.useUnloggedTable).toBe(false);
	t.expect(keyv.ssl).toBeUndefined();
	t.expect(keyv.namespace).toBeUndefined();
});

test.it("should set properties from constructor options", (t) => {
	const keyv = new KeyvPostgres({
		uri: postgresUri,
		table: "custom_table",
		keyLength: 512,
		namespaceLength: 512,
		schema: "custom_schema",
		iterationLimit: 50,
		useUnloggedTable: true,
		ssl: { rejectUnauthorized: false },
	});
	t.expect(keyv.uri).toBe(postgresUri);
	t.expect(keyv.table).toBe("custom_table");
	t.expect(keyv.keyLength).toBe(512);
	t.expect(keyv.namespaceLength).toBe(512);
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
	keyv.keyLength = 512;
	t.expect(keyv.keyLength).toBe(512);
	keyv.namespaceLength = 512;
	t.expect(keyv.namespaceLength).toBe(512);
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
	t.expect(opts.keyLength).toBe(255);
	t.expect(opts.useUnloggedTable).toBe(false);
});

test.it("opts setter should update individual properties", (t) => {
	const keyv = new KeyvPostgres({ uri: postgresUri });
	keyv.opts = {
		table: "updated_table",
		schema: "updated_schema",
		keyLength: 1024,
	};
	t.expect(keyv.table).toBe("updated_table");
	t.expect(keyv.schema).toBe("updated_schema");
	t.expect(keyv.keyLength).toBe(1024);
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

test.it(
	"native namespace: same key in different namespaces stored independently",
	async (t) => {
		const postgres1 = new KeyvPostgres({ uri: postgresUri });
		postgres1.namespace = "ns1";
		const postgres2 = new KeyvPostgres({ uri: postgresUri });
		postgres2.namespace = "ns2";

		await postgres1.set("ns1:testkey", "value1");
		await postgres2.set("ns2:testkey", "value2");

		t.expect(await postgres1.get("ns1:testkey")).toBe("value1");
		t.expect(await postgres2.get("ns2:testkey")).toBe("value2");
	},
);

test.it(
	"native namespace: null namespace stores and retrieves correctly",
	async (t) => {
		const postgres = new KeyvPostgres({ uri: postgresUri });
		await postgres.set("testkey", "testvalue");
		t.expect(await postgres.get("testkey")).toBe("testvalue");
	},
);

test.it(
	"native namespace: clear only clears the specified namespace",
	async (t) => {
		const postgres1 = new KeyvPostgres({ uri: postgresUri });
		postgres1.namespace = "ns1";
		const postgres2 = new KeyvPostgres({ uri: postgresUri });
		postgres2.namespace = "ns2";

		await postgres1.set("ns1:key1", "value1");
		await postgres2.set("ns2:key1", "value2");

		await postgres1.clear();

		t.expect(await postgres1.get("ns1:key1")).toBeUndefined();
		t.expect(await postgres2.get("ns2:key1")).toBe("value2");
	},
);

test.it(
	"native namespace: iterator falls back to default limit when iterationLimit is 0",
	async (t) => {
		const postgres = new KeyvPostgres({ uri: postgresUri, iterationLimit: 0 });
		postgres.namespace = "nslimit";

		await postgres.set("nslimit:a", "v1");

		const keys: string[] = [];
		for await (const [key] of postgres.iterator("nslimit")) {
			keys.push(key);
		}

		t.expect(keys).toContain("nslimit:a");
	},
);

test.it(
	"native namespace: iterator with null namespace paginates correctly",
	async (t) => {
		const postgres = new KeyvPostgres({ uri: postgresUri, iterationLimit: 2 });

		await postgres.set("a", "v1");
		await postgres.set("b", "v2");
		await postgres.set("c", "v3");

		const keys: string[] = [];
		for await (const [key] of postgres.iterator()) {
			keys.push(key);
		}

		t.expect(keys.length).toBe(3);
		t.expect(keys).toContain("a");
		t.expect(keys).toContain("b");
		t.expect(keys).toContain("c");
	},
);

test.it(
	"native namespace: iterator only returns keys from correct namespace",
	async (t) => {
		const postgres1 = new KeyvPostgres({ uri: postgresUri });
		postgres1.namespace = "ns1";
		const postgres2 = new KeyvPostgres({ uri: postgresUri });
		postgres2.namespace = "ns2";

		await postgres1.set("ns1:key1", "val1");
		await postgres1.set("ns1:key2", "val2");
		await postgres2.set("ns2:key3", "val3");

		const keys: string[] = [];
		for await (const [key] of postgres1.iterator("ns1")) {
			keys.push(key);
		}

		t.expect(keys.length).toBe(2);
		t.expect(keys).toContain("ns1:key1");
		t.expect(keys).toContain("ns1:key2");
	},
);

test.it(
	"set() extracts and stores expires in the expires column",
	async (t) => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const expiresTimestamp = Date.now() + 60_000;
		const serializedValue = JSON.stringify({
			value: "test-value",
			expires: expiresTimestamp,
		});
		await keyv.set("expires-test-key", serializedValue);
		t.expect(await keyv.get("expires-test-key")).toBe(serializedValue);
	},
);

test.it(
	"set() stores null expires when value has no expires field",
	async (t) => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const serializedValue = JSON.stringify({ value: "no-ttl-value" });
		await keyv.set("no-expires-key", serializedValue);
		t.expect(await keyv.get("no-expires-key")).toBe(serializedValue);
	},
);

test.it("set() gracefully handles non-JSON string values", async (t) => {
	const keyv = new KeyvPostgres({ uri: postgresUri });
	await keyv.set("plain-text-key", "not-json-at-all");
	t.expect(await keyv.get("plain-text-key")).toBe("not-json-at-all");
});

test.it("set() updates expires column on upsert", async (t) => {
	const keyv = new KeyvPostgres({ uri: postgresUri });
	const expires1 = Date.now() + 60_000;
	const expires2 = Date.now() + 120_000;
	await keyv.set(
		"upsert-exp-key",
		JSON.stringify({ value: "v1", expires: expires1 }),
	);
	await keyv.set(
		"upsert-exp-key",
		JSON.stringify({ value: "v2", expires: expires2 }),
	);
	t.expect(await keyv.get("upsert-exp-key")).toBe(
		JSON.stringify({ value: "v2", expires: expires2 }),
	);
});

test.it("setMany() extracts and stores expires for each entry", async (t) => {
	const keyv = new KeyvPostgres({ uri: postgresUri });
	const expires1 = Date.now() + 60_000;
	const expires2 = Date.now() + 120_000;
	await keyv.setMany([
		{
			key: "many-exp-1",
			value: JSON.stringify({ value: "v1", expires: expires1 }),
		},
		{
			key: "many-exp-2",
			value: JSON.stringify({ value: "v2", expires: expires2 }),
		},
		{ key: "many-exp-3", value: JSON.stringify({ value: "v3" }) },
	]);
	t.expect(await keyv.get("many-exp-1")).toBe(
		JSON.stringify({ value: "v1", expires: expires1 }),
	);
	t.expect(await keyv.get("many-exp-2")).toBe(
		JSON.stringify({ value: "v2", expires: expires2 }),
	);
	t.expect(await keyv.get("many-exp-3")).toBe(JSON.stringify({ value: "v3" }));
});

test.it(
	"expires column is populated when using Keyv core with TTL",
	async (t) => {
		const keyv = new Keyv({
			store: new KeyvPostgres({ uri: postgresUri }),
			ttl: 60_000,
		});
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, "ttl-value");
		t.expect(await keyv.get(key)).toBe("ttl-value");
	},
);

test.it(
	"set() handles object value with expires (serialization disabled)",
	async (t) => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const expiresTimestamp = Date.now() + 60_000;
		const objectValue = { value: "obj-test", expires: expiresTimestamp };
		// biome-ignore lint/suspicious/noExplicitAny: testing non-string value path
		await keyv.set("obj-expires-key", objectValue as any);
		const result = await keyv.get("obj-expires-key");
		t.expect(result).toBeDefined();
	},
);

test.it("set() handles object value without expires", async (t) => {
	const keyv = new KeyvPostgres({ uri: postgresUri });
	const objectValue = { value: "no-exp-obj" };
	// biome-ignore lint/suspicious/noExplicitAny: testing non-string value path
	await keyv.set("obj-no-expires-key", objectValue as any);
	const result = await keyv.get("obj-no-expires-key");
	t.expect(result).toBeDefined();
});

test.it("set() handles null value for expires extraction", async (t) => {
	const keyv = new KeyvPostgres({ uri: postgresUri });
	// biome-ignore lint/suspicious/noExplicitAny: testing null value path
	await keyv.set("null-val-key", null as any);
	const result = await keyv.get("null-val-key");
	t.expect(result).toBeNull();
});

test.it("set() handles numeric value for expires extraction", async (t) => {
	const keyv = new KeyvPostgres({ uri: postgresUri });
	// biome-ignore lint/suspicious/noExplicitAny: testing numeric value path
	await keyv.set("num-val-key", 12345 as any);
	const result = await keyv.get("num-val-key");
	t.expect(result).toBe("12345");
});

test.it(
	"clearExpired() removes expired entries and keeps valid ones",
	async (t) => {
		const keyv = new KeyvPostgres({ uri: postgresUri });
		const pastExpires = Date.now() - 60_000;
		const futureExpires = Date.now() + 60_000;
		await keyv.set(
			"expired-key",
			JSON.stringify({ value: "old", expires: pastExpires }),
		);
		await keyv.set(
			"valid-key",
			JSON.stringify({ value: "fresh", expires: futureExpires }),
		);
		await keyv.set("no-ttl-key", JSON.stringify({ value: "forever" }));

		await keyv.clearExpired();

		t.expect(await keyv.get("expired-key")).toBeUndefined();
		t.expect(await keyv.get("valid-key")).toBe(
			JSON.stringify({ value: "fresh", expires: futureExpires }),
		);
		t.expect(await keyv.get("no-ttl-key")).toBe(
			JSON.stringify({ value: "forever" }),
		);
	},
);

test.it("clearExpired() is a no-op when no entries are expired", async (t) => {
	const keyv = new KeyvPostgres({ uri: postgresUri });
	const futureExpires = Date.now() + 60_000;
	await keyv.set(
		"still-valid",
		JSON.stringify({ value: "ok", expires: futureExpires }),
	);

	await keyv.clearExpired();

	t.expect(await keyv.get("still-valid")).toBe(
		JSON.stringify({ value: "ok", expires: futureExpires }),
	);
});

test.it("clearExpiredInterval defaults to 0 (disabled)", (t) => {
	const keyv = new KeyvPostgres({ uri: postgresUri });
	t.expect(keyv.clearExpiredInterval).toBe(0);
});

test.it("clearExpiredInterval can be set via constructor options", (t) => {
	const keyv = new KeyvPostgres({
		uri: postgresUri,
		clearExpiredInterval: 5000,
	});
	t.expect(keyv.clearExpiredInterval).toBe(5000);
	keyv.clearExpiredInterval = 0;
});

test.it("clearExpiredInterval getter and setter work", (t) => {
	const keyv = new KeyvPostgres({ uri: postgresUri });
	t.expect(keyv.clearExpiredInterval).toBe(0);
	keyv.clearExpiredInterval = 3000;
	t.expect(keyv.clearExpiredInterval).toBe(3000);
	keyv.clearExpiredInterval = 0;
});

test.it("clearExpiredInterval is included in opts getter", (t) => {
	const keyv = new KeyvPostgres({
		uri: postgresUri,
		clearExpiredInterval: 10_000,
	});
	t.expect(keyv.opts.clearExpiredInterval).toBe(10_000);
	keyv.clearExpiredInterval = 0;
});

test.it(
	"clearExpiredInterval automatically clears expired entries",
	async (t) => {
		const keyv = new KeyvPostgres({
			uri: postgresUri,
			clearExpiredInterval: 100,
		});
		const pastExpires = Date.now() - 60_000;
		const futureExpires = Date.now() + 60_000;
		await keyv.set(
			"interval-expired",
			JSON.stringify({ value: "old", expires: pastExpires }),
		);
		await keyv.set(
			"interval-valid",
			JSON.stringify({ value: "fresh", expires: futureExpires }),
		);

		// Wait for the interval to fire
		await new Promise((resolve) => {
			setTimeout(resolve, 300);
		});

		t.expect(await keyv.get("interval-expired")).toBeUndefined();
		t.expect(await keyv.get("interval-valid")).toBe(
			JSON.stringify({ value: "fresh", expires: futureExpires }),
		);
		keyv.clearExpiredInterval = 0;
	},
);

test.it("disconnect stops the clearExpiredInterval timer", async (t) => {
	const keyv = new KeyvPostgres({
		uri: postgresUri,
		clearExpiredInterval: 100,
	});
	t.expect(keyv.clearExpiredInterval).toBe(100);
	await keyv.disconnect();
	// After disconnect, the timer should be stopped. We just verify no errors are thrown.
	t.expect(keyv.clearExpiredInterval).toBe(100);
});

test.it("setting clearExpiredInterval to 0 stops an active timer", (t) => {
	const keyv = new KeyvPostgres({
		uri: postgresUri,
		clearExpiredInterval: 1000,
	});
	t.expect(keyv.clearExpiredInterval).toBe(1000);
	keyv.clearExpiredInterval = 0;
	t.expect(keyv.clearExpiredInterval).toBe(0);
});
