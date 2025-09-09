import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { defaultDeserialize, defaultSerialize } from "../src/index.js";

describe("Serialize package tests", () => {
	it("serialization and deserialization of string value", () => {
		const serialized = defaultSerialize({ value: "foo" });
		const deserialized = defaultDeserialize<{ value: string }>(serialized);
		expect(deserialized.value).toBe("foo");
	});

	it("serialization and deserialization of number value", () => {
		const serialized = defaultSerialize({ value: 5 });
		const deserialized = defaultDeserialize<{ value: number }>(serialized);
		expect(deserialized.value).toBe(5);
	});

	it("serialization and deserialization of boolean value", () => {
		const serialized = defaultSerialize({ value: true });
		const deserialized = defaultDeserialize<{ value: boolean }>(serialized);
		expect(deserialized.value).toBe(true);
	});

	it("serialization and deserialization of only string value", () => {
		const serialized = defaultSerialize("foo");
		expect(defaultDeserialize<string>(serialized)).toBe("foo");
	});

	it("serialization and deserialization of only string value with colon", () => {
		const serialized = defaultSerialize(":base64:aGVsbG8gd29ybGQ=");
		expect(defaultDeserialize<string>(serialized)).toBe(
			":base64:aGVsbG8gd29ybGQ=",
		);
	});

	it("serialization and deserialization of object value", () => {
		const serialized = defaultSerialize({
			value: {
				foo: "bar",
				bar: 5,
				baz: true,
				def: undefined,
				nul: null,
			},
		});
		const deserialized = defaultDeserialize<{
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

	it("defaultSerialize converts Buffer to base64 JSON string", () => {
		const buffer = Buffer.from("hello world", "utf8");
		const expectedResult = JSON.stringify(
			`:base64:${buffer.toString("base64")}`,
		);
		const result = defaultSerialize(buffer);
		expect(result).toBe(expectedResult);
	});

	it("serialization toJSON is called on object", () => {
		const serialized = defaultSerialize({ value: { toJSON: () => "foo" } });
		const deserialized = defaultDeserialize<{ value: string }>(serialized);
		expect(deserialized.value).toBe("foo");
	});

	it("serialization with array in array", () => {
		const serialized = defaultSerialize({
			value: [
				[1, 2],
				[3, 4],
			],
		});
		const deserialized = defaultDeserialize<{ value: number[][] }>(serialized);
		expect(deserialized.value).toEqual([
			[1, 2],
			[3, 4],
		]);
	});

	it("defaultSerialize detects base64 on string", () => {
		const json = JSON.stringify({
			encoded: ":base64:aGVsbG8gd29ybGQ=", // "hello world" in base64
		});
		const result = defaultDeserialize<{ encoded: Buffer }>(json);
		expect(result.encoded.toString()).toBe("hello world");
	});

	it("defaultSerialize accepts objects created with null", () => {
		// biome-ignore lint/suspicious/noExplicitAny: test file
		const json = Object.create(null) as Record<string, any>;
		json.someKey = "value";

		const result = defaultSerialize(json);
		expect(result).toStrictEqual('{"someKey":"value"}');
	});

	it("removes the first colon from strings not prefixed by base64", () => {
		const json = JSON.stringify({
			simple: ":hello",
		});

		const result = defaultDeserialize<{ simple: string }>(json);
		expect(result.simple).toBe("hello");
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

		const serialized = defaultSerialize(originalData);
		const deserialized = defaultDeserialize<typeof originalData>(serialized);

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

		const serialized = defaultSerialize(originalData);
		const deserialized = defaultDeserialize<typeof originalData>(serialized);

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

		const serialized = defaultSerialize(originalData);
		const deserialized = defaultDeserialize<typeof originalData>(serialized);

		expect(deserialized).toEqual(originalData);
	});

	it("should still escape colon-prefixed values correctly", () => {
		// This test ensures we don't break the existing behavior for values
		const originalData = {
			normalKey: ":valueWithColon",
			anotherKey: "::doubleColonValue",
		};

		const serialized = defaultSerialize(originalData);
		const deserialized = defaultDeserialize<typeof originalData>(serialized);

		expect(deserialized).toEqual(originalData);
	});

	it("should handle arrays with colon-prefixed string values", () => {
		const originalData = {
			items: [":first", "::second", "normal"],
		};

		const serialized = defaultSerialize(originalData);
		const deserialized = defaultDeserialize<typeof originalData>(serialized);

		expect(deserialized).toEqual(originalData);
	});

	it("should preserve base64-like strings as regular strings", () => {
		// With the fix, base64-like strings in object values are preserved as strings
		// This is the correct behavior - user data should not be automatically decoded
		const originalData = {
			":normalKey": "value", // This should be preserved as a key
			content: ":base64:aGVsbG8gd29ybGQ=", // This should be preserved as a string
		};

		const serialized = defaultSerialize(originalData);
		const deserialized = defaultDeserialize<typeof originalData>(serialized);

		// The key should be preserved
		expect(Object.keys(deserialized)).toContain(":normalKey");
		// The base64-like value should remain a string (not auto-decoded)
		expect(deserialized.content).toBe(":base64:aGVsbG8gd29ybGQ=");
		expect(typeof deserialized.content).toBe("string");
	});
});
