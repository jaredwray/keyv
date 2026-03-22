import Keyv from "keyv";
import { describe, expect, it } from "vitest";
import { KeyvMsgpackrSerializer, msgpackrSerializer } from "../src/index.js";

describe("KeyvMsgpackrSerializer", () => {
	it("should be instantiable", () => {
		const serializer = new KeyvMsgpackrSerializer();
		expect(serializer).toBeInstanceOf(KeyvMsgpackrSerializer);
	});

	it("msgpackrSerializer is a default instance", () => {
		expect(msgpackrSerializer).toBeInstanceOf(KeyvMsgpackrSerializer);
	});

	it("stringify and parse of string value", () => {
		const serialized = msgpackrSerializer.stringify({ value: "foo" });
		const deserialized = msgpackrSerializer.parse<{ value: string }>(
			serialized,
		);
		expect(deserialized.value).toBe("foo");
	});

	it("stringify and parse of number value", () => {
		const serialized = msgpackrSerializer.stringify({ value: 5 });
		const deserialized = msgpackrSerializer.parse<{ value: number }>(
			serialized,
		);
		expect(deserialized.value).toBe(5);
	});

	it("stringify and parse of boolean value", () => {
		const serialized = msgpackrSerializer.stringify({ value: true });
		const deserialized = msgpackrSerializer.parse<{ value: boolean }>(
			serialized,
		);
		expect(deserialized.value).toBe(true);
	});

	it("stringify and parse of null value", () => {
		const serialized = msgpackrSerializer.stringify({ value: null });
		const deserialized = msgpackrSerializer.parse<{ value: null }>(serialized);
		expect(deserialized.value).toBeNull();
	});

	it("stringify and parse of undefined value", () => {
		const serialized = msgpackrSerializer.stringify({ value: undefined });
		const deserialized = msgpackrSerializer.parse<{ value: undefined }>(
			serialized,
		);
		expect(deserialized.value).toBeUndefined();
	});

	it("stringify and parse of object value", () => {
		const original = { foo: "bar", bar: 5, baz: true };
		const serialized = msgpackrSerializer.stringify({ value: original });
		const deserialized = msgpackrSerializer.parse<{ value: typeof original }>(
			serialized,
		);
		expect(deserialized.value).toEqual(original);
	});

	it("stringify and parse of array value", () => {
		const serialized = msgpackrSerializer.stringify([1, "hello", true, null]);
		const deserialized = msgpackrSerializer.parse<unknown[]>(serialized);
		expect(deserialized).toEqual([1, "hello", true, null]);
	});

	it("stringify and parse of nested arrays", () => {
		const serialized = msgpackrSerializer.stringify({
			value: [
				[1, 2],
				[3, 4],
			],
		});
		const deserialized = msgpackrSerializer.parse<{ value: number[][] }>(
			serialized,
		);
		expect(deserialized.value).toEqual([
			[1, 2],
			[3, 4],
		]);
	});
});

describe("msgpackr extended type support", () => {
	it("stringify and parse of Date", () => {
		const date = new Date("2024-01-15T12:00:00.000Z");
		const serialized = msgpackrSerializer.stringify({ value: date });
		const deserialized = msgpackrSerializer.parse<{ value: Date }>(serialized);
		expect(deserialized.value).toBeInstanceOf(Date);
		expect(deserialized.value.toISOString()).toBe("2024-01-15T12:00:00.000Z");
	});

	it("stringify and parse of RegExp", () => {
		const regex = /hello\s+world/gi;
		const serialized = msgpackrSerializer.stringify({ value: regex });
		const deserialized = msgpackrSerializer.parse<{ value: RegExp }>(
			serialized,
		);
		expect(deserialized.value).toBeInstanceOf(RegExp);
		expect(deserialized.value.source).toBe(regex.source);
		expect(deserialized.value.flags).toBe(regex.flags);
	});

	it("stringify and parse of Map", () => {
		const map = new Map<string, number>([
			["a", 1],
			["b", 2],
		]);
		const serialized = msgpackrSerializer.stringify({ value: map });
		const deserialized = msgpackrSerializer.parse<{
			value: Map<string, number>;
		}>(serialized);
		expect(deserialized.value).toBeInstanceOf(Map);
		expect(deserialized.value.get("a")).toBe(1);
		expect(deserialized.value.get("b")).toBe(2);
		expect(deserialized.value.size).toBe(2);
	});

	it("stringify and parse of Set", () => {
		const set = new Set([1, 2, 3]);
		const serialized = msgpackrSerializer.stringify({ value: set });
		const deserialized = msgpackrSerializer.parse<{ value: Set<number> }>(
			serialized,
		);
		expect(deserialized.value).toBeInstanceOf(Set);
		expect(deserialized.value.has(1)).toBe(true);
		expect(deserialized.value.has(2)).toBe(true);
		expect(deserialized.value.has(3)).toBe(true);
		expect(deserialized.value.size).toBe(3);
	});

	it("stringify and parse of Error", () => {
		const error = new Error("something went wrong");
		const serialized = msgpackrSerializer.stringify({ value: error });
		const deserialized = msgpackrSerializer.parse<{ value: Error }>(serialized);
		expect(deserialized.value).toBeInstanceOf(Error);
		expect(deserialized.value.message).toBe("something went wrong");
	});

	it("stringify and parse of nested mixed types", () => {
		const original = {
			date: new Date("2024-06-01"),
			numbers: new Set([1, 2, 3]),
			mapping: new Map([["key", "value"]]),
			pattern: /test/i,
			nested: {
				innerDate: new Date("2025-01-01"),
			},
		};
		const serialized = msgpackrSerializer.stringify(original);
		// biome-ignore lint/suspicious/noExplicitAny: test file
		const deserialized = msgpackrSerializer.parse<any>(serialized);
		expect(deserialized.date).toBeInstanceOf(Date);
		expect(deserialized.numbers).toBeInstanceOf(Set);
		expect(deserialized.mapping).toBeInstanceOf(Map);
		expect(deserialized.pattern).toBeInstanceOf(RegExp);
		expect(deserialized.nested.innerDate).toBeInstanceOf(Date);
	});

	it("stringify returns a base64 string", () => {
		const serialized = msgpackrSerializer.stringify({ value: "test" });
		expect(typeof serialized).toBe("string");
		// Verify it's valid base64
		const decoded = Buffer.from(serialized, "base64");
		expect(decoded.length).toBeGreaterThan(0);
	});
});

describe("Integration with Keyv", () => {
	it("should work as a Keyv serializer for basic values", async () => {
		const keyv = new Keyv({ serialization: msgpackrSerializer });
		await keyv.set("key", "hello");
		const value = await keyv.get("key");
		expect(value).toBe("hello");
	});

	it("should work as a Keyv serializer for Date values", async () => {
		const keyv = new Keyv({ serialization: msgpackrSerializer });
		const date = new Date("2024-01-15T12:00:00.000Z");
		await keyv.set("key", date);
		const value = await keyv.get<Date>("key");
		expect(value).toBeInstanceOf(Date);
		expect(value?.toISOString()).toBe("2024-01-15T12:00:00.000Z");
	});

	it("should work as a Keyv serializer for Map values", async () => {
		const keyv = new Keyv({ serialization: msgpackrSerializer });
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
		const keyv = new Keyv({ serialization: msgpackrSerializer });
		const set = new Set([1, 2, 3]);
		await keyv.set("key", set);
		const value = await keyv.get<Set<number>>("key");
		expect(value).toBeInstanceOf(Set);
		expect(value?.size).toBe(3);
	});

	it("should work with TTL", async () => {
		const keyv = new Keyv({ serialization: msgpackrSerializer });
		await keyv.set("key", "value", 10_000);
		const value = await keyv.get("key");
		expect(value).toBe("value");
	});
});
