import { Buffer } from "node:buffer";
import { faker } from "@faker-js/faker";
import BigNumber from "bignumber.js";
import JSONbig from "json-bigint";
import type KeyvModule from "keyv";
import type { KeyvStoreFn, TestFunction } from "./types.js";

/**
 * Registers Keyv value type tests: verifies storage of false, null, undefined, numbers,
 * objects, buffers, strings, symbols, BigInt, and special characters.
 * @param test - The test registration function (e.g. vitest `it`)
 * @param Keyv - The Keyv constructor
 * @param store - Factory that returns a fresh store instance per test
 */
const keyvValueTests = (test: TestFunction, Keyv: typeof KeyvModule, store: KeyvStoreFn) => {
	test("value can be false", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, false);
		t.expect(await keyv.get(key)).toBeFalsy();
	});

	test("value can be null", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, null);
		t.expect(await keyv.get(key)).toBeNull();
	});

	test("value can be undefined", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, undefined);
		t.expect(await keyv.get(key)).toBeUndefined();
	});

	test("value can be a number", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, 0);
		t.expect(await keyv.get(key)).toBe(0);
	});

	test("value can be an object", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = { fizz: "buzz" };
		await keyv.set(key, value);
		t.expect(await keyv.get(key)).toEqual(value);
	});

	test("value can be a buffer", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		const buf = Buffer.from("bar");
		await keyv.set(key, buf);
		const result = await keyv.get(key);
		/* v8 ignore next -- @preserve */
		if (result !== undefined) {
			t.expect(buf.equals(result)).toBeTruthy();
		} else {
			/* v8 ignore next -- @preserve */
			t.expect(result).toBeDefined();
		}
	});

	test("value can be an object containing a buffer", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = { buff: Buffer.from("buzz") };
		await keyv.set(key, value);
		t.expect(await keyv.get(key)).toEqual(value);
	});

	test("value can contain quotes", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = '"';
		await keyv.set(key, value);
		t.expect(await keyv.get(key)).toEqual(value);
	});

	test("value can be a string", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await keyv.set(key, value);
		t.expect(await keyv.get(key)).toBe(value);
	});

	test("value can not be symbol", async (t) => {
		const keyv = new Keyv({ store: store() });
		keyv.on("error", () => {});
		const key = faker.string.alphanumeric(10);
		const value = Symbol("value");

		const result = await keyv.set(key, value);
		t.expect(result).toBe(false);
	});

	test("value can be BigInt using other serializer/deserializer", async (t) => {
		const keyv = new Keyv({
			store: store(),
			serialization: {
				stringify: (data: unknown) => JSONbig.stringify(data),
				parse: <T>(data: string) => JSONbig.parse(data) as T,
			},
		});
		const key = faker.string.alphanumeric(10);
		const value = BigInt("9223372036854775807") as unknown as BigNumber.Value;
		await keyv.set(key, value);
		const storedValue = await keyv.get(key);
		t.expect(JSONbig.stringify(storedValue)).toBe(BigNumber(value).toString());
	});

	test("single quotes value should be saved", async (t) => {
		const keyv = new Keyv({ store: store() });
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);

		let value = "'";
		await keyv.set(key1, value);
		t.expect(await keyv.get(key1)).toBe(value);

		value = "''";
		await keyv.set(key2, value);
		t.expect(await keyv.get(key2)).toBe(value);
		value = '"';
		await keyv.set(key3, value);
		t.expect(await keyv.get(key3)).toBe(value);
	});

	test("single quotes key should be saved", async (t) => {
		const keyv = new Keyv({ store: store() });

		const value = "'";

		const key = "'";
		const result = await keyv.set(key, value);
		t.expect(result).toBe(true);
		t.expect(await keyv.get(key)).toBe(value);
	});
};

export { keyvValueTests };
