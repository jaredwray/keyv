// biome-ignore-all lint/suspicious/noExplicitAny: test file
import { faker } from "@faker-js/faker";
import keyvTestSuite, { keyvIteratorTests } from "@keyv/test-suite";
import Keyv from "keyv";
import * as test from "vitest";
import KeyvMongo, { createKeyv } from "../src/index.js";

const options = { serverSelectionTimeoutMS: 5000, db: "keyvdb" };
const mongoURL = "mongodb://127.0.0.1:27017";
const store = () => new KeyvMongo(mongoURL, options);

// @ts-expect-error
keyvTestSuite(test, Keyv, store);
// @ts-expect-error
keyvIteratorTests(test, Keyv, store);

test.afterAll(async () => {
	let keyv = new KeyvMongo({ ...options });
	await keyv.clear();
	keyv = new KeyvMongo({ collection: "foo", useGridFS: true, ...options });
	await keyv.clear();
	await keyv.disconnect();
});

test.it(
	"Collection option merges into default options if URL is passed",
	(t) => {
		const store = new KeyvMongo(mongoURL, { collection: "foo" });
		t.expect(store.url).toBe(mongoURL);
		t.expect(store.collection).toBe("foo");
		// Backward compatibility
		t.expect(store.opts.url).toBe(mongoURL);
		t.expect(store.opts.collection).toBe("foo");
	},
);

test.it("URI is passed it is correct", (t) => {
	const options_ = { uri: "mongodb://127.0.0.1:27017" };
	const store = new KeyvMongo(options_);
	t.expect(store.url).toBe(options_.uri);
	// Backward compatibility
	t.expect(store.opts.uri).toBe(options_.uri);
});

test.it("default properties are set correctly", (t) => {
	const store = new KeyvMongo();
	t.expect(store.url).toBe("mongodb://127.0.0.1:27017");
	t.expect(store.collection).toBe("keyv");
	t.expect(store.useGridFS).toBe(false);
	t.expect(store.db).toBeUndefined();
	t.expect(store.namespace).toBeUndefined();
	t.expect(store.readPreference).toBeUndefined();
});

test.it("properties can be set via constructor options", (t) => {
	const store = new KeyvMongo({
		url: mongoURL,
		collection: "custom",
		useGridFS: true,
		db: "testdb",
	});
	t.expect(store.url).toBe(mongoURL);
	t.expect(store.collection).toBe("custom");
	t.expect(store.useGridFS).toBe(true);
	t.expect(store.db).toBe("testdb");
});

test.it("properties can be modified via setters", (t) => {
	const store = new KeyvMongo();
	store.url = "mongodb://localhost:27018";
	t.expect(store.url).toBe("mongodb://localhost:27018");
	store.namespace = "test-ns";
	t.expect(store.namespace).toBe("test-ns");
	store.collection = "custom-collection";
	t.expect(store.collection).toBe("custom-collection");
	store.db = "mydb";
	t.expect(store.db).toBe("mydb");
	store.readPreference = undefined;
	t.expect(store.readPreference).toBeUndefined();
});

test.it("constructor with undefined url and options sets properties", (t) => {
	const store = new KeyvMongo(undefined, {
		collection: "from-options",
		db: "optionsdb",
		readPreference: "primary" as any,
	});
	t.expect(store.collection).toBe("from-options");
	t.expect(store.db).toBe("optionsdb");
	t.expect(store.readPreference).toBe("primary");
});

test.it("opts getter returns backward-compatible object", (t) => {
	const store = new KeyvMongo(mongoURL, { collection: "cache", ...options });
	const opts = store.opts;
	t.expect(opts.url).toBe(mongoURL);
	t.expect(opts.uri).toBe(mongoURL);
	t.expect(opts.collection).toBe("cache");
	t.expect(opts.dialect).toBe("mongo");
});

test.it("Stores value in GridFS", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	const key = faker.string.alphanumeric(10);
	const result = await store.set(key, "keyv1", 0);
	const get = await store.get(key);
	t.expect((result as any).filename).toBe(key);
	t.expect(get).toBe("keyv1");
});

test.it("Gets value from GridFS", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	const key = faker.string.alphanumeric(10);
	await store.set(key, "keyv1");
	const result = await store.get(key);
	t.expect(result).toBe("keyv1");
});

test.it("Deletes value from GridFS", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	const key = faker.string.alphanumeric(10);
	await store.set(key, "keyv1");
	const result = await store.delete(key);
	t.expect(result).toBeTruthy();
});

test.it("Deletes non existent value from GridFS", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	const result = await store.delete(faker.string.alphanumeric(10));
	t.expect(result).toBeFalsy();
});

test.it("Stores value with TTL in GridFS", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	const key = faker.string.alphanumeric(10);
	const result = await store.set(key, "keyv1", 0);
	t.expect((result as any).filename).toBe(key);
});

test.it("Clears expired value from GridFS", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	const key = faker.string.alphanumeric(10);
	await store.set(key, "expired-value", 0);
	const cleared = await store.clearExpired();
	t.expect(cleared).toBeTruthy();
});

test.it("Clears unused files from GridFS", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	const key = faker.string.alphanumeric(10);
	await store.set(key, "unused-value");
	const cleared = await store.clearUnusedFor(0);
	t.expect(cleared).toBeTruthy();
});

test.it("Clears expired value only when GridFS options is true", async (t) => {
	const store = new KeyvMongo(Object.assign(options));
	const cleared = await store.clearExpired();
	t.expect(cleared).toBeFalsy();
});

test.it("Clears unused files only when GridFS options is true", async (t) => {
	const store = new KeyvMongo(Object.assign(options));
	const cleared = await store.clearUnusedFor(5);
	t.expect(cleared).toBeFalsy();
});

test.it("Gets non-existent file and return should be undefined", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	const result = await store.get(faker.string.alphanumeric(10));
	t.expect(typeof result).toBe("undefined");
});

test.it("Non-string keys are not permitted in delete", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	// @ts-expect-error - test invalid input
	const result = await store.delete({
		ok: true,
	});
	t.expect(result).toBeFalsy();
});

test.it(".deleteMany([keys]) should delete multiple gridfs key", async (t) => {
	const keyv = new KeyvMongo({ useGridFS: true, ...options });
	const keys = [
		faker.string.alphanumeric(10),
		faker.string.alphanumeric(10),
		faker.string.alphanumeric(10),
	];
	await keyv.set(keys[0], "bar");
	await keyv.set(keys[1], "bar1");
	await keyv.set(keys[2], "bar2");
	t.expect(await keyv.deleteMany(keys)).toBeTruthy();
	t.expect(await keyv.get(keys[0])).toBeUndefined();
	t.expect(await keyv.get(keys[1])).toBeUndefined();
	t.expect(await keyv.get(keys[2])).toBeUndefined();
});

test.it(
	".deleteMany([keys]) with nonexistent gridfs keys resolves to false",
	async (t) => {
		const keyv = new KeyvMongo({ useGridFS: true, ...options });
		t.expect(
			await keyv.deleteMany([
				faker.string.alphanumeric(10),
				faker.string.alphanumeric(10),
			]),
		).toBeFalsy();
	},
);

test.it(
	".getMany([keys]) using GridFS should return array values",
	async (t) => {
		const keyv = new KeyvMongo({ useGridFS: true, ...options });
		const keys = [
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
		];
		await keyv.set(keys[0], "bar");
		await keyv.set(keys[1], "bar1");
		await keyv.set(keys[2], "bar2");
		const values = await keyv.getMany<string>(keys);
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values[0]).toBe("bar");
		t.expect(values[1]).toBe("bar1");
		t.expect(values[2]).toBe("bar2");
	},
);

test.it(
	".getMany([keys]) using GridFS should return array values with undefined",
	async (t) => {
		const keyv = new KeyvMongo({ useGridFS: true, ...options });
		const keys = [
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
		];
		await keyv.set(keys[0], "bar");
		await keyv.set(keys[2], "bar2");
		const values = await keyv.getMany<string>(keys);
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values[0]).toBe("bar");
		t.expect(values[1]).toBeUndefined();
		t.expect(values[2]).toBe("bar2");
	},
);

test.it(
	".getMany([keys]) using GridFS should return empty array for all no existent keys",
	async (t) => {
		const keyv = new KeyvMongo({ useGridFS: true, ...options });
		const values = await keyv.getMany<string>([
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
		]);
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values).toStrictEqual([undefined, undefined, undefined]);
	},
);

test.it("Clears entire cache store", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	const result = await store.clear();
	t.expect(typeof result).toBe("undefined");
});

test.it("Clears entire cache store with default namespace", async (t) => {
	const store = new KeyvMongo({ ...options });
	const result = await store.clear();
	t.expect(typeof result).toBe("undefined");
});

test.it("Clears an empty store should not fail", async (_t) => {
	const store = new KeyvMongo({ ...options });
	await store.clear();
	await store.clear();
});

test.it("Clears an empty store GridFS should not fail", async (_t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	await store.clear();
	await store.clear();
});

test.it("iterator with default namespace", async (t) => {
	const store = new KeyvMongo({ ...options });
	await store.clear();
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	await store.set(key1, "bar");
	await store.set(key2, "bar2");
	const results: Array<[string, string]> = [];
	for await (const entry of store.iterator()) {
		results.push(entry as [string, string]);
	}

	t.expect(results.length).toBeGreaterThanOrEqual(2);
	const keys = results.map(([k]) => k);
	t.expect(keys).toContain(key1);
	t.expect(keys).toContain(key2);
});

test.it("iterator with namespace", async (t) => {
	const ns = faker.string.alphanumeric(8);
	const store = new KeyvMongo({ namespace: ns, ...options });
	await store.clear();
	const key1 = `${ns}:${faker.string.alphanumeric(10)}`;
	const key2 = `${ns}:${faker.string.alphanumeric(10)}`;
	await store.set(key1, "bar");
	await store.set(key2, "bar2");
	const results: Array<[string, string]> = [];
	for await (const entry of store.iterator(ns)) {
		results.push(entry as [string, string]);
	}

	t.expect(results.length).toBe(2);
	const keys = results.map(([k]) => k);
	t.expect(keys).toContain(key1);
	t.expect(keys).toContain(key2);
});

test.it("iterator with default namespace using GridFS", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	await store.clear();
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	await store.set(key1, "bar");
	await store.set(key2, "bar2");
	const results: Array<[string, string]> = [];
	for await (const entry of store.iterator()) {
		results.push(entry as [string, string]);
	}

	t.expect(results.length).toBeGreaterThanOrEqual(2);
	const keys = results.map(([k]) => k);
	t.expect(keys).toContain(key1);
	t.expect(keys).toContain(key2);
});

test.it("iterator with namespace using GridFS", async (t) => {
	const ns = faker.string.alphanumeric(8);
	const store = new KeyvMongo({
		namespace: ns,
		useGridFS: true,
		...options,
	});
	await store.clear();
	const key1 = `${ns}:${faker.string.alphanumeric(10)}`;
	const key2 = `${ns}:${faker.string.alphanumeric(10)}`;
	await store.set(key1, "bar");
	await store.set(key2, "bar2");
	const results: Array<[string, string]> = [];
	for await (const entry of store.iterator(ns)) {
		results.push(entry as [string, string]);
	}

	t.expect(results.length).toBe(2);
	const keys = results.map(([k]) => k);
	t.expect(keys).toContain(key1);
	t.expect(keys).toContain(key2);
});

test.it("Close connection successfully on GridFS", async (t) => {
	const keyv = new KeyvMongo({ useGridFS: true, ...options });
	t.expect(await keyv.get(faker.string.alphanumeric(10))).toBeUndefined();
	await keyv.disconnect();
	try {
		await keyv.get(faker.string.alphanumeric(10));
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	}
});

test.it("Close connection successfully", async (t) => {
	const ns = faker.string.alphanumeric(8);
	const keyv = new KeyvMongo({ namespace: ns, ...options });
	t.expect(await keyv.get(faker.string.alphanumeric(10))).toBeUndefined();
	await keyv.disconnect();
	try {
		await keyv.get(faker.string.alphanumeric(10));
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	}
});

test.it("Close connection should fail", async (t) => {
	const ns = faker.string.alphanumeric(8);
	const keyv = new KeyvMongo({ namespace: ns, ...options });
	try {
		await keyv.disconnect();
	} catch {
		t.expect(true).toBeTruthy();
	}
});

test.it("createKeyv with URI string returns a Keyv instance", async (t) => {
	const keyv = createKeyv(mongoURL);
	t.expect(keyv).toBeInstanceOf(Keyv);
	const key = faker.string.alphanumeric(10);
	await keyv.set(key, "value");
	t.expect(await keyv.get(key)).toBe("value");
});

test.it("createKeyv with options object returns a Keyv instance", async (t) => {
	const keyv = createKeyv({ url: mongoURL, collection: "keyv", ...options });
	t.expect(keyv).toBeInstanceOf(Keyv);
	const key = faker.string.alphanumeric(10);
	await keyv.set(key, "value");
	t.expect(await keyv.get(key)).toBe("value");
});

test.it("createKeyv with namespace option", async (t) => {
	const ns = faker.string.alphanumeric(8);
	const keyv = createKeyv({ namespace: ns, url: mongoURL, ...options });
	t.expect(keyv.namespace).toBe(ns);
	const key = faker.string.alphanumeric(10);
	await keyv.set(key, "bar");
	t.expect(await keyv.get(key)).toBe("bar");
	const storeInstance = keyv.store as KeyvMongo;
	const rawValue = await storeInstance.get(`${ns}:${key}`);
	t.expect(rawValue).toBeDefined();
});

test.it("createKeyv with different namespaces do not conflict", async (t) => {
	const nsA = faker.string.alphanumeric(8);
	const nsB = faker.string.alphanumeric(8);
	const keyvA = createKeyv({ namespace: nsA, url: mongoURL, ...options });
	const keyvB = createKeyv({ namespace: nsB, url: mongoURL, ...options });

	const key = faker.string.alphanumeric(10);
	await keyvA.set(key, "valueA");
	await keyvB.set(key, "valueB");

	t.expect(await keyvA.get(key)).toBe("valueA");
	t.expect(await keyvB.get(key)).toBe("valueB");

	// clear only affects its own namespace
	await keyvA.clear();
	t.expect(await keyvA.get(key)).toBeUndefined();
	t.expect(await keyvB.get(key)).toBe("valueB");
});

// Native namespace tests - Standard mode
test.it(
	"native namespace: same key in different namespaces stored independently",
	async (t) => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const mongo1 = new KeyvMongo({ ...options });
		mongo1.namespace = ns1;
		const mongo2 = new KeyvMongo({ ...options });
		mongo2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		await mongo1.set(`${ns1}:${key}`, "value1");
		await mongo2.set(`${ns2}:${key}`, "value2");

		t.expect(await mongo1.get(`${ns1}:${key}`)).toBe("value1");
		t.expect(await mongo2.get(`${ns2}:${key}`)).toBe("value2");
	},
);

test.it(
	"native namespace: null namespace stores and retrieves correctly",
	async (t) => {
		const keyv = new KeyvMongo({ ...options });
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, "testvalue");
		t.expect(await keyv.get(key)).toBe("testvalue");
	},
);

test.it(
	"native namespace: clear only clears the specified namespace",
	async (t) => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const mongo1 = new KeyvMongo({ ...options });
		mongo1.namespace = ns1;
		const mongo2 = new KeyvMongo({ ...options });
		mongo2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		await mongo1.set(`${ns1}:${key}`, "value1");
		await mongo2.set(`${ns2}:${key}`, "value2");

		await mongo1.clear();

		t.expect(await mongo1.get(`${ns1}:${key}`)).toBeUndefined();
		t.expect(await mongo2.get(`${ns2}:${key}`)).toBe("value2");
	},
);

test.it("native namespace: delete scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mongo1 = new KeyvMongo({ ...options });
	mongo1.namespace = ns1;
	const mongo2 = new KeyvMongo({ ...options });
	mongo2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await mongo1.set(`${ns1}:${key}`, "val1");
	await mongo2.set(`${ns2}:${key}`, "val2");

	const deleted = await mongo1.delete(`${ns1}:${key}`);
	t.expect(deleted).toBe(true);
	t.expect(await mongo1.get(`${ns1}:${key}`)).toBeUndefined();
	t.expect(await mongo2.get(`${ns2}:${key}`)).toBe("val2");
});

test.it("native namespace: deleteMany scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mongo1 = new KeyvMongo({ ...options });
	mongo1.namespace = ns1;
	const mongo2 = new KeyvMongo({ ...options });
	mongo2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await mongo1.set(`${ns1}:${key}`, "val1");
	await mongo2.set(`${ns2}:${key}`, "val2");

	const deleted = await mongo1.deleteMany([`${ns1}:${key}`]);
	t.expect(deleted).toBe(true);
	t.expect(await mongo1.get(`${ns1}:${key}`)).toBeUndefined();
	t.expect(await mongo2.get(`${ns2}:${key}`)).toBe("val2");
});

test.it("native namespace: has scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mongo1 = new KeyvMongo({ ...options });
	mongo1.namespace = ns1;
	const mongo2 = new KeyvMongo({ ...options });
	mongo2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await mongo1.set(`${ns1}:${key}`, "val1");

	t.expect(await mongo1.has(`${ns1}:${key}`)).toBe(true);
	t.expect(await mongo2.has(`${ns2}:${key}`)).toBe(false);
});

test.it(
	"native namespace: iterator only returns keys from correct namespace",
	async (t) => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const mongo1 = new KeyvMongo({ ...options });
		mongo1.namespace = ns1;
		const mongo2 = new KeyvMongo({ ...options });
		mongo2.namespace = ns2;

		const key1 = `${ns1}:${faker.string.alphanumeric(10)}`;
		const key2 = `${ns1}:${faker.string.alphanumeric(10)}`;
		await mongo1.set(key1, "val1");
		await mongo1.set(key2, "val2");
		await mongo2.set(`${ns2}:${faker.string.alphanumeric(10)}`, "val3");

		const keys: string[] = [];
		for await (const [key] of mongo1.iterator(ns1)) {
			keys.push(key);
		}

		t.expect(keys.length).toBe(2);
		t.expect(keys).toContain(key1);
		t.expect(keys).toContain(key2);
	},
);

test.it(
	"native namespace: two Keyv instances with different namespaces do not conflict",
	async (t) => {
		const nsA = faker.string.alphanumeric(8);
		const nsB = faker.string.alphanumeric(8);
		const mongoA = new KeyvMongo({ ...options });
		const mongoB = new KeyvMongo({ ...options });
		const keyvA = new Keyv({ store: mongoA, namespace: nsA });
		const keyvB = new Keyv({ store: mongoB, namespace: nsB });

		const key = faker.string.alphanumeric(10);
		t.expect(await keyvA.set(key, "valueA")).toBe(true);
		t.expect(await keyvA.get(key)).toBe("valueA");
		t.expect(await keyvB.set(key, "valueB")).toBe(true);
		t.expect(await keyvB.get(key)).toBe("valueB");
		// Ensure they didn't overwrite each other
		t.expect(await keyvA.get(key)).toBe("valueA");
	},
);

test.it("native namespace: getMany scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mongo1 = new KeyvMongo({ ...options });
	mongo1.namespace = ns1;
	const mongo2 = new KeyvMongo({ ...options });
	mongo2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await mongo1.set(`${ns1}:${key}`, "val1");
	await mongo2.set(`${ns2}:${key}`, "val2");

	const results = await mongo1.getMany([`${ns1}:${key}`]);
	t.expect(results).toEqual(["val1"]);

	const results2 = await mongo1.getMany([`${ns2}:${key}`]);
	t.expect(results2).toEqual([undefined]);
});

// Native namespace tests - GridFS mode
test.it(
	"native namespace GridFS: same key in different namespaces stored independently",
	async (t) => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const mongo1 = new KeyvMongo({ useGridFS: true, ...options });
		mongo1.namespace = ns1;
		const mongo2 = new KeyvMongo({ useGridFS: true, ...options });
		mongo2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		await mongo1.set(`${ns1}:${key}`, "value1");
		await mongo2.set(`${ns2}:${key}`, "value2");

		t.expect(await mongo1.get(`${ns1}:${key}`)).toBe("value1");
		t.expect(await mongo2.get(`${ns2}:${key}`)).toBe("value2");
	},
);

test.it(
	"native namespace GridFS: clear only clears the specified namespace",
	async (t) => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const mongo1 = new KeyvMongo({ useGridFS: true, ...options });
		mongo1.namespace = ns1;
		const mongo2 = new KeyvMongo({ useGridFS: true, ...options });
		mongo2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		await mongo1.set(`${ns1}:${key}`, "value1");
		await mongo2.set(`${ns2}:${key}`, "value2");

		await mongo1.clear();

		t.expect(await mongo1.get(`${ns1}:${key}`)).toBeUndefined();
		t.expect(await mongo2.get(`${ns2}:${key}`)).toBe("value2");
	},
);

test.it("native namespace GridFS: delete scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mongo1 = new KeyvMongo({ useGridFS: true, ...options });
	mongo1.namespace = ns1;
	const mongo2 = new KeyvMongo({ useGridFS: true, ...options });
	mongo2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await mongo1.set(`${ns1}:${key}`, "val1");
	await mongo2.set(`${ns2}:${key}`, "val2");

	const deleted = await mongo1.delete(`${ns1}:${key}`);
	t.expect(deleted).toBe(true);
	t.expect(await mongo1.get(`${ns1}:${key}`)).toBeUndefined();
	t.expect(await mongo2.get(`${ns2}:${key}`)).toBe("val2");
});

test.it("native namespace GridFS: has scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mongo1 = new KeyvMongo({ useGridFS: true, ...options });
	mongo1.namespace = ns1;
	const mongo2 = new KeyvMongo({ useGridFS: true, ...options });
	mongo2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await mongo1.set(`${ns1}:${key}`, "val1");

	t.expect(await mongo1.has(`${ns1}:${key}`)).toBe(true);
	t.expect(await mongo2.has(`${ns2}:${key}`)).toBe(false);
});

test.it(
	"native namespace GridFS: two Keyv instances with different namespaces do not conflict",
	async (t) => {
		const nsA = faker.string.alphanumeric(8);
		const nsB = faker.string.alphanumeric(8);
		const mongoA = new KeyvMongo({ useGridFS: true, ...options });
		const mongoB = new KeyvMongo({ useGridFS: true, ...options });
		const keyvA = new Keyv({ store: mongoA, namespace: nsA });
		const keyvB = new Keyv({ store: mongoB, namespace: nsB });

		const key = faker.string.alphanumeric(10);
		t.expect(await keyvA.set(key, "valueA")).toBe(true);
		t.expect(await keyvA.get(key)).toBe("valueA");
		t.expect(await keyvB.set(key, "valueB")).toBe(true);
		t.expect(await keyvB.get(key)).toBe("valueB");
		// Ensure they didn't overwrite each other
		t.expect(await keyvA.get(key)).toBe("valueA");
	},
);

// setMany tests - Standard mode
test.it("setMany sets multiple keys in standard mode", async (t) => {
	const store = new KeyvMongo({ ...options });
	const keys = [
		faker.string.alphanumeric(10),
		faker.string.alphanumeric(10),
		faker.string.alphanumeric(10),
	];
	await store.setMany([
		{ key: keys[0], value: "val1" },
		{ key: keys[1], value: "val2" },
		{ key: keys[2], value: "val3" },
	]);
	t.expect(await store.get(keys[0])).toBe("val1");
	t.expect(await store.get(keys[1])).toBe("val2");
	t.expect(await store.get(keys[2])).toBe("val3");
});

test.it("setMany with TTL in standard mode", async (t) => {
	const store = new KeyvMongo({ ...options });
	const keys = [faker.string.alphanumeric(10), faker.string.alphanumeric(10)];
	await store.setMany([
		{ key: keys[0], value: "val1", ttl: 60000 },
		{ key: keys[1], value: "val2" },
	]);
	t.expect(await store.get(keys[0])).toBe("val1");
	t.expect(await store.get(keys[1])).toBe("val2");
});

test.it("setMany upserts existing keys in standard mode", async (t) => {
	const store = new KeyvMongo({ ...options });
	const key = faker.string.alphanumeric(10);
	await store.set(key, "original");
	await store.setMany([{ key, value: "updated" }]);
	t.expect(await store.get(key)).toBe("updated");
});

test.it("setMany with namespace in standard mode", async (t) => {
	const ns = faker.string.alphanumeric(8);
	const store = new KeyvMongo({ ...options });
	store.namespace = ns;
	const keys = [
		`${ns}:${faker.string.alphanumeric(10)}`,
		`${ns}:${faker.string.alphanumeric(10)}`,
	];
	await store.setMany([
		{ key: keys[0], value: "val1" },
		{ key: keys[1], value: "val2" },
	]);
	t.expect(await store.get(keys[0])).toBe("val1");
	t.expect(await store.get(keys[1])).toBe("val2");
});

// setMany tests - GridFS mode
test.it("setMany sets multiple keys in GridFS mode", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	const keys = [faker.string.alphanumeric(10), faker.string.alphanumeric(10)];
	await store.setMany([
		{ key: keys[0], value: "val1" },
		{ key: keys[1], value: "val2" },
	]);
	t.expect(await store.get(keys[0])).toBe("val1");
	t.expect(await store.get(keys[1])).toBe("val2");
});

// hasMany tests - Standard mode
test.it("hasMany checks multiple keys in standard mode", async (t) => {
	const store = new KeyvMongo({ ...options });
	const keys = [
		faker.string.alphanumeric(10),
		faker.string.alphanumeric(10),
		faker.string.alphanumeric(10),
	];
	await store.set(keys[0], "val1");
	await store.set(keys[1], "val2");
	const results = await store.hasMany(keys);
	t.expect(results).toEqual([true, true, false]);
});

test.it("hasMany with namespace in standard mode", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const store1 = new KeyvMongo({ ...options });
	store1.namespace = ns1;
	const store2 = new KeyvMongo({ ...options });
	store2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await store1.set(`${ns1}:${key}`, "val1");
	await store2.set(`${ns2}:${key}`, "val2");

	const results = await store1.hasMany([
		`${ns1}:${key}`,
		`${ns1}:${faker.string.alphanumeric(10)}`,
	]);
	t.expect(results).toEqual([true, false]);
});

// hasMany tests - GridFS mode
test.it("hasMany checks multiple keys in GridFS mode", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	const keys = [
		faker.string.alphanumeric(10),
		faker.string.alphanumeric(10),
		faker.string.alphanumeric(10),
	];
	await store.set(keys[0], "val1");
	await store.set(keys[1], "val2");
	const results = await store.hasMany(keys);
	t.expect(results).toEqual([true, true, false]);
});

test.it("hasMany with namespace in GridFS mode", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const store1 = new KeyvMongo({ useGridFS: true, ...options });
	store1.namespace = ns1;
	const store2 = new KeyvMongo({ useGridFS: true, ...options });
	store2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	await store1.set(`${ns1}:${key}`, "val1");
	await store2.set(`${ns2}:${key}`, "val2");

	const results = await store1.hasMany([
		`${ns1}:${key}`,
		`${ns1}:${faker.string.alphanumeric(10)}`,
	]);
	t.expect(results).toEqual([true, false]);
});

test.it("GridFS delete returns false when bucket.delete throws", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	const key = faker.string.alphanumeric(10);
	await store.set(key, "some-data");
	const client = await store.connect;
	// Close the connection to make bucket.delete throw
	await client.mongoClient.close();
	const result = await store.delete(key);
	t.expect(result).toBe(false);
});
