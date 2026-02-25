// biome-ignore-all lint/suspicious/noExplicitAny: test file
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

test.beforeEach(async () => {
	const keyv = new KeyvMongo({ ...options });
	await keyv.clear();
	// Also clear namespaced data from namespace tests
	const ns1 = new KeyvMongo({ ...options });
	ns1.namespace = "ns1";
	await ns1.clear();
	const ns2 = new KeyvMongo({ ...options });
	ns2.namespace = "ns2";
	await ns2.clear();
	// Clear GridFS data
	const gridfs = new KeyvMongo({ useGridFS: true, ...options });
	await gridfs.clear();
	for (const ns of ["ns1", "ns2", "key1", "namespace-a", "namespace-b"]) {
		const gridfsNs = new KeyvMongo({ useGridFS: true, ...options });
		gridfsNs.namespace = ns;
		await gridfsNs.clear();
	}
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
	const result = await store.set("key1", "keyv1", 0);
	const get = await store.get("key1");
	t.expect((result as any).filename).toBe("key1");
	t.expect(get).toBe("keyv1");
});

test.it("Gets value from GridFS", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	await store.set("key1", "keyv1");
	const result = await store.get("key1");
	t.expect(result).toBe("keyv1");
});

test.it("Deletes value from GridFS", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	await store.set("key1", "keyv1");
	const result = await store.delete("key1");
	t.expect(result).toBeTruthy();
});

test.it("Deletes non existent value from GridFS", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	const result = await store.delete("no-existent-value");
	t.expect(result).toBeFalsy();
});

test.it("Stores value with TTL in GridFS", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	const result = await store.set("key1", "keyv1", 0);
	t.expect((result as any).filename).toBe("key1");
});

test.it("Clears expired value from GridFS", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	await store.set("expired-key", "expired-value", 0);
	const cleared = await store.clearExpired();
	t.expect(cleared).toBeTruthy();
});

test.it("Clears unused files from GridFS", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	await store.set("unused-key", "unused-value");
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
	const result = await store.get("non-existent-file");
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
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1");
	await keyv.set("foo2", "bar2");
	t.expect(await keyv.deleteMany(["foo", "foo1", "foo2"])).toBeTruthy();
	t.expect(await keyv.get("foo")).toBeUndefined();
	t.expect(await keyv.get("foo1")).toBeUndefined();
	t.expect(await keyv.get("foo2")).toBeUndefined();
});

test.it(
	".deleteMany([keys]) with nonexistent gridfs keys resolves to false",
	async (t) => {
		const keyv = new KeyvMongo({ useGridFS: true, ...options });
		t.expect(await keyv.deleteMany(["foo", "foo1", "foo2"])).toBeFalsy();
	},
);

test.it(
	".getMany([keys]) using GridFS should return array values",
	async (t) => {
		const keyv = new KeyvMongo({ useGridFS: true, ...options });
		await keyv.clearUnusedFor(0);
		await keyv.set("foo", "bar");
		await keyv.set("foo1", "bar1");
		await keyv.set("foo2", "bar2");
		const values = await keyv.getMany<string>(["foo", "foo1", "foo2"]);
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
		await keyv.clearUnusedFor(0);
		await keyv.set("foo", "bar");
		await keyv.set("foo2", "bar2");
		const values = await keyv.getMany<string>(["foo", "foo1", "foo2"]);
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
		await keyv.clearUnusedFor(0);
		const values = await keyv.getMany<string>(["foo", "foo1", "foo2"]);
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
	await store.set("foo", "bar");
	await store.set("foo2", "bar2");
	const iterator = store.iterator();
	let entry = await iterator.next();
	// @ts-expect-error - test iterator
	t.expect(entry.value[0]).toBe("foo");
	// @ts-expect-error - test iterator
	t.expect(entry.value[1]).toBe("bar");
	entry = await iterator.next();
	// @ts-expect-error - test iterator
	t.expect(entry.value[0]).toBe("foo2");
	// @ts-expect-error - test iterator
	t.expect(entry.value[1]).toBe("bar2");
	entry = await iterator.next();
	t.expect(entry.value).toBeUndefined();
});

test.it("iterator with namespace", async (t) => {
	const store = new KeyvMongo({ namespace: "key1", ...options });
	await store.set("key1:foo", "bar");
	await store.set("key1:foo2", "bar2");
	const iterator = store.iterator("key1");
	let entry = await iterator.next();
	// @ts-expect-error - test iterator
	t.expect(entry.value[0]).toBe("key1:foo");
	// @ts-expect-error - test iterator
	t.expect(entry.value[1]).toBe("bar");
	entry = await iterator.next();
	// @ts-expect-error - test iterator
	t.expect(entry.value[0]).toBe("key1:foo2");
	// @ts-expect-error - test iterator
	t.expect(entry.value[1]).toBe("bar2");
	entry = await iterator.next();
	t.expect(entry.value).toBeUndefined();
});

test.it("iterator with default namespace using GridFS", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	await store.set("foo", "bar");
	await store.set("foo2", "bar2");
	const iterator = store.iterator();
	let entry = await iterator.next();
	// @ts-expect-error - test iterator
	t.expect(entry.value[0]).toBe("foo");
	// @ts-expect-error - test iterator
	t.expect(entry.value[1]).toBe("bar");
	entry = await iterator.next();
	// @ts-expect-error - test iterator
	t.expect(entry.value[0]).toBe("foo2");
	// @ts-expect-error - test iterator
	t.expect(entry.value[1]).toBe("bar2");
	entry = await iterator.next();
	t.expect(entry.value).toBeUndefined();
});

test.it("iterator with namespace using GridFS", async (t) => {
	const store = new KeyvMongo({
		namespace: "key1",
		useGridFS: true,
		...options,
	});
	await store.set("key1:foo", "bar");
	await store.set("key1:foo2", "bar2");
	const iterator = store.iterator("key1");
	let entry = await iterator.next();
	// @ts-expect-error - test iterator
	t.expect(entry.value[0]).toBe("key1:foo");
	// @ts-expect-error - test iterator
	t.expect(entry.value[1]).toBe("bar");
	entry = await iterator.next();
	// @ts-expect-error - test iterator
	t.expect(entry.value[0]).toBe("key1:foo2");
	// @ts-expect-error - test iterator
	t.expect(entry.value[1]).toBe("bar2");
	entry = await iterator.next();
	t.expect(entry.value).toBeUndefined();
});

test.it("Close connection successfully on GridFS", async (t) => {
	const keyv = new KeyvMongo({ useGridFS: true, ...options });
	t.expect(await keyv.get("foobar")).toBeUndefined();
	await keyv.disconnect();
	try {
		await keyv.get("foobar");
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	}
});

test.it("Close connection successfully", async (t) => {
	const keyv = new KeyvMongo({ namespace: "key1", ...options });
	t.expect(await keyv.get("foobar")).toBeUndefined();
	await keyv.disconnect();
	try {
		await keyv.get("foobar");
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	}
});

test.it("Close connection should fail", async (t) => {
	const keyv = new KeyvMongo({ namespace: "key1", ...options });
	try {
		await keyv.disconnect();
	} catch {
		t.expect(true).toBeTruthy();
	}
});

test.it("createKeyv with URI string returns a Keyv instance", async (t) => {
	const keyv = createKeyv(mongoURL);
	t.expect(keyv).toBeInstanceOf(Keyv);
	await keyv.set("createKeyv-test", "value");
	t.expect(await keyv.get("createKeyv-test")).toBe("value");
});

test.it("createKeyv with options object returns a Keyv instance", async (t) => {
	const keyv = createKeyv({ url: mongoURL, collection: "keyv", ...options });
	t.expect(keyv).toBeInstanceOf(Keyv);
	await keyv.set("createKeyv-opts-test", "value");
	t.expect(await keyv.get("createKeyv-opts-test")).toBe("value");
});

test.it("createKeyv with namespace option", async (t) => {
	const keyv = createKeyv({ namespace: "custom", url: mongoURL, ...options });
	t.expect(keyv.namespace).toBe("custom");
	await keyv.set("foo", "bar");
	t.expect(await keyv.get("foo")).toBe("bar");
	const store = keyv.store as KeyvMongo;
	const rawValue = await store.get("custom:foo");
	t.expect(rawValue).toBeDefined();
});

test.it("createKeyv with different namespaces do not conflict", async (t) => {
	const keyvA = createKeyv({
		namespace: "createKeyv-a",
		url: mongoURL,
		...options,
	});
	const keyvB = createKeyv({
		namespace: "createKeyv-b",
		url: mongoURL,
		...options,
	});

	await keyvA.set("shared-key", "valueA");
	await keyvB.set("shared-key", "valueB");

	t.expect(await keyvA.get("shared-key")).toBe("valueA");
	t.expect(await keyvB.get("shared-key")).toBe("valueB");

	// clear only affects its own namespace
	await keyvA.clear();
	t.expect(await keyvA.get("shared-key")).toBeUndefined();
	t.expect(await keyvB.get("shared-key")).toBe("valueB");
});

// Native namespace tests - Standard mode
test.it(
	"native namespace: same key in different namespaces stored independently",
	async (t) => {
		const mongo1 = new KeyvMongo({ ...options });
		mongo1.namespace = "ns1";
		const mongo2 = new KeyvMongo({ ...options });
		mongo2.namespace = "ns2";

		await mongo1.set("ns1:testkey", "value1");
		await mongo2.set("ns2:testkey", "value2");

		t.expect(await mongo1.get("ns1:testkey")).toBe("value1");
		t.expect(await mongo2.get("ns2:testkey")).toBe("value2");
	},
);

test.it(
	"native namespace: null namespace stores and retrieves correctly",
	async (t) => {
		const keyv = new KeyvMongo({ ...options });
		await keyv.set("testkey-no-ns", "testvalue");
		t.expect(await keyv.get("testkey-no-ns")).toBe("testvalue");
	},
);

test.it(
	"native namespace: clear only clears the specified namespace",
	async (t) => {
		const mongo1 = new KeyvMongo({ ...options });
		mongo1.namespace = "ns1";
		const mongo2 = new KeyvMongo({ ...options });
		mongo2.namespace = "ns2";

		await mongo1.set("ns1:key1", "value1");
		await mongo2.set("ns2:key1", "value2");

		await mongo1.clear();

		t.expect(await mongo1.get("ns1:key1")).toBeUndefined();
		t.expect(await mongo2.get("ns2:key1")).toBe("value2");
	},
);

test.it("native namespace: delete scoped to namespace", async (t) => {
	const mongo1 = new KeyvMongo({ ...options });
	mongo1.namespace = "ns1";
	const mongo2 = new KeyvMongo({ ...options });
	mongo2.namespace = "ns2";

	await mongo1.set("ns1:key1", "val1");
	await mongo2.set("ns2:key1", "val2");

	const deleted = await mongo1.delete("ns1:key1");
	t.expect(deleted).toBe(true);
	t.expect(await mongo1.get("ns1:key1")).toBeUndefined();
	t.expect(await mongo2.get("ns2:key1")).toBe("val2");
});

test.it("native namespace: deleteMany scoped to namespace", async (t) => {
	const mongo1 = new KeyvMongo({ ...options });
	mongo1.namespace = "ns1";
	const mongo2 = new KeyvMongo({ ...options });
	mongo2.namespace = "ns2";

	await mongo1.set("ns1:key1", "val1");
	await mongo2.set("ns2:key1", "val2");

	const deleted = await mongo1.deleteMany(["ns1:key1"]);
	t.expect(deleted).toBe(true);
	t.expect(await mongo1.get("ns1:key1")).toBeUndefined();
	t.expect(await mongo2.get("ns2:key1")).toBe("val2");
});

test.it("native namespace: has scoped to namespace", async (t) => {
	const mongo1 = new KeyvMongo({ ...options });
	mongo1.namespace = "ns1";
	const mongo2 = new KeyvMongo({ ...options });
	mongo2.namespace = "ns2";

	await mongo1.set("ns1:key1", "val1");

	t.expect(await mongo1.has("ns1:key1")).toBe(true);
	t.expect(await mongo2.has("ns2:key1")).toBe(false);
});

test.it(
	"native namespace: iterator only returns keys from correct namespace",
	async (t) => {
		const mongo1 = new KeyvMongo({ ...options });
		mongo1.namespace = "ns1";
		const mongo2 = new KeyvMongo({ ...options });
		mongo2.namespace = "ns2";

		await mongo1.set("ns1:key1", "val1");
		await mongo1.set("ns1:key2", "val2");
		await mongo2.set("ns2:key3", "val3");

		const keys: string[] = [];
		for await (const [key] of mongo1.iterator("ns1")) {
			keys.push(key);
		}

		t.expect(keys.length).toBe(2);
		t.expect(keys).toContain("ns1:key1");
		t.expect(keys).toContain("ns1:key2");
	},
);

test.it(
	"native namespace: two Keyv instances with different namespaces do not conflict",
	async (t) => {
		const mongoA = new KeyvMongo({ ...options });
		const mongoB = new KeyvMongo({ ...options });
		const keyvA = new Keyv({ store: mongoA, namespace: "namespace-a" });
		const keyvB = new Keyv({ store: mongoB, namespace: "namespace-b" });

		t.expect(await keyvA.set("mykey", "valueA")).toBe(true);
		t.expect(await keyvA.get("mykey")).toBe("valueA");
		t.expect(await keyvB.set("mykey", "valueB")).toBe(true);
		t.expect(await keyvB.get("mykey")).toBe("valueB");
		// Ensure they didn't overwrite each other
		t.expect(await keyvA.get("mykey")).toBe("valueA");
	},
);

test.it("native namespace: getMany scoped to namespace", async (t) => {
	const mongo1 = new KeyvMongo({ ...options });
	mongo1.namespace = "ns1";
	const mongo2 = new KeyvMongo({ ...options });
	mongo2.namespace = "ns2";

	await mongo1.set("ns1:key1", "val1");
	await mongo2.set("ns2:key1", "val2");

	const results = await mongo1.getMany(["ns1:key1"]);
	t.expect(results).toEqual(["val1"]);

	const results2 = await mongo1.getMany(["ns2:key1"]);
	t.expect(results2).toEqual([undefined]);
});

// Native namespace tests - GridFS mode
test.it(
	"native namespace GridFS: same key in different namespaces stored independently",
	async (t) => {
		const mongo1 = new KeyvMongo({ useGridFS: true, ...options });
		mongo1.namespace = "ns1";
		const mongo2 = new KeyvMongo({ useGridFS: true, ...options });
		mongo2.namespace = "ns2";

		await mongo1.set("ns1:testkey", "value1");
		await mongo2.set("ns2:testkey", "value2");

		t.expect(await mongo1.get("ns1:testkey")).toBe("value1");
		t.expect(await mongo2.get("ns2:testkey")).toBe("value2");
	},
);

test.it(
	"native namespace GridFS: clear only clears the specified namespace",
	async (t) => {
		const mongo1 = new KeyvMongo({ useGridFS: true, ...options });
		mongo1.namespace = "ns1";
		const mongo2 = new KeyvMongo({ useGridFS: true, ...options });
		mongo2.namespace = "ns2";

		await mongo1.set("ns1:key1", "value1");
		await mongo2.set("ns2:key1", "value2");

		await mongo1.clear();

		t.expect(await mongo1.get("ns1:key1")).toBeUndefined();
		t.expect(await mongo2.get("ns2:key1")).toBe("value2");
	},
);

test.it("native namespace GridFS: delete scoped to namespace", async (t) => {
	const mongo1 = new KeyvMongo({ useGridFS: true, ...options });
	mongo1.namespace = "ns1";
	const mongo2 = new KeyvMongo({ useGridFS: true, ...options });
	mongo2.namespace = "ns2";

	await mongo1.set("ns1:key1", "val1");
	await mongo2.set("ns2:key1", "val2");

	const deleted = await mongo1.delete("ns1:key1");
	t.expect(deleted).toBe(true);
	t.expect(await mongo1.get("ns1:key1")).toBeUndefined();
	t.expect(await mongo2.get("ns2:key1")).toBe("val2");
});

test.it("native namespace GridFS: has scoped to namespace", async (t) => {
	const mongo1 = new KeyvMongo({ useGridFS: true, ...options });
	mongo1.namespace = "ns1";
	const mongo2 = new KeyvMongo({ useGridFS: true, ...options });
	mongo2.namespace = "ns2";

	await mongo1.set("ns1:key1", "val1");

	t.expect(await mongo1.has("ns1:key1")).toBe(true);
	t.expect(await mongo2.has("ns2:key1")).toBe(false);
});

test.it(
	"native namespace GridFS: two Keyv instances with different namespaces do not conflict",
	async (t) => {
		const mongoA = new KeyvMongo({ useGridFS: true, ...options });
		const mongoB = new KeyvMongo({ useGridFS: true, ...options });
		const keyvA = new Keyv({ store: mongoA, namespace: "namespace-a" });
		const keyvB = new Keyv({ store: mongoB, namespace: "namespace-b" });

		t.expect(await keyvA.set("mykey", "valueA")).toBe(true);
		t.expect(await keyvA.get("mykey")).toBe("valueA");
		t.expect(await keyvB.set("mykey", "valueB")).toBe(true);
		t.expect(await keyvB.get("mykey")).toBe("valueB");
		// Ensure they didn't overwrite each other
		t.expect(await keyvA.get("mykey")).toBe("valueA");
	},
);

test.it("GridFS delete returns false when bucket.delete throws", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	await store.set("delete-error-file", "some-data");
	const client = await store.connect;
	// Close the connection to make bucket.delete throw
	await client.mongoClient.close();
	const result = await store.delete("delete-error-file");
	t.expect(result).toBe(false);
});
