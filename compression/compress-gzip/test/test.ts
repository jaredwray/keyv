import { keyvCompresstionTests } from "@keyv/test-suite";
import { Keyv } from "keyv";
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

test.it("compress returns a base64 string", async (t) => {
	const keyv = new KeyvGzip();
	const compressed = await keyv.compress("whatever");
	t.expect(typeof compressed).toBe("string");
	t.expect(compressed).not.toBe("whatever");
});

test.it("options at class level", async (t) => {
	const keyv = new KeyvGzip({ chunkSize: 32 * 1024 });
	const compressed = await keyv.compress("whatever");
	t.expect(typeof compressed).toBe("string");
	t.expect(compressed).not.toBe("whatever");
	const decompressed = await keyv.decompress(compressed);
	t.expect(decompressed).toBe("whatever");
});

test.it("compression with compression options", async (t) => {
	const keyv = new KeyvGzip();
	const compressed = await keyv.compress("whatever");
	const decompressed = await keyv.decompress(compressed);
	t.expect(decompressed).toBe("whatever");
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
