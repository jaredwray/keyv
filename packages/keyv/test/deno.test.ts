import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Import Keyv from the built dist (ESM)
const { default: Keyv } = await import("../dist/index.js");

Deno.test("Keyv - basic set and get", async () => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar");
	const value = await keyv.get("foo");
	assertEquals(value, "bar");
	await keyv.clear();
});

Deno.test("Keyv - get returns undefined for non-existent key", async () => {
	const keyv = new Keyv();
	const value = await keyv.get("nonexistent");
	assertEquals(value, undefined);
});

Deno.test("Keyv - delete removes key", async () => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar");
	const deleted = await keyv.delete("foo");
	assertEquals(deleted, true);
	const value = await keyv.get("foo");
	assertEquals(value, undefined);
});

Deno.test("Keyv - has checks key existence", async () => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar");
	assertEquals(await keyv.has("foo"), true);
	assertEquals(await keyv.has("nonexistent"), false);
	await keyv.clear();
});

Deno.test("Keyv - clear removes all keys", async () => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar");
	await keyv.set("baz", "qux");
	await keyv.clear();
	assertEquals(await keyv.get("foo"), undefined);
	assertEquals(await keyv.get("baz"), undefined);
});

Deno.test("Keyv - TTL expiration", async () => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar", 100);
	assertEquals(await keyv.get("foo"), "bar");
	await new Promise((resolve) => setTimeout(resolve, 150));
	assertEquals(await keyv.get("foo"), undefined);
});

Deno.test("Keyv - namespace isolation", async () => {
	const keyv1 = new Keyv({ namespace: "ns1" });
	const keyv2 = new Keyv({ namespace: "ns2" });
	await keyv1.set("foo", "bar1");
	await keyv2.set("foo", "bar2");
	assertEquals(await keyv1.get("foo"), "bar1");
	assertEquals(await keyv2.get("foo"), "bar2");
	await keyv1.clear();
	await keyv2.clear();
});

Deno.test("Keyv - getMany returns multiple values", async () => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar");
	await keyv.set("baz", "qux");
	const values = await keyv.get(["foo", "baz", "nonexistent"]);
	assertEquals(values, ["bar", "qux", undefined]);
	await keyv.clear();
});

Deno.test("Keyv - setMany sets multiple values", async () => {
	const keyv = new Keyv();
	await keyv.set([
		{ key: "foo", value: "bar" },
		{ key: "baz", value: "qux" },
	]);
	assertEquals(await keyv.get("foo"), "bar");
	assertEquals(await keyv.get("baz"), "qux");
	await keyv.clear();
});

Deno.test("Keyv - deleteMany removes multiple keys", async () => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar");
	await keyv.set("baz", "qux");
	const deleted = await keyv.delete(["foo", "baz"]);
	assertEquals(deleted, true);
	assertEquals(await keyv.get("foo"), undefined);
	assertEquals(await keyv.get("baz"), undefined);
});

Deno.test("Keyv - iterator yields all entries", async () => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar");
	await keyv.set("baz", "qux");
	const entries: Array<[string, string]> = [];
	for await (const [key, value] of keyv.iterator()) {
		entries.push([key, value]);
	}
	assertEquals(entries.length, 2);
	await keyv.clear();
});

Deno.test("Keyv - complex value types", async () => {
	const keyv = new Keyv();
	const obj = { nested: { value: 123 }, array: [1, 2, 3] };
	await keyv.set("complex", obj);
	const retrieved = await keyv.get("complex");
	assertEquals(retrieved, obj);
	await keyv.clear();
});
