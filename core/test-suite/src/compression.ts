import { faker } from "@faker-js/faker";
import Keyv, { type KeyvCompressionAdapter } from "keyv";
import type { TestFunction } from "./types.js";

/**
 * Registers compression adapter compliance tests: compress/decompress round-trips
 * with arrays, strings, numbers, and integration with a Keyv instance.
 * @param test - The test registration function (e.g. vitest `it`)
 * @param compression - The compression adapter instance to test
 */
const compressionTestSuite = (test: TestFunction, compression: KeyvCompressionAdapter) => {
	test("number array compression/decompression", async (t) => {
		const array = JSON.stringify([4, 5, 6, 7]);
		const compressed = await compression.compress(array);
		const decompressed = JSON.parse(await compression.decompress(compressed));
		t.expect(decompressed).toEqual([4, 5, 6, 7]);
	});

	test("compression/decompression using default options", async (t) => {
		const value = faker.lorem.word();
		const compressed = await compression.compress(value);
		t.expect(compressed).not.toBe(value);
		const decompressed = await compression.decompress(compressed);
		t.expect(decompressed).toBe(value);
	});

	test("compression/decompression with number", async (t) => {
		const number_ = JSON.stringify(5);
		const compressed = await compression.compress(number_);
		t.expect(compressed).not.toBe(5);
		const decompressed = JSON.parse(await compression.decompress(compressed));
		t.expect(decompressed).toBe(5);
	});

	test("compress/decompress with main keyv", async (t) => {
		const keyv = new Keyv({ compression });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await keyv.set(key, value);
		t.expect(await keyv.get(key)).toBe(value);
	});
};

export { compressionTestSuite };
