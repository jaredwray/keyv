import { compressionTestSuite } from "@keyv/test-suite";
import { Keyv } from "keyv";
import { describe, it } from "vitest";
import KeyvGzip from "../src/index.js";

compressionTestSuite(it, new KeyvGzip());

it("object type compression/decompression", async (t) => {
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

it("compress returns a base64 string", async (t) => {
	const keyv = new KeyvGzip();
	const compressed = await keyv.compress("whatever");
	t.expect(typeof compressed).toBe("string");
	t.expect(compressed).not.toBe("whatever");
});

it("options at class level", async (t) => {
	const keyv = new KeyvGzip({ chunkSize: 32 * 1024 });
	const compressed = await keyv.compress("whatever");
	t.expect(typeof compressed).toBe("string");
	t.expect(compressed).not.toBe("whatever");
	const decompressed = await keyv.decompress(compressed);
	t.expect(decompressed).toBe("whatever");
});

it("decompress should not throw error when empty with gzip", async (t) => {
	const keyv = new Keyv({ store: new Map(), compression: new KeyvGzip() });
	await t.expect(keyv.get("foo")).resolves.not.toThrowError();
});

it("should not throw error when empty", async (t) => {
	const keyv = new Keyv({ store: new Map() });
	await t.expect(keyv.get("foo")).resolves.not.toThrowError();
});

describe("values written by Keyv v5", () => {
	// Written by keyv@5.6.0 with @keyv/compress-gzip@2.0.3, exactly as they reached the store. v5
	// stored the deflated bytes as an object keyed by index.
	const text =
		'{"value":{"0":120,"1":156,"2":203,"3":72,"4":205,"5":201,"6":201,"7":87,"8":40,"9":207,"10":47,"11":202,"12":73,"13":1,"14":0,"15":26,"16":11,"17":4,"18":93}}';
	const colon =
		'{"value":{"0":120,"1":156,"2":179,"3":74,"4":206,"5":207,"6":201,"7":207,"8":3,"9":0,"10":7,"11":157,"12":2,"13":86}}';
	const unicode =
		'{"value":{"0":120,"1":156,"2":203,"3":56,"4":188,"5":50,"6":39,"7":39,"8":95,"9":161,"10":252,"11":240,"12":182,"13":162,"14":156,"15":20,"16":133,"17":71,"18":115,"19":38,"20":3,"21":0,"22":76,"23":196,"24":8,"25":159}}';

	it("reads them through Keyv", async (t) => {
		const keyv = new Keyv({ compression: new KeyvGzip() });
		await keyv.store.set("text", text);
		await keyv.store.set("colon", colon);
		await keyv.store.set("unicode", unicode);

		t.expect(await keyv.get("text")).toBe("hello world");
		t.expect(await keyv.get("colon")).toBe(":colon");
		t.expect(await keyv.get("unicode")).toBe("héllo wörld ✓");
	});

	it("keeps the expiry v5 stored", async (t) => {
		// v5 kept the absolute expiry next to the compressed value.
		const withExpiry = (expires: number) => `${text.slice(0, -1)},"expires":${expires}}`;
		const keyv = new Keyv({ compression: new KeyvGzip() });
		const expires = Date.now() + 60_000;
		await keyv.store.set("live", withExpiry(expires));
		await keyv.store.set("expired", withExpiry(Date.now() - 1000));

		t.expect(await keyv.getRaw("live")).toEqual({ value: "hello world", expires });
		t.expect(await keyv.get("expired")).toBeUndefined();
	});

	it("rejects a JSON envelope that holds no v5 gzip value", async (t) => {
		const gzip = new KeyvGzip();
		await t.expect(gzip.decompress('{"value":null}')).rejects.toThrow("Unrecognized");
		await t.expect(gzip.decompress('{"value":"plain"}')).rejects.toThrow("Unrecognized");
	});
});
