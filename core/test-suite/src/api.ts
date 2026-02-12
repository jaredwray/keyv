import type KeyvModule from "keyv";
import tk from "timekeeper";
import type * as Vitest from "vitest";
import type { KeyvStoreFn } from "./types";

const keyvApiTests = (
	test: typeof Vitest,
	Keyv: typeof KeyvModule,
	store: KeyvStoreFn,
) => {
	test.beforeEach(async () => {
		const keyv = new Keyv({ store: store() });
		await keyv.clear();
	});

	test.it(".set(key, value) returns a Promise", (t) => {
		const keyv = new Keyv({ store: store() });
		t.expect(keyv.set("foo", "bar") instanceof Promise).toBeTruthy();
	});

	test.it(".set(key, value) resolves to true", async (t) => {
		const keyv = new Keyv({ store: store() });
		t.expect(await keyv.set("foo", "bar")).toBeTruthy();
	});

	test.it(".set(key, value) sets a value", async (t) => {
		const keyv = new Keyv({ store: store() });
		await keyv.set("foo", "bar");
		t.expect(await keyv.get("foo")).toBe("bar");
	});

	test.it(".set(key, value, ttl) sets a value that expires", async (t) => {
		const ttl = 1000;
		const keyv = new Keyv({ store: store() });
		await keyv.set("foo", "bar", ttl);
		t.expect(await keyv.get("foo")).toBe("bar");
		tk.freeze(Date.now() + ttl + 1);
		t.expect(await keyv.get("foo")).toBeUndefined();
		tk.reset();
	});

	test.it(".get(key) returns a Promise", (t) => {
		const keyv = new Keyv({ store: store() });
		t.expect(keyv.get("foo") instanceof Promise).toBeTruthy();
	});

	test.it(".get(key) resolves to value", async (t) => {
		const keyv = new Keyv({ store: store() });
		await keyv.set("foo", "bar");
		t.expect(await keyv.get("foo")).toBe("bar");
	});

	test.it(".get(key) with nonexistent key resolves to undefined", async (t) => {
		const keyv = new Keyv({ store: store() });
		t.expect(await keyv.get("foo")).toBeUndefined();
	});

	test.it(".get([keys]) should return array values", async (t) => {
		const keyv = new Keyv({ store: store() });
		const ttl = 3000;
		await keyv.set("foo", "bar", ttl);
		await keyv.set("foo1", "bar1", ttl);
		await keyv.set("foo2", "bar2", ttl);
		const values = (await keyv.get(["foo", "foo1", "foo2"])) as string[];
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values[0]).toBe("bar");
		t.expect(values[1]).toBe("bar1");
		t.expect(values[2]).toBe("bar2");
	});

	test.it(
		".get([keys]) should return array value undefined when expires",
		async (t) => {
			const keyv = new Keyv();
			await keyv.set("foo", "bar");
			await keyv.set("foo1", "bar1", 1);
			await keyv.set("foo2", "bar2");
			await new Promise<void>((resolve) => {
				setTimeout(() => {
					// Simulate database latency
					resolve();
				}, 30);
			});
			const values = await keyv.get(["foo", "foo1", "foo2"]);
			t.expect(Array.isArray(values)).toBeTruthy();
			t.expect(values[0]).toBe("bar");
			t.expect(values[1]).toBeUndefined();
			t.expect(values[2]).toBe("bar2");
		},
	);

	test.it(
		".get([keys]) should return array values with undefined",
		async (t) => {
			const keyv = new Keyv({ store: store() });
			const ttl = 3000;
			await keyv.set("foo", "bar", ttl);
			await keyv.set("foo2", "bar2", ttl);
			const values = (await keyv.get(["foo", "foo1", "foo2"])) as
				| string[]
				| undefined[];
			t.expect(Array.isArray(values)).toBeTruthy();
			t.expect(values[0]).toBe("bar");
			t.expect(values[1]).toBeUndefined();
			t.expect(values[2]).toBe("bar2");
		},
	);

	test.it(
		".get([keys]) should return undefined array for all no existent keys",
		async (t) => {
			const keyv = new Keyv({ store: store() });
			const values = await keyv.get(["foo", "foo1", "foo2"]);
			t.expect(Array.isArray(values)).toBeTruthy();
			t.expect(values).toEqual([undefined, undefined, undefined]);
		},
	);

	test.it(".delete(key) returns a Promise", (t) => {
		const keyv = new Keyv({ store: store() });
		t.expect(keyv.delete("foo") instanceof Promise).toBeTruthy();
	});

	test.it(".delete([key]) returns a Promise", (t) => {
		const keyv = new Keyv({ store: store() });
		t.expect(keyv.delete(["foo"]) instanceof Promise).toBeTruthy();
	});

	test.it(".delete(key) resolves to true", async (t) => {
		const keyv = new Keyv({ store: store() });
		await keyv.set("foo", "bar");
		t.expect(await keyv.delete("foo")).toBeTruthy();
	});

	test.it(".delete(key) with nonexistent key resolves to false", async (t) => {
		const keyv = new Keyv({ store: store() });
		t.expect(await keyv.delete("foo")).toBeFalsy();
	});

	test.it(".delete(key) deletes a key", async (t) => {
		const keyv = new Keyv({ store: store() });
		await keyv.set("foo", "bar");
		t.expect(await keyv.delete("foo")).toBeTruthy();
		t.expect(await keyv.get("foo")).toBeUndefined();
	});

	test.it(".deleteMany([keys]) should delete multiple key", async (t) => {
		const keyv = new Keyv({ store: store() });
		await keyv.set("foo", "bar");
		await keyv.set("foo1", "bar1");
		await keyv.set("foo2", "bar2");
		t.expect(await keyv.delete(["foo", "foo1", "foo2"])).toBeTruthy();
		t.expect(await keyv.get("foo")).toBeUndefined();
		t.expect(await keyv.get("foo1")).toBeUndefined();
		t.expect(await keyv.get("foo2")).toBeUndefined();
	});

	test.it(
		".deleteMany([keys]) with nonexistent keys resolves to false",
		async (t) => {
			const keyv = new Keyv({ store: store() });
			t.expect(await keyv.delete(["foo", "foo1", "foo2"])).toBeFalsy();
		},
	);

	test.it(".clear() returns a Promise", async (t) => {
		const keyv = new Keyv({ store: store() });
		const returnValue = keyv.clear();
		t.expect(returnValue instanceof Promise).toBeTruthy();
		await returnValue;
	});

	test.it(".clear() resolves to undefined", async (t) => {
		const keyv = new Keyv({ store: store() });
		t.expect(await keyv.clear()).toBeUndefined();
		await keyv.set("foo", "bar");
		t.expect(await keyv.clear()).toBeUndefined();
	});

	test.it(".clear() deletes all key/value pairs", async (t) => {
		const keyv = new Keyv({ store: store() });
		await keyv.set("foo", "bar");
		await keyv.set("fizz", "buzz");
		await keyv.clear();
		t.expect(await keyv.get("foo")).toBeUndefined();
		t.expect(await keyv.get("fizz")).toBeUndefined();
	});

	test.it(".has(key) where key is the key we are looking for", async (t) => {
		const keyv = new Keyv({ store: store() });
		await keyv.set("foo", "bar");
		t.expect(await keyv.has("foo")).toBeTruthy();
		t.expect(await keyv.has("fizz")).toBeFalsy();
	});
};

export default keyvApiTests;
