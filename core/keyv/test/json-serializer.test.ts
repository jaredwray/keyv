import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonSerializer, KeyvJsonSerializer } from "../src/json-serializer.js";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("KeyvJsonSerializer", () => {
	it("should be instantiable", () => {
		const serializer = new KeyvJsonSerializer();
		expect(serializer).toBeInstanceOf(KeyvJsonSerializer);
	});

	it("jsonSerializer is a default instance", () => {
		expect(jsonSerializer).toBeInstanceOf(KeyvJsonSerializer);
	});

	it("stringify and parse of string value", () => {
		const serialized = jsonSerializer.stringify({ value: "foo" });
		const deserialized = jsonSerializer.parse<{ value: string }>(serialized);
		expect(deserialized.value).toBe("foo");
	});

	it("stringify and parse of number value", () => {
		const serialized = jsonSerializer.stringify({ value: 5 });
		const deserialized = jsonSerializer.parse<{ value: number }>(serialized);
		expect(deserialized.value).toBe(5);
	});

	it("stringify and parse of boolean value", () => {
		const serialized = jsonSerializer.stringify({ value: true });
		const deserialized = jsonSerializer.parse<{ value: boolean }>(serialized);
		expect(deserialized.value).toBe(true);
	});

	it("stringify and parse of only string value", () => {
		const serialized = jsonSerializer.stringify("foo");
		expect(jsonSerializer.parse<string>(serialized)).toBe("foo");
	});

	it("stringify and parse of only string value with colon", () => {
		const serialized = jsonSerializer.stringify(":base64:aGVsbG8gd29ybGQ=");
		expect(jsonSerializer.parse<string>(serialized)).toBe(
			":base64:aGVsbG8gd29ybGQ=",
		);
	});

	it("stringify and parse of object value", () => {
		const serialized = jsonSerializer.stringify({
			value: {
				foo: "bar",
				bar: 5,
				baz: true,
				def: undefined,
				nul: null,
			},
		});
		const deserialized = jsonSerializer.parse<{
			value: {
				foo: string;
				bar: number;
				baz: boolean;
				def?: string;
				nul: string | undefined;
			};
		}>(serialized);
		expect(deserialized.value).toEqual({
			foo: "bar",
			bar: 5,
			baz: true,
			nul: null,
		});
	});

	it("stringify converts Buffer to base64 JSON string", () => {
		const buffer = Buffer.from("hello world", "utf8");
		const expectedResult = JSON.stringify(
			`:base64:${buffer.toString("base64")}`,
		);
		const result = jsonSerializer.stringify(buffer);
		expect(result).toBe(expectedResult);
	});

	it("stringify converts Uint8Array to base64 JSON string", () => {
		const bytes = new Uint8Array([104, 101, 108, 108, 111]);
		const result = jsonSerializer.stringify(bytes);
		expect(result).toBe(JSON.stringify(":base64:aGVsbG8="));
	});

	it("stringify toJSON is called on object", () => {
		const serialized = jsonSerializer.stringify({
			value: { toJSON: () => "foo" },
		});
		const deserialized = jsonSerializer.parse<{ value: string }>(serialized);
		expect(deserialized.value).toBe("foo");
	});

	it("stringify and parse with array in array", () => {
		const serialized = jsonSerializer.stringify({
			value: [
				[1, 2],
				[3, 4],
			],
		});
		const deserialized = jsonSerializer.parse<{ value: number[][] }>(
			serialized,
		);
		expect(deserialized.value).toEqual([
			[1, 2],
			[3, 4],
		]);
	});

	it("stringify and parse of nested Buffer", () => {
		const buffer = Buffer.from("hello world", "utf8");
		const serialized = jsonSerializer.stringify({ data: buffer });
		const deserialized = jsonSerializer.parse<{ data: Buffer }>(serialized);
		expect(Buffer.isBuffer(deserialized.data)).toBe(true);
		expect(deserialized.data.toString()).toBe("hello world");
	});

	it("stringify and parse of Buffer in array", () => {
		const buf1 = Buffer.from("one", "utf8");
		const buf2 = Buffer.from("two", "utf8");
		const serialized = jsonSerializer.stringify({ items: [buf1, buf2] });
		const deserialized = jsonSerializer.parse<{ items: Buffer[] }>(serialized);
		expect(Buffer.isBuffer(deserialized.items[0])).toBe(true);
		expect(deserialized.items[0].toString()).toBe("one");
		expect(deserialized.items[1].toString()).toBe("two");
	});

	it("stringify and parse of BigInt in array", () => {
		const serialized = jsonSerializer.stringify({
			values: [BigInt(1), BigInt(2), BigInt(3)],
		});
		const deserialized = jsonSerializer.parse<{ values: bigint[] }>(serialized);
		expect(deserialized.values).toEqual([BigInt(1), BigInt(2), BigInt(3)]);
	});

	it("stringify and parse of top-level array", () => {
		const serialized = jsonSerializer.stringify([1, "hello", true, null]);
		const deserialized = jsonSerializer.parse<unknown[]>(serialized);
		expect(deserialized).toEqual([1, "hello", true, null]);
	});

	it("parse detects base64 on string", () => {
		const json = JSON.stringify({
			encoded: ":base64:aGVsbG8gd29ybGQ=", // "hello world" in base64
		});
		const result = jsonSerializer.parse<{ encoded: Buffer }>(json);
		expect(result.encoded.toString()).toBe("hello world");
	});

	it("parse falls back to Uint8Array when Buffer is unavailable", () => {
		vi.stubGlobal("Buffer", undefined);
		const json = JSON.stringify({
			encoded: ":base64:aGVsbG8=",
		});

		const result = jsonSerializer.parse<{ encoded: Uint8Array }>(json);
		expect(result.encoded).toBeInstanceOf(Uint8Array);
		expect(Array.from(result.encoded)).toEqual([104, 101, 108, 108, 111]);
	});

	it("stringify accepts objects created with null", () => {
		// biome-ignore lint/suspicious/noExplicitAny: test file
		const json = Object.create(null) as Record<string, any>;
		json.someKey = "value";

		const result = jsonSerializer.stringify(json);
		expect(result).toStrictEqual('{"someKey":"value"}');
	});

	it("parse removes the first colon from strings not prefixed by base64", () => {
		const json = JSON.stringify({
			simple: ":hello",
		});

		const result = jsonSerializer.parse<{ simple: string }>(json);
		expect(result.simple).toBe("hello");
	});

	it("stringify and parse of BigInt value", () => {
		const serialized = jsonSerializer.stringify({
			value: BigInt("9223372036854775807"),
		});
		const deserialized = jsonSerializer.parse<{ value: bigint }>(serialized);
		expect(deserialized.value).toBe(BigInt("9223372036854775807"));
	});

	it("stringify and parse of BigInt zero", () => {
		const serialized = jsonSerializer.stringify({ value: BigInt(0) });
		const deserialized = jsonSerializer.parse<{ value: bigint }>(serialized);
		expect(deserialized.value).toBe(BigInt(0));
	});

	it("stringify and parse of negative BigInt", () => {
		const serialized = jsonSerializer.stringify({
			value: BigInt("-123456789"),
		});
		const deserialized = jsonSerializer.parse<{ value: bigint }>(serialized);
		expect(deserialized.value).toBe(BigInt("-123456789"));
	});
});

describe("Colon-prefixed keys bug fix", () => {
	it("should preserve object keys with leading colons", () => {
		const originalData = {
			my: {
				":name": {
					one: "colon",
				},
			},
		};

		const serialized = jsonSerializer.stringify(originalData);
		const deserialized = jsonSerializer.parse<typeof originalData>(serialized);

		expect(deserialized).toEqual(originalData);

		// Specifically check that the colon-prefixed key is preserved
		const originalKey = ":name";
		const deserializedKey = Object.keys(deserialized.my)[0];

		expect(deserializedKey).toBe(originalKey);
		expect(deserializedKey).not.toBe("::name"); // Should not have double colon
	});

	it("should handle multiple colon-prefixed keys", () => {
		const originalData = {
			":first": "value1",
			":second:nested": "value2",
			"::double": "value3",
			normal: "value4",
		};

		const serialized = jsonSerializer.stringify(originalData);
		const deserialized = jsonSerializer.parse<typeof originalData>(serialized);

		expect(deserialized).toEqual(originalData);

		// Check all keys are preserved exactly
		const originalKeys = Object.keys(originalData).sort();
		const deserializedKeys = Object.keys(deserialized).sort();

		expect(deserializedKeys).toEqual(originalKeys);
	});

	it("should handle nested objects with colon-prefixed keys", () => {
		const originalData = {
			level1: {
				":nested": "value",
				level2: {
					"::double": "deep",
					":single": "value",
				},
			},
		};

		const serialized = jsonSerializer.stringify(originalData);
		const deserialized = jsonSerializer.parse<typeof originalData>(serialized);

		expect(deserialized).toEqual(originalData);
	});

	it("should still escape colon-prefixed values correctly", () => {
		// This test ensures we don't break the existing behavior for values
		const originalData = {
			normalKey: ":valueWithColon",
			anotherKey: "::doubleColonValue",
		};

		const serialized = jsonSerializer.stringify(originalData);
		const deserialized = jsonSerializer.parse<typeof originalData>(serialized);

		expect(deserialized).toEqual(originalData);
	});

	it("should handle arrays with colon-prefixed string values", () => {
		const originalData = {
			items: [":first", "::second", "normal"],
		};

		const serialized = jsonSerializer.stringify(originalData);
		const deserialized = jsonSerializer.parse<typeof originalData>(serialized);

		expect(deserialized).toEqual(originalData);
	});

	it("should preserve base64-like strings as regular strings", () => {
		// With the fix, base64-like strings in object values are preserved as strings
		// This is the correct behavior - user data should not be automatically decoded
		const originalData = {
			":normalKey": "value", // This should be preserved as a key
			content: ":base64:aGVsbG8gd29ybGQ=", // This should be preserved as a string
		};

		const serialized = jsonSerializer.stringify(originalData);
		const deserialized = jsonSerializer.parse<typeof originalData>(serialized);

		// The key should be preserved
		expect(Object.keys(deserialized)).toContain(":normalKey");
		// The base64-like value should remain a string (not auto-decoded)
		expect(deserialized.content).toBe(":base64:aGVsbG8gd29ybGQ=");
		expect(typeof deserialized.content).toBe("string");
	});
});
