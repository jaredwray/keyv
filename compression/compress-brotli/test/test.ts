import { constants as zlibConstants } from "node:zlib";
import { keyvCompressionTests } from "@keyv/test-suite";
import * as test from "vitest";
import KeyvBrotli from "../src/index.js";

const { BROTLI_PARAM_MODE, BROTLI_PARAM_QUALITY } = zlibConstants;

keyvCompressionTests(test, new KeyvBrotli());

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
	const compressed = await keyv.compress("whatever");
	t.expect(typeof compressed).toBe("string");
	t.expect(compressed).not.toBe("whatever");
	const decompressed = await keyv.decompress(compressed);
	t.expect(decompressed).toBe("whatever");
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
