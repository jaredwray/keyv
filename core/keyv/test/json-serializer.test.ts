import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonSerializer, KeyvJsonSerializer } from "../src/json-serializer.js";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("KeyvJsonSerializer", () => {
	it("should be instantiable and have a default instance", () => {
		expect(new KeyvJsonSerializer()).toBeInstanceOf(KeyvJsonSerializer);
		expect(jsonSerializer).toBeInstanceOf(KeyvJsonSerializer);
	});

	it("stringify and parse of primitive and complex types", () => {
		// String
		expect(
			jsonSerializer.parse<{ value: string }>(jsonSerializer.stringify({ value: "foo" })).value,
		).toBe("foo");
		// Number
		expect(
			jsonSerializer.parse<{ value: number }>(jsonSerializer.stringify({ value: 5 })).value,
		).toBe(5);
		// Boolean
		expect(
			jsonSerializer.parse<{ value: boolean }>(jsonSerializer.stringify({ value: true })).value,
		).toBe(true);
		// Bare string
		expect(jsonSerializer.parse<string>(jsonSerializer.stringify("foo"))).toBe("foo");
		// String with colon prefix
		expect(jsonSerializer.parse<string>(jsonSerializer.stringify(":base64:aGVsbG8gd29ybGQ="))).toBe(
			":base64:aGVsbG8gd29ybGQ=",
		);
		// Complex object
		const obj = { foo: "bar", bar: 5, baz: true, def: undefined, nul: null };
		expect(
			jsonSerializer.parse<{ value: typeof obj }>(jsonSerializer.stringify({ value: obj })).value,
		).toEqual({ foo: "bar", bar: 5, baz: true, nul: null });
		// toJSON
		expect(
			jsonSerializer.parse<{ value: string }>(
				jsonSerializer.stringify({ value: { toJSON: () => "foo" } }),
			).value,
		).toBe("foo");
		// Top-level array
		expect(
			jsonSerializer.parse<unknown[]>(jsonSerializer.stringify([1, "hello", true, null])),
		).toEqual([1, "hello", true, null]);
		// Nested arrays
		expect(
			jsonSerializer.parse<{ value: number[][] }>(
				jsonSerializer.stringify({
					value: [
						[1, 2],
						[3, 4],
					],
				}),
			).value,
		).toEqual([
			[1, 2],
			[3, 4],
		]);
		// Null-prototype objects
		// biome-ignore lint/suspicious/noExplicitAny: test file
		const nullObj = Object.create(null) as Record<string, any>;
		nullObj.someKey = "value";
		expect(jsonSerializer.stringify(nullObj)).toBe('{"someKey":"value"}');
	});

	it("stringify and parse of Buffer and Uint8Array", () => {
		const buffer = Buffer.from("hello world", "utf8");
		expect(jsonSerializer.stringify(buffer)).toBe(
			JSON.stringify(`:base64:${buffer.toString("base64")}`),
		);

		const bytes = new Uint8Array([104, 101, 108, 108, 111]);
		expect(jsonSerializer.stringify(bytes)).toBe(JSON.stringify(":base64:aGVsbG8="));

		// Nested Buffer
		const nested = jsonSerializer.parse<{ data: Buffer }>(
			jsonSerializer.stringify({ data: buffer }),
		);
		expect(Buffer.isBuffer(nested.data)).toBe(true);
		expect(nested.data.toString()).toBe("hello world");

		// Buffer in array
		const arr = jsonSerializer.parse<{ items: Buffer[] }>(
			jsonSerializer.stringify({ items: [Buffer.from("one"), Buffer.from("two")] }),
		);
		expect(arr.items[0].toString()).toBe("one");
		expect(arr.items[1].toString()).toBe("two");

		// Parse detects base64
		const parsed = jsonSerializer.parse<{ encoded: Buffer }>(
			JSON.stringify({ encoded: ":base64:aGVsbG8gd29ybGQ=" }),
		);
		expect(parsed.encoded.toString()).toBe("hello world");
	});

	it("handles Buffer unavailable fallback with btoa/Uint8Array", () => {
		vi.stubGlobal("Buffer", undefined);
		const bytes = new Uint8Array([104, 101, 108, 108, 111]);
		expect(jsonSerializer.stringify(bytes)).toBe(JSON.stringify(":base64:aGVsbG8="));

		const parsed = jsonSerializer.parse<{ encoded: Uint8Array }>(
			JSON.stringify({ encoded: ":base64:aGVsbG8=" }),
		);
		expect(parsed.encoded).toBeInstanceOf(Uint8Array);
		expect(Array.from(parsed.encoded)).toEqual([104, 101, 108, 108, 111]);
	});

	it("stringify and parse of BigInt values", () => {
		expect(
			jsonSerializer.parse<{ value: bigint }>(
				jsonSerializer.stringify({ value: BigInt("9223372036854775807") }),
			).value,
		).toBe(BigInt("9223372036854775807"));
		expect(
			jsonSerializer.parse<{ value: bigint }>(jsonSerializer.stringify({ value: BigInt(0) })).value,
		).toBe(BigInt(0));
		expect(
			jsonSerializer.parse<{ value: bigint }>(
				jsonSerializer.stringify({ value: BigInt("-123456789") }),
			).value,
		).toBe(BigInt("-123456789"));
		// BigInt array
		expect(
			jsonSerializer.parse<{ values: bigint[] }>(
				jsonSerializer.stringify({ values: [BigInt(1), BigInt(2), BigInt(3)] }),
			).values,
		).toEqual([BigInt(1), BigInt(2), BigInt(3)]);
	});

	it("parse removes the first colon from non-base64 prefixed strings", () => {
		expect(
			jsonSerializer.parse<{ simple: string }>(JSON.stringify({ simple: ":hello" })).simple,
		).toBe("hello");
	});
});

describe("Colon-prefixed keys bug fix", () => {
	it("should preserve object keys with leading colons at all nesting levels", () => {
		const data = { my: { ":name": { one: "colon" } } };
		expect(jsonSerializer.parse<typeof data>(jsonSerializer.stringify(data))).toEqual(data);
		expect(
			Object.keys(jsonSerializer.parse<typeof data>(jsonSerializer.stringify(data)).my)[0],
		).toBe(":name");

		// Multiple colon-prefixed keys
		const multi = {
			":first": "value1",
			":second:nested": "value2",
			"::double": "value3",
			normal: "value4",
		};
		const parsed = jsonSerializer.parse<typeof multi>(jsonSerializer.stringify(multi));
		expect(Object.keys(parsed).sort()).toEqual(Object.keys(multi).sort());

		// Nested
		const nested = {
			level1: { ":nested": "value", level2: { "::double": "deep", ":single": "value" } },
		};
		expect(jsonSerializer.parse<typeof nested>(jsonSerializer.stringify(nested))).toEqual(nested);
	});

	it("should handle colon-prefixed values, arrays, and base64-like strings", () => {
		// Colon-prefixed values
		const values = { normalKey: ":valueWithColon", anotherKey: "::doubleColonValue" };
		expect(jsonSerializer.parse<typeof values>(jsonSerializer.stringify(values))).toEqual(values);

		// Arrays with colon-prefixed strings
		const arr = { items: [":first", "::second", "normal"] };
		expect(jsonSerializer.parse<typeof arr>(jsonSerializer.stringify(arr))).toEqual(arr);

		// Base64-like strings preserved
		const base64Data = { ":normalKey": "value", content: ":base64:aGVsbG8gd29ybGQ=" };
		const parsed = jsonSerializer.parse<typeof base64Data>(jsonSerializer.stringify(base64Data));
		expect(Object.keys(parsed)).toContain(":normalKey");
		expect(parsed.content).toBe(":base64:aGVsbG8gd29ybGQ=");
		expect(typeof parsed.content).toBe("string");
	});
});
