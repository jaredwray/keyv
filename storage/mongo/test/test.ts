// biome-ignore-all lint/suspicious/noExplicitAny: test file
import keyvTestSuite, { keyvIteratorTests } from "@keyv/test-suite";
import Keyv from "keyv";
import type { KeyvMongoOptions } from "types";
import * as test from "vitest";
import KeyvMongo from "../src/index.js";

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
});

test.it(
	"Collection option merges into default options if URL is passed",
	(t) => {
		const store = new KeyvMongo(mongoURL, { collection: "foo" });
		t.expect(store.opts).toEqual({
			url: mongoURL,
			collection: "foo",
		});
	},
);

test.it("URI is passed it is correct", (t) => {
	const options_ = { uri: "mongodb://127.0.0.1:27017" };
	const store = new KeyvMongo(options_);
	t.expect(store.opts.uri).toEqual(options_.uri);
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
	const result = await store.get("key1");
	t.expect(result).toBe("keyv1");
});

test.it("Deletes value from GridFS", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
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
	const cleared = await store.clearExpired();
	t.expect(cleared).toBeTruthy();
});

test.it("Clears unused files from GridFS", async (t) => {
	const store = new KeyvMongo({ useGridFS: true, ...options });
	const cleared = await store.clearUnusedFor(5);
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
	await exceptIteratorDefaultNamespace({ ...options }, t);
});

test.it("iterator with namespace", async (t) => {
	await expectIteratorNamespace({ namespace: "key1", ...options }, t);
});

test.it("iterator with default namespace using GridFS", async (t) => {
	await exceptIteratorDefaultNamespace(
		{ namespace: "key1", useGridFS: true, ...options },
		t,
	);
});

test.it("iterator with namespace using GridFS", async (t) => {
	await expectIteratorNamespace(
		{ namespace: "key1", useGridFS: true, ...options },
		t,
	);
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

const expectIteratorNamespace = async (
	options_: KeyvMongoOptions,
	t: test.TaskContext & test.TestContext,
) => {
	const store = new KeyvMongo(options_);
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
};

const exceptIteratorDefaultNamespace = async (
	options_: KeyvMongoOptions,
	t: test.TaskContext & test.TestContext,
) => {
	const store = new KeyvMongo(options_);
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
};
