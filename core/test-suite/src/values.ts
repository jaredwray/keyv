import { Buffer } from "node:buffer";
import BigNumber from "bignumber.js";
import JSONbig from "json-bigint";
import type KeyvModule from "keyv";
import type * as Vitest from "vitest";
import type { KeyvStoreFn } from "./types";

const keyvValueTests = (
	test: typeof Vitest,
	Keyv: typeof KeyvModule,
	store: KeyvStoreFn,
) => {
	test.beforeEach(async () => {
		const keyv = new Keyv({ store: store() });
		await keyv.clear();
	});

	test.it("value can be false", async (t) => {
		const keyv = new Keyv({ store: store() });
		await keyv.set("foo", false);
		t.expect(await keyv.get("foo")).toBeFalsy();
	});

	test.it("value can be null", async (t) => {
		const keyv = new Keyv({ store: store() });
		await keyv.set("foo", null);
		t.expect(await keyv.get("foo")).toBeNull();
	});

	test.it("value can be undefined", async (t) => {
		const keyv = new Keyv({ store: store() });
		await keyv.set("foo", undefined);
		t.expect(await keyv.get("foo")).toBeUndefined();
	});

	test.it("value can be a number", async (t) => {
		const keyv = new Keyv({ store: store() });
		await keyv.set("foo", 0);
		t.expect(await keyv.get("foo")).toBe(0);
	});

	test.it("value can be an object", async (t) => {
		const keyv = new Keyv({ store: store() });
		const value = { fizz: "buzz" };
		await keyv.set("foo", value);
		t.expect(await keyv.get("foo")).toEqual(value);
	});

	test.it("value can be a buffer", async (t) => {
		const keyv = new Keyv({ store: store() });
		const buf = Buffer.from("bar");
		await keyv.set("foo", buf);
		const result = await keyv.get("foo");
		/* v8 ignore next -- @preserve */
		if (result !== undefined) {
			t.expect(buf.equals(result)).toBeTruthy();
		} else {
			/* v8 ignore next -- @preserve */
			t.expect(result).toBeDefined();
		}
	});

	test.it("value can be an object containing a buffer", async (t) => {
		const keyv = new Keyv({ store: store() });
		const value = { buff: Buffer.from("buzz") };
		await keyv.set("foo", value);
		t.expect(await keyv.get("foo")).toEqual(value);
	});

	test.it("value can contain quotes", async (t) => {
		const keyv = new Keyv({ store: store() });
		const value = '"';
		await keyv.set("foo", value);
		t.expect(await keyv.get("foo")).toEqual(value);
	});

	test.it("value can be a string", async (t) => {
		const keyv = new Keyv({ store: store() });
		await keyv.set("foo", "bar");
		t.expect(await keyv.get("foo")).toBe("bar");
	});

	test.it("value can not be symbol", async (t) => {
		const keyv = new Keyv({ store: store() });
		const value = Symbol("value");

		// biome-ignore lint/suspicious/noImplicitAnyLet: test file
		let errorObject;
		try {
			await keyv.set("foo", value);
		} catch (error) {
			errorObject = error;
			t.expect((error as Error).message).toBe("symbol cannot be serialized");
		}

		t.expect((errorObject as Error).message).toBe(
			"symbol cannot be serialized",
		);
	});

	test.it(
		"value can be BigInt using other serializer/deserializer",
		async (t) => {
			store().opts.deserialize = JSONbig.parse;
			const keyv = new Keyv({
				store: store(),
				serialize: JSONbig.stringify,
				deserialize: JSONbig.parse,
			});
			const value = BigInt("9223372036854775807") as unknown as BigNumber.Value;
			await keyv.set("foo", value);
			const storedValue = await keyv.get("foo");
			t.expect(JSONbig.stringify(storedValue)).toBe(
				BigNumber(value).toString(),
			);
		},
	);

	test.it("single quotes value should be saved", async (t) => {
		const keyv = new Keyv({ store: store() });

		let value = "'";
		await keyv.set("key", value);
		t.expect(await keyv.get("key")).toBe(value);

		value = "''";
		await keyv.set("key1", value);
		t.expect(await keyv.get("key1")).toBe(value);
		value = '"';
		await keyv.set("key2", value);
		t.expect(await keyv.get("key2")).toBe(value);
	});

	test.it("single quotes key should be saved", async (t) => {
		const keyv = new Keyv({ store: store() });

		const value = "'";

		const key = "'";
		await keyv.set(key, value);
		t.expect(await keyv.get(key)).toBe(value);
	});
};

export default keyvValueTests;
