import { keyvCompressionTests } from "@keyv/test-suite";
import { Keyv } from "keyv";
import { it } from "vitest";
import KeyvLz4 from "../src/index.js";

keyvCompressionTests(it, new KeyvLz4());

it("object type compression/decompression", async (t) => {
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

it("compression with dictionary option", async (t) => {
	const keyv = new KeyvLz4("test");
	const compressed = await keyv.compress("whatever");
	t.expect(typeof compressed).toBe("string");
	t.expect(compressed).not.toBe("whatever");
	const decompressed = await keyv.decompress(compressed);
	t.expect(decompressed).toBe("whatever");
});

it("decompress should not throw error when empty with lz4", async (t) => {
	const keyv = new Keyv({ store: new Map(), compression: new KeyvLz4() });
	await t.expect(keyv.get("foo")).resolves.not.toThrowError();
});

it("should not throw error when empty", async (t) => {
	const keyv = new Keyv({ store: new Map() });
	await t.expect(keyv.get("foo")).resolves.not.toThrowError();
});
