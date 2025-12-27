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
	await keyv.set("foo", "bar");
	t.expect(await keyv.get("foo")).toBe("bar");
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
	await keyv1.set("footest11", "bar1");
	await keyv2.set("footest22", "bar2");
	t.expect(await keyv1.get("footest11")).toBe("bar1");
	t.expect(await keyv2.get("footest22")).toBe("bar2");
});

test.it("iterator with default namespace", async (t) => {
	const keyv = new KeyvPostgres({ uri: postgresUri });
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1");
	await keyv.set("foo2", "bar2");
	const iterator = keyv.iterator();
	let entry = await iterator.next();
	t.expect(entry.value[0]).toBe("foo");
	t.expect(entry.value[1]).toBe("bar");
	entry = await iterator.next();
	t.expect(entry.value[0]).toBe("foo1");
	t.expect(entry.value[1]).toBe("bar1");
	entry = await iterator.next();
	t.expect(entry.value[0]).toBe("foo2");
	t.expect(entry.value[1]).toBe("bar2");
	entry = await iterator.next();
	t.expect(entry.value).toBeUndefined();
});

test.it(".clear() with undefined namespace", async (t) => {
	const keyv = store();
	t.expect(await keyv.clear()).toBeUndefined();
});

test.it("close connection successfully", async (t) => {
	const keyv = store();
	t.expect(await keyv.get("foo")).toBeUndefined();
	await keyv.disconnect();
	try {
		await keyv.get("foo");
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

		t.expect(await keyvA.set("foo", "bar")).toBe(true);
		t.expect(await keyvA.get("foo")).toBe("bar");
		t.expect(await keyvB.set("foo", "baz")).toBe(true);
		t.expect(await keyvB.get("foo")).toBe("baz");
	},
);

test.it("helper to create Keyv instance with postgres", async (t) => {
	const keyv = createKeyv({ uri: postgresUri });
	t.expect(await keyv.set("foo", "bar")).toBe(true);
	t.expect(await keyv.get("foo")).toBe("bar");
});

test.it("test unlogged table", async (t) => {
	const keyv = createKeyv({ uri: postgresUri, useUnloggedTable: true });
	t.expect(await keyv.set("foo", "bar")).toBe(true);
	t.expect(await keyv.get("foo")).toBe("bar");
});

test.it(".setMany support", async (t) => {
	const keyv = new KeyvPostgres(postgresUri);
	await keyv.set("foo", "bar");
	await keyv.setMany([
		{ key: "foo", value: "bar" },
		{ key: "foo2", value: "bar2" },
		{ key: "foo3", value: "bar3" },
	]);
	t.expect(await keyv.getMany(["foo", "foo2", "foo3"])).toStrictEqual([
		"bar",
		"bar2",
		"bar3",
	]);
});

test.it("iterator emits error and stops when query fails", async (t) => {
	const keyv = new KeyvPostgres({ uri: postgresUri });

	// Store the original query function
	const originalQuery = keyv.query;

	try {
		// Replace query to throw an error on SELECT (iterator query)
		keyv.query = async (sql: string, values?: unknown[]) => {
			if (sql.includes("SELECT * FROM") && sql.includes("LIKE")) {
				throw new Error("Connection lost");
			}

			return originalQuery(sql, values);
		};

		// Set up error listener
		const errors: Error[] = [];
		keyv.on("error", (error: Error) => {
			errors.push(error);
		});

		// Iterate - should emit error and stop
		const results: Array<[string, string]> = [];
		for await (const entry of keyv.iterator()) {
			results.push(entry as [string, string]);
		}

		// Should have emitted an error with context
		t.expect(errors.length).toBe(1);
		t.expect(errors[0].message).toContain("Iterator failed at offset 0");
		t.expect(errors[0].message).toContain("Connection lost");

		// Should have yielded no results
		t.expect(results.length).toBe(0);
	} finally {
		// Restore original query
		keyv.query = originalQuery;
	}
});
