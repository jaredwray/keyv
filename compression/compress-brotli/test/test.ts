import { constants as zlibConstants } from "node:zlib";
import { compressionTestSuite } from "@keyv/test-suite";
import { Keyv } from "keyv";
import { describe, it } from "vitest";
import KeyvBrotli from "../src/index.js";

const { BROTLI_PARAM_MODE, BROTLI_PARAM_QUALITY } = zlibConstants;

compressionTestSuite(it, new KeyvBrotli());

it("compression with compression options", async (t) => {
	const options = {
		compressOptions: {
			chunkSize: 1024,
			parameters: {
				[BROTLI_PARAM_MODE]: 2,
				[BROTLI_PARAM_QUALITY]: 7,
			},
		},
	};

	const keyv = new KeyvBrotli(options);
	const compressed = await keyv.compress("whatever");
	t.expect(typeof compressed).toBe("string");
	t.expect(compressed).not.toBe("whatever");
	const decompressed = await keyv.decompress(compressed);
	t.expect(decompressed).toBe("whatever");
});

it("decompression with decompression options", async (t) => {
	const options = {
		decompressOptions: {
			chunkSize: 1024,
			parameters: {
				[BROTLI_PARAM_MODE]: 2,
			},
		},
	};

	const keyv = new KeyvBrotli(options);
	const compressed = await keyv.compress("whatever");
	const decompressed = await keyv.decompress(compressed);
	t.expect(decompressed).toBe("whatever");
});

it("compression/decompression with compression/decompression options", async (t) => {
	const options = {
		compressOptions: {
			chunkSize: 1024,
			parameters: {
				[BROTLI_PARAM_MODE]: 2,
			},
		},
		decompressOptions: {
			chunkSize: 1024,
			parameters: {
				[BROTLI_PARAM_MODE]: 2,
			},
		},
	};

	const keyv = new KeyvBrotli(options);
	const compressed = await keyv.compress("whatever");
	const decompressed = await keyv.decompress(compressed);
	t.expect(decompressed).toBe("whatever");
});

describe("values written by Keyv v5", () => {
	// Written by keyv@5.6.0 with @keyv/compress-brotli@2.0.5, exactly as they reached the store.
	const text = '{"value":":base64:CwaAImhlbGxvIHdvcmxkIgM="}';
	const colon = '{"value":":base64:CwSAIjo6Y29sb24iAw=="}';
	const object = '{"value":":base64:Cw+AeyJuYW1lIjoiQWRhIiwidGFncyI6WyJhIiwiYiJdfQM="}';
	const buffer = '{"value":":base64:iwaAIjpiYXNlNjQ6Y21GMyID"}';
	// v5 stored an empty envelope for keyv.set(key, undefined).
	const empty = "{}";

	it("reads them through Keyv", async (t) => {
		const keyv = new Keyv({ compression: new KeyvBrotli() });
		await keyv.store.set("text", text);
		await keyv.store.set("colon", colon);
		await keyv.store.set("object", object);
		await keyv.store.set("buffer", buffer);
		await keyv.store.set("empty", empty);

		t.expect(await keyv.get("text")).toBe("hello world");
		t.expect(await keyv.get("colon")).toBe(":colon");
		t.expect(await keyv.get("object")).toEqual({ name: "Ada", tags: ["a", "b"] });
		t.expect(await keyv.get("buffer")).toEqual(Buffer.from("raw"));
		t.expect(await keyv.get("empty")).toBeUndefined();
	});

	it("keeps the expiry v5 stored", async (t) => {
		// v5 kept the absolute expiry next to the compressed value.
		const withExpiry = (expires: number) =>
			`{"value":":base64:CwaAImhlbGxvIHdvcmxkIgM=","expires":${expires}}`;
		const keyv = new Keyv({ compression: new KeyvBrotli() });
		const expires = Date.now() + 60_000;
		await keyv.store.set("live", withExpiry(expires));
		await keyv.store.set("expired", withExpiry(Date.now() - 1000));

		t.expect(await keyv.getRaw("live")).toEqual({ value: "hello world", expires });
		t.expect(await keyv.get("expired")).toBeUndefined();
	});

	it("rejects a JSON envelope that holds no v5 brotli value", async (t) => {
		const brotli = new KeyvBrotli();
		await t.expect(brotli.decompress('{"value":42}')).rejects.toThrow("Unrecognized");
		await t.expect(brotli.decompress('{"value":"plain"}')).rejects.toThrow("Unrecognized");
	});
});
