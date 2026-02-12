import v8 from "node:v8";
import { constants as zlibConstants } from "node:zlib";
import { keyvCompresstionTests } from "@keyv/test-suite";
import * as test from "vitest";
import KeyvBrotli from "../src/index.js";
import type { DeserializeResult } from "../src/types.js";

const { BROTLI_PARAM_MODE, BROTLI_PARAM_QUALITY } = zlibConstants;

// @ts-expect-error - KeyvBrotli type
keyvCompresstionTests(test, new KeyvBrotli());

test.it("object type compression/decompression", async (t) => {
	const keyv = new KeyvBrotli();
	const object = {
		a: 1,
		b: "test",
		c: true,
	};
	const compressed = await keyv.compress(object);
	const decompressed = await keyv.decompress(compressed);
	t.expect(decompressed).toEqual(object);
});

test.it("disable brotli compression", async (t) => {
	const options = {
		enable: false,
	};
	const keyv = new KeyvBrotli(options);
	const compressed = await keyv.compress("whatever");
	t.expect(compressed).toBe("whatever");
	const decompressed: DeserializeResult = await keyv.decompress(compressed);
	t.expect(decompressed).toBe("whatever");
});

test.it("compression with compression options", async (t) => {
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
	const keyvWithoutOptions = new KeyvBrotli();
	const compressed = await keyv.compress("whatever");
	const compressedWithoutOptions =
		await keyvWithoutOptions.compress("whatever");
	t.expect(compressed).not.toBe(compressedWithoutOptions);
});

test.it("decompression with decompression options", async (t) => {
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

test.it(
	"compression/decompression with compression/decompression options",
	async (t) => {
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
	},
);

test.it("decompression using number array with v8", async (t) => {
	const options = {
		serialize: v8.serialize,
		deserialize: v8.deserialize,
	};

	const keyv = new KeyvBrotli(options);
	const compressed = await keyv.compress({ help: [1, 2, 4] });
	const decompressed = await keyv.decompress(compressed);
	t.expect(decompressed).toEqual({ help: [1, 2, 4] });
});

test.it(
	"decompress should not throw error when empty with brotli",
	async (t) => {
		const keyv = new KeyvBrotli();
		await t.expect(keyv.decompress()).resolves.not.toThrowError();
	},
);

test.it("should return empty object when empty", async (t) => {
	const keyv = new KeyvBrotli();
	const result = await keyv.deserialize();
	t.expect(result).toEqual({ value: undefined, expires: undefined });
});
