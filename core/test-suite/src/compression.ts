import { faker } from "@faker-js/faker";
import Keyv, { type KeyvCompressionAdapter } from "keyv";
import type { TestFunction } from "./types.js";

const compressionTestSuite = (test: TestFunction, compression: KeyvCompressionAdapter) => {
	test("number array compression/decompression", async (t) => {
		const array = JSON.stringify([4, 5, 6, 7]);
		const compressed = await compression.compress(array);
		const decompressed = JSON.parse(await compression.decompress(compressed));
		t.expect(decompressed).toEqual([4, 5, 6, 7]);
	});

	test("compression/decompression using default options", async (t) => {
		const compressed = await compression.compress("whatever");
		t.expect(compressed).not.toBe("whatever");
		const decompressed = await compression.decompress(compressed);
		t.expect(decompressed).toBe("whatever");
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
