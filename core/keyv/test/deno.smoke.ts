import Keyv from "../dist/index.js";

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
	if (!Object.is(actual, expected)) {
		throw new Error(
			`${message}. Expected ${String(expected)}, received ${String(actual)}`,
		);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

Deno.test("constructs a Keyv instance", () => {
	const keyv = new Keyv<string>({ store: new Map() });
	assert(keyv instanceof Keyv, "Keyv should construct successfully");
});

Deno.test("supports set, get, delete, and clear with a Map-backed store", async () => {
	const keyv = new Keyv<string>({ store: new Map() });

	await keyv.set("foo", "bar");
	assertEquals(
		await keyv.get("foo"),
		"bar",
		"Key should round-trip through get",
	);

	assertEquals(
		await keyv.delete("foo"),
		true,
		"Delete should return true for an existing key",
	);
	assertEquals(
		await keyv.get("foo"),
		undefined,
		"Deleted key should be missing",
	);

	await keyv.set("first", "one");
	await keyv.set("second", "two");
	await keyv.clear();

	assertEquals(
		await keyv.get("first"),
		undefined,
		"Clear should remove the first key",
	);
	assertEquals(
		await keyv.get("second"),
		undefined,
		"Clear should remove the second key",
	);
});

Deno.test("expires keys using ttl", async () => {
	const keyv = new Keyv<string>({ store: new Map() });

	await keyv.set("ttl-key", "value", 20);
	await sleep(50);

	assertEquals(
		await keyv.get("ttl-key"),
		undefined,
		"TTL should expire the stored key",
	);
});

Deno.test("supports setMany and getMany", async () => {
	const keyv = new Keyv<string>({ store: new Map() });

	const result = await keyv.setMany([
		{ key: "a", value: "one" },
		{ key: "b", value: "two" },
	]);

	assertEquals(
		result.length,
		2,
		"setMany should return a result for each entry",
	);
	const values = await keyv.getMany(["a", "b", "missing"]);

	assertEquals(
		values[0],
		"one",
		"getMany should return the first stored value",
	);
	assertEquals(
		values[1],
		"two",
		"getMany should return the second stored value",
	);
	assertEquals(
		values[2],
		undefined,
		"getMany should return undefined for a missing key",
	);
});
