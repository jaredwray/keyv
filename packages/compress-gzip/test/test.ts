import { Buffer } from "node:buffer";
import { keyvCompresstionTests } from "@keyv/test-suite";
import { Keyv } from "keyv";
import { deflate } from "pako";
import * as test from "vitest";
import KeyvGzip from "../src/index.js";

// @ts-expect-error - KeyvGzip type
keyvCompresstionTests(test, new KeyvGzip());

test.it("object type compression/decompression", async (t) => {
	const keyv = new KeyvGzip();
	const testValue = JSON.stringify({
		my: "super",
		puper: [456, 567],
		awesome: "pako",
	});
	const compressed = await keyv.compress(testValue);
	const decompressed = await keyv.decompress(compressed);
	t.expect(decompressed).toEqual(testValue);
});

// Test options while compress
test.it("options while compress", async (t) => {
	const keyv = new KeyvGzip();
	const compressed = await keyv.compress("whatever");
	t.expect(compressed).not.toBe("whatever");
	const compressedWithoutOptions = await keyv.compress("whatever");
	t.expect(compressed).not.toBe(compressedWithoutOptions);
});
// Test options at class level
test.it("options at class level", async (t) => {
	const keyv = new KeyvGzip({ chunkSize: 32 * 1024 });
	const compressed = await keyv.compress("whatever");
	t.expect(compressed).not.toBe("whatever");
	const compressedWithoutOptions = await new KeyvGzip().compress("whatever");
	t.expect(compressed).not.toBe(compressedWithoutOptions);
});

test.it("compression with compression options", async (t) => {
	const options = {};

	const keyv = new KeyvGzip(options);
	const keyvWithoutOptions = new KeyvGzip();
	const compressed = await keyv.compress("whatever");
	const compressedWithoutOptions =
		await keyvWithoutOptions.compress("whatever");
	t.expect(compressed).not.toBe(compressedWithoutOptions);
});

test.it("decompression with decompression options", async (t) => {
	const options = {};

	const keyv = new KeyvGzip(options);
	const compressed = await keyv.compress("whatever");
	const decompressed = await keyv.decompress(compressed, options);
	t.expect(decompressed).toBe("whatever");
});

test.it("decompress should not throw error when empty with gzip", async (t) => {
	const keyv = new Keyv({ store: new Map(), compression: new KeyvGzip() });
	await t.expect(keyv.get("foo")).resolves.not.toThrowError();
});

test.it("should not throw error when empty", async (t) => {
	const keyv = new Keyv({ store: new Map() });
	await t.expect(keyv.get("foo")).resolves.not.toThrowError();
});

// https://github.com/jaredwray/keyv/issues/2007
test.it(
	"compress returns a Buffer so compressed data serializes to base64",
	async (t) => {
		const gzip = new KeyvGzip();
		const compressed = await gzip.compress("whatever");
		t.expect(Buffer.isBuffer(compressed)).toBe(true);
	},
);

// https://github.com/jaredwray/keyv/issues/2007
test.it(
	"stores compressed values as base64 strings, not byte objects",
	async (t) => {
		const map = new Map();
		const keyv = new Keyv({ store: map, compression: new KeyvGzip() });
		await keyv.set("foo", "we are doing things");

		const stored = map.get("keyv:foo") as string;
		t.expect(stored).toContain(":base64:");
		t.expect(stored).not.toMatch(/"0":\d+,"1":\d+/);
		t.expect(await keyv.get("foo")).toBe("we are doing things");
	},
);

// Data written before the base64 fix was stored as an index-keyed byte
// object. Reading it back must keep working.
test.it("decompresses legacy index-keyed byte object data", async (t) => {
	const legacyCompressed = deflate("legacy value");
	const legacyJson = JSON.stringify({
		value: { ...legacyCompressed },
		expires: null,
	});

	const gzip = new KeyvGzip();
	const { value } = await gzip.deserialize(legacyJson);
	t.expect(value).toBe("legacy value");
});
