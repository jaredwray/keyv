import Keyv from "keyv";
import { describe, expect, it } from "vitest";
import { KeyvSuperJsonSerializer, superJsonSerializer } from "../src/index.js";

describe("KeyvSuperJsonSerializer", () => {
	it("should be instantiable", () => {
		const serializer = new KeyvSuperJsonSerializer();
		expect(serializer).toBeInstanceOf(KeyvSuperJsonSerializer);
	});

	it("superJsonSerializer is a default instance", () => {
		expect(superJsonSerializer).toBeInstanceOf(KeyvSuperJsonSerializer);
	});

	it("stringify and parse of string value", () => {
		const serialized = superJsonSerializer.stringify({ value: "foo" });
		const deserialized = superJsonSerializer.parse<{ value: string }>(serialized);
		expect(deserialized.value).toBe("foo");
	});

	it("stringify and parse of number value", () => {
		const serialized = superJsonSerializer.stringify({ value: 5 });
		const deserialized = superJsonSerializer.parse<{ value: number }>(serialized);
		expect(deserialized.value).toBe(5);
	});

	it("stringify and parse of boolean value", () => {
		const serialized = superJsonSerializer.stringify({ value: true });
		const deserialized = superJsonSerializer.parse<{ value: boolean }>(serialized);
		expect(deserialized.value).toBe(true);
	});

	it("stringify and parse of null value", () => {
		const serialized = superJsonSerializer.stringify({ value: null });
		const deserialized = superJsonSerializer.parse<{ value: null }>(serialized);
		expect(deserialized.value).toBeNull();
	});

	it("stringify and parse of undefined value", () => {
		const serialized = superJsonSerializer.stringify({ value: undefined });
		const deserialized = superJsonSerializer.parse<{ value: undefined }>(serialized);
		expect(deserialized.value).toBeUndefined();
	});

	it("stringify and parse of object value", () => {
		const original = { foo: "bar", bar: 5, baz: true };
		const serialized = superJsonSerializer.stringify({ value: original });
		const deserialized = superJsonSerializer.parse<{ value: typeof original }>(serialized);
		expect(deserialized.value).toEqual(original);
	});

	it("stringify and parse of array value", () => {
		const serialized = superJsonSerializer.stringify([1, "hello", true, null]);
		const deserialized = superJsonSerializer.parse<unknown[]>(serialized);
		expect(deserialized).toEqual([1, "hello", true, null]);
	});

	it("stringify and parse of nested arrays", () => {
		const serialized = superJsonSerializer.stringify({
			value: [
				[1, 2],
				[3, 4],
			],
		});
		const deserialized = superJsonSerializer.parse<{ value: number[][] }>(serialized);
		expect(deserialized.value).toEqual([
			[1, 2],
			[3, 4],
		]);
	});
});

describe("SuperJSON extended type support", () => {
	it("stringify and parse of Date", () => {
		const date = new Date("2024-01-15T12:00:00.000Z");
		const serialized = superJsonSerializer.stringify({ value: date });
		const deserialized = superJsonSerializer.parse<{ value: Date }>(serialized);
		expect(deserialized.value).toBeInstanceOf(Date);
		expect(deserialized.value.toISOString()).toBe("2024-01-15T12:00:00.000Z");
	});

	it("stringify and parse of RegExp", () => {
		const regex = /hello\s+world/gi;
		const serialized = superJsonSerializer.stringify({ value: regex });
		const deserialized = superJsonSerializer.parse<{ value: RegExp }>(serialized);
		expect(deserialized.value).toBeInstanceOf(RegExp);
		expect(deserialized.value.source).toBe(regex.source);
		expect(deserialized.value.flags).toBe(regex.flags);
	});

	it("stringify and parse of Map", () => {
		const map = new Map<string, number>([
			["a", 1],
			["b", 2],
		]);
		const serialized = superJsonSerializer.stringify({ value: map });
		const deserialized = superJsonSerializer.parse<{
			value: Map<string, number>;
		}>(serialized);
		expect(deserialized.value).toBeInstanceOf(Map);
		expect(deserialized.value.get("a")).toBe(1);
		expect(deserialized.value.get("b")).toBe(2);
		expect(deserialized.value.size).toBe(2);
	});

	it("stringify and parse of Set", () => {
		const set = new Set([1, 2, 3]);
		const serialized = superJsonSerializer.stringify({ value: set });
		const deserialized = superJsonSerializer.parse<{ value: Set<number> }>(serialized);
		expect(deserialized.value).toBeInstanceOf(Set);
		expect(deserialized.value.has(1)).toBe(true);
		expect(deserialized.value.has(2)).toBe(true);
		expect(deserialized.value.has(3)).toBe(true);
		expect(deserialized.value.size).toBe(3);
	});

	it("stringify and parse of BigInt", () => {
		const serialized = superJsonSerializer.stringify({
			value: BigInt("9223372036854775807"),
		});
		const deserialized = superJsonSerializer.parse<{ value: bigint }>(serialized);
		expect(deserialized.value).toBe(BigInt("9223372036854775807"));
	});

	it("stringify and parse of negative BigInt", () => {
		const serialized = superJsonSerializer.stringify({
			value: BigInt("-123456789"),
		});
		const deserialized = superJsonSerializer.parse<{ value: bigint }>(serialized);
		expect(deserialized.value).toBe(BigInt("-123456789"));
	});

	it("stringify and parse of Error", () => {
		const error = new Error("something went wrong");
		const serialized = superJsonSerializer.stringify({ value: error });
		const deserialized = superJsonSerializer.parse<{ value: Error }>(serialized);
		expect(deserialized.value).toBeInstanceOf(Error);
		expect(deserialized.value.message).toBe("something went wrong");
	});

	it("stringify and parse of nested mixed types", () => {
		const original = {
			date: new Date("2024-06-01"),
			numbers: new Set([1, 2, 3]),
			mapping: new Map([["key", "value"]]),
			big: BigInt(42),
			pattern: /test/i,
			nested: {
				innerDate: new Date("2025-01-01"),
			},
		};
		const serialized = superJsonSerializer.stringify(original);
		// biome-ignore lint/suspicious/noExplicitAny: test file
		const deserialized = superJsonSerializer.parse<any>(serialized);
		expect(deserialized.date).toBeInstanceOf(Date);
		expect(deserialized.numbers).toBeInstanceOf(Set);
		expect(deserialized.mapping).toBeInstanceOf(Map);
		expect(deserialized.big).toBe(BigInt(42));
		expect(deserialized.pattern).toBeInstanceOf(RegExp);
		expect(deserialized.nested.innerDate).toBeInstanceOf(Date);
	});
});

describe("Integration with Keyv", () => {
	it("should work as a Keyv serializer for basic values", async () => {
		const keyv = new Keyv({ serialization: superJsonSerializer });
		await keyv.set("key", "hello");
		const value = await keyv.get("key");
		expect(value).toBe("hello");
	});

	it("should work as a Keyv serializer for Date values", async () => {
		const keyv = new Keyv({ serialization: superJsonSerializer });
		const date = new Date("2024-01-15T12:00:00.000Z");
		await keyv.set("key", date);
		const value = await keyv.get<Date>("key");
		expect(value).toBeInstanceOf(Date);
		expect(value?.toISOString()).toBe("2024-01-15T12:00:00.000Z");
	});

	it("should work as a Keyv serializer for Map values", async () => {
		const keyv = new Keyv({ serialization: superJsonSerializer });
		const map = new Map([
			["a", 1],
			["b", 2],
		]);
		await keyv.set("key", map);
		const value = await keyv.get<Map<string, number>>("key");
		expect(value).toBeInstanceOf(Map);
		expect(value?.get("a")).toBe(1);
	});

	it("should work as a Keyv serializer for Set values", async () => {
		const keyv = new Keyv({ serialization: superJsonSerializer });
		const set = new Set([1, 2, 3]);
		await keyv.set("key", set);
		const value = await keyv.get<Set<number>>("key");
		expect(value).toBeInstanceOf(Set);
		expect(value?.size).toBe(3);
	});

	it("should work with TTL", async () => {
		const keyv = new Keyv({ serialization: superJsonSerializer });
		await keyv.set("key", "value", 10_000);
		const value = await keyv.get("key");
		expect(value).toBe("value");
	});
});
