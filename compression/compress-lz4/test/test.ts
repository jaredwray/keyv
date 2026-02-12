import { keyvCompresstionTests } from "@keyv/test-suite";
import { Keyv } from "keyv";
import * as test from "vitest";
import KeyvLz4 from "../src/index.js";

// @ts-expect-error - KeyvLz4 type
keyvCompresstionTests(test, new KeyvLz4());

test.it("object type compression/decompression", async (t) => {
	const keyv = new KeyvLz4();
	const value = JSON.stringify({
		a: 1,
		b: "test",
		c: true,
	});
	const compressed = await keyv.compress(value);
	const decompressed = await keyv.decompress(compressed);
	t.expect(decompressed).toEqual(value);
});

test.it("compression with options", async (t) => {
	const keyv = new KeyvLz4("test");
	const keyvWithoutOptions = new KeyvLz4();
	const compressed = await keyv.compress("whatever");
	const compressedWithoutOptions =
		await keyvWithoutOptions.compress("whatever");
	t.expect(compressed).not.toBe(compressedWithoutOptions);
});

test.it("decompress should not throw error when empty with gzip", async (t) => {
	const keyv = new Keyv({ store: new Map(), compression: new KeyvLz4() });
	await t.expect(keyv.get("foo")).resolves.not.toThrowError();
});

test.it("should not throw error when empty", async (t) => {
	const keyv = new Keyv({ store: new Map() });
	await t.expect(keyv.get("foo")).resolves.not.toThrowError();
});
