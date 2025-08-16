import Keyv, { type CompressionAdapter, type KeyvStoreAdapter } from "keyv";
import type * as Vitest from "vitest";

const keyvCompressionTests = (
	test: typeof Vitest,
	compression: CompressionAdapter,
) => {
	// biome-ignore lint/suspicious/noImplicitAnyLet: test file
	let keyv;
	test.beforeEach(async () => {
		keyv = new Keyv({
			store: new Map() as unknown as KeyvStoreAdapter,
			compression,
		});
		await keyv.clear();
	});

	test.it("number array compression/decompression", async (t) => {
		const array = JSON.stringify([4, 5, 6, 7]);
		const compressed = await compression.compress(array);
		const decompressed = JSON.parse(await compression.decompress(compressed));
		t.expect(decompressed).toEqual([4, 5, 6, 7]);
	});

	test.it("compression/decompression using default options", async (t) => {
		const compressed = await compression.compress("whatever");
		t.expect(compressed).not.toBe("whatever");
		const decompressed = await compression.decompress(compressed);
		t.expect(decompressed).toBe("whatever");
	});

	test.it("compression/decompression with number", async (t) => {
		const number_ = JSON.stringify(5);
		const compressed = await compression.compress(number_);
		t.expect(compressed).not.toBe(5);
		const decompressed = JSON.parse(await compression.decompress(compressed));
		t.expect(decompressed).toBe(5);
	});

	// Test serialize compression
	test.it("serialize compression", async (t) => {
		const json = await compression.serialize({
			value: "whatever",
			expires: undefined,
		});
		t.expect(JSON.parse(json).value).not.toBe("whatever");
	});

	// Test deserialize compression
	test.it("deserialize compression", async (t) => {
		const json = await compression.serialize({
			value: "whatever",
			expires: undefined,
		});
		const djson = await compression.deserialize(json);
		t.expect(djson).toEqual({ expires: undefined, value: "whatever" });
	});

	test.it("compress/decompress with main keyv", async (t) => {
		const keyv = new Keyv({ compression });
		await keyv.set("foo", "bar");
		t.expect(await keyv.get("foo")).toBe("bar");
	});
};

export default keyvCompressionTests;
