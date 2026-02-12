import v8 from "node:v8";
import zlib from "node:zlib";
import { Keyv } from "keyv";
import * as test from "vitest";
import KeyvBrotli from "../src/index.js";

type MyType = {
	a?: string;
	b?: number[];
};

test.it("default options", async (t) => {
	const keyv = new Keyv({
		compression: new KeyvBrotli(),
	});

	t.expect(await keyv.set("testkey", { a: "testvalue" })).toBe(true);
	t.expect(await keyv.get<MyType>("testkey")).toEqual({ a: "testvalue" });
});

test.it("compression user defined options", async (t) => {
	const options = {
		compressOptions: {
			chunkSize: 1024,
			parameters: {
				[zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
			},
		},
	};

	const keyv = new Keyv({
		// @ts-expect-error - KeyvBrotli and CompressionAdapter type
		compression: new KeyvBrotli(options),
	});

	t.expect(await keyv.set("testkey", { a: "testvalue" })).toBe(true);
	t.expect(await keyv.get<MyType>("testkey")).toEqual({ a: "testvalue" });
});

test.it("user defined options", async (t) => {
	const options = {
		decompressOptions: {
			chunkSize: 1024,
			parameters: {
				[zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
			},
		},
	};

	const keyv = new Keyv({
		// @ts-expect-error - KeyvBrotli and CompressionAdapter type
		compression: new KeyvBrotli(options),
	});

	t.expect(await keyv.set("testkey", { a: "testvalue" })).toBe(true);
	t.expect(await keyv.get<MyType>("testkey")).toEqual({ a: "testvalue" });
});

test.it("using number array with v8", async (t) => {
	const options = {
		decompressOptions: {
			chunkSize: 1024,
			parameters: {
				[zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
			},
		},
		serialize: v8.serialize,
		deserialize: v8.deserialize,
	};

	const keyv = new Keyv({
		// @ts-expect-error - KeyvBrotli and CompressionAdapter type
		compression: new KeyvBrotli(options),
	});

	t.expect(await keyv.set("testkey", { b: [1, 2, 3] })).toBe(true);
	t.expect(await keyv.get<MyType>("testkey")).toEqual({ b: [1, 2, 3] });
});
