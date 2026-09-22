import { compressionTestSuite } from "@keyv/test-suite";
import { Keyv } from "keyv";
import { describe, it } from "vitest";
import KeyvLz4 from "../src/index.js";

compressionTestSuite(it, new KeyvLz4());

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

describe("values written by Keyv v5", () => {
	// Written by keyv@5.6.0 with @keyv/compress-lz4@1.0.1, exactly as they reached the store.
	const text = '{"value":":base64:CwAAALBoZWxsbyB3b3JsZA=="}';
	const colon = '{"value":":base64:BgAAAGA6Y29sb24="}';
	const unicode = '{"value":":base64:EQAAAPACaMOpbGxvIHfDtnJsZCDinJM="}';

	it("reads them through Keyv", async (t) => {
		const keyv = new Keyv({ compression: new KeyvLz4() });
		await keyv.store.set("text", text);
		await keyv.store.set("colon", colon);
		await keyv.store.set("unicode", unicode);

		t.expect(await keyv.get("text")).toBe("hello world");
		t.expect(await keyv.get("colon")).toBe(":colon");
		t.expect(await keyv.get("unicode")).toBe("héllo wörld ✓");
	});

	it("keeps the expiry v5 stored", async (t) => {
		// v5 kept the absolute expiry next to the compressed value.
		const withExpiry = (expires: number) =>
			`{"value":":base64:CwAAALBoZWxsbyB3b3JsZA==","expires":${expires}}`;
		const keyv = new Keyv({ compression: new KeyvLz4() });
		const expires = Date.now() + 60_000;
		await keyv.store.set("live", withExpiry(expires));
		await keyv.store.set("expired", withExpiry(Date.now() - 1000));

		t.expect(await keyv.getRaw("live")).toEqual({ value: "hello world", expires });
		t.expect(await keyv.get("expired")).toBeUndefined();
	});

	it("rejects a JSON envelope that holds no v5 lz4 value", async (t) => {
		const lz4 = new KeyvLz4();
		await t.expect(lz4.decompress('{"value":42}')).rejects.toThrow("Unrecognized");
		await t.expect(lz4.decompress('{"value":"plain"}')).rejects.toThrow("Unrecognized");
	});
});
