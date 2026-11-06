import { describe, expect, test } from "vitest";
import {
	decodeValue,
	encodeCheckpoint,
	encodeEntry,
	encodeEntryFile,
	encodeFileRecord,
	encodeStoreHeader,
	hashName,
	isExpired,
	parseEntryHeader,
	parseFileRecord,
	parseStoreHeader,
} from "../src/codec.js";

describe("encodeEntry and decodeValue", () => {
	test("strings are stored as they are", () => {
		const entry = encodeEntry('{"value":"x"}', undefined);
		expect(entry).toEqual({ kind: "s", data: '{"value":"x"}', expires: undefined });
		expect(decodeValue(entry.kind, entry.data)).toBe('{"value":"x"}');
	});

	test("undefined is stored", () => {
		const entry = encodeEntry(undefined, 5);
		expect(entry).toEqual({ kind: "u", data: "", expires: 5 });
		expect(decodeValue(entry.kind, entry.data)).toBeUndefined();
	});

	test("other values use the JSON serializer and keep Buffer and BigInt", () => {
		const value = { value: { buffer: Buffer.from("hi"), big: 10n }, expires: 1 };
		const entry = encodeEntry(value, undefined);
		expect(entry.kind).toBe("j");
		const decoded = decodeValue(entry.kind, entry.data) as typeof value;
		expect(decoded.value.big).toBe(10n);
		expect(Buffer.from(decoded.value.buffer).toString()).toBe("hi");
		expect(decodeValue(entry.kind, entry.data)).not.toBe(decoded);
	});

	test("a non-finite expiry means none", () => {
		expect(encodeEntry("x", Number.NaN).expires).toBeUndefined();
		expect(encodeEntry("x", Number.POSITIVE_INFINITY).expires).toBeUndefined();
		expect(encodeEntry("x", "5").expires).toBeUndefined();
	});

	test("values that can't be stored throw a TypeError", () => {
		expect(() => encodeEntry(() => 1, undefined)).toThrow(TypeError);
		expect(() => encodeEntry(Symbol("x"), undefined)).toThrow(TypeError);
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect(() => encodeEntry(circular, undefined)).toThrow(TypeError);
	});

	test("q values are JSON strings", () => {
		expect(decodeValue("q", JSON.stringify("\ud800"))).toBe("\ud800");
	});
});

test("isExpired treats an expiry equal to now as passed", () => {
	expect(isExpired(undefined, 10)).toBe(false);
	expect(isExpired(11, 10)).toBe(false);
	expect(isExpired(10, 10)).toBe(true);
	expect(isExpired(9, 10)).toBe(true);
});

test("hashName keeps strings with different lone surrogates apart", () => {
	expect(hashName("\ud800")).not.toBe(hashName("\ud801"));
	expect(hashName("Key")).not.toBe(hashName("key"));
	expect(hashName("a")).toMatch(/^[0-9a-f]{64}$/);
});

describe("store headers", () => {
	test("round-trip", () => {
		expect(parseStoreHeader(encodeStoreHeader("file"))).toEqual({
			format: "keyv-fs",
			kind: "file",
			version: 1,
		});
		expect(parseStoreHeader(encodeStoreHeader("directory"))?.kind).toBe("directory");
	});

	test("reject anything else", () => {
		expect(parseStoreHeader("")).toBeUndefined();
		expect(parseStoreHeader("[]")).toBeUndefined();
		expect(parseStoreHeader("null")).toBeUndefined();
		expect(parseStoreHeader('{"cache":[]}')).toBeUndefined();
		expect(parseStoreHeader('{"format":"keyv-fs","kind":1,"version":1}')).toBeUndefined();
		expect(parseStoreHeader('{"format":"keyv-fs","kind":"file","version":"1"}')).toBeUndefined();
		expect(parseStoreHeader('{"format":"keyv-fs","kind":"file","version":1.5}')).toBeUndefined();
	});
});

describe("file records", () => {
	test("round-trip every value kind, namespace and expiry", () => {
		const cases = [
			{ namespace: undefined, key: "a", entry: encodeEntry("v", undefined) },
			{ namespace: "ns", key: 'k"\n', entry: encodeEntry({ x: 1 }, 123) },
			{ namespace: "", key: "", entry: encodeEntry(undefined, undefined) },
		];
		for (const { namespace, key, entry } of cases) {
			const line = encodeFileRecord(namespace, key, entry);
			expect(line).not.toContain("\n");
			expect(parseFileRecord(line)).toEqual({ op: "set", namespace, key, entry });
		}
	});

	test("checkpoints round-trip", () => {
		expect(parseFileRecord(encodeCheckpoint(3))).toEqual({ op: "checkpoint", count: 3 });
	});

	test("reject invalid records", () => {
		const invalid = [
			"",
			"not json",
			"[]",
			'{"op":"checkpoint","count":-1}',
			'{"op":"checkpoint","count":1.5}',
			'{"op":"del","k":"a"}',
			'{"op":"set","k":1,"s":"x"}',
			'{"op":"set","k":"a","n":1,"s":"x"}',
			'{"op":"set","k":"a","e":"1","s":"x"}',
			'{"op":"set","k":"a"}',
			'{"op":"set","k":"a","u":2}',
			'{"op":"set","k":"a","j":1}',
		];
		for (const line of invalid) {
			expect(parseFileRecord(line), line).toBeUndefined();
		}
	});
});

describe("directory entry files", () => {
	test("put the header on the first line and the raw value after it", () => {
		const text = encodeEntryFile("ns", "key", encodeEntry('{"value":"x"}', 99));
		const [header, payload] = [
			text.slice(0, text.indexOf("\n")),
			text.slice(text.indexOf("\n") + 1),
		];
		expect(parseEntryHeader(header)).toEqual({
			key: "key",
			namespace: "ns",
			expires: 99,
			kind: "s",
		});
		expect(payload).toBe('{"value":"x"}');
	});

	test("store strings with lone surrogates as JSON", () => {
		const text = encodeEntryFile(undefined, "k", encodeEntry("a\ud800b", undefined));
		const header = parseEntryHeader(text.slice(0, text.indexOf("\n")));
		expect(header?.kind).toBe("q");
		expect(header?.namespace).toBeUndefined();
		expect(decodeValue("q", text.slice(text.indexOf("\n") + 1))).toBe("a\ud800b");
	});

	test("reject invalid headers", () => {
		const invalid = [
			"x",
			'{"format":"other","kind":"entry","version":1,"k":"a","t":"s"}',
			'{"format":"keyv-fs","kind":"file","version":1,"k":"a","t":"s"}',
			'{"format":"keyv-fs","kind":"entry","version":2,"k":"a","t":"s"}',
			'{"format":"keyv-fs","kind":"entry","version":1,"k":1,"t":"s"}',
			'{"format":"keyv-fs","kind":"entry","version":1,"k":"a","n":1,"t":"s"}',
			'{"format":"keyv-fs","kind":"entry","version":1,"k":"a","e":"1","t":"s"}',
			'{"format":"keyv-fs","kind":"entry","version":1,"k":"a","t":"x"}',
		];
		for (const line of invalid) {
			expect(parseEntryHeader(line), line).toBeUndefined();
		}
	});
});
