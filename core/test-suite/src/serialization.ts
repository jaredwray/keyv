import { faker } from "@faker-js/faker";
import Keyv, { type KeyvSerializationAdapter } from "keyv";
import type { TestFunction } from "./types.js";

/**
 * Registers serialization adapter compliance tests: stringify/parse round-trips
 * for strings, numbers, booleans, null, undefined, objects, arrays, and nested arrays.
 * Also tests integration with a Keyv instance.
 * @param test - The test registration function (e.g. vitest `it`)
 * @param serialization - The serialization adapter instance to test
 */
const serializationTestSuite = (test: TestFunction, serialization: KeyvSerializationAdapter) => {
	test("stringify and parse of string value", async (t) => {
		const value = faker.lorem.word();
		const serialized = await serialization.stringify({ value });
		const deserialized = await serialization.parse<{ value: string }>(serialized);
		t.expect(deserialized.value).toBe(value);
	});

	test("stringify and parse of number value", async (t) => {
		const serialized = await serialization.stringify({ value: 5 });
		const deserialized = await serialization.parse<{ value: number }>(serialized);
		t.expect(deserialized.value).toBe(5);
	});

	test("stringify and parse of boolean value", async (t) => {
		const serialized = await serialization.stringify({ value: true });
		const deserialized = await serialization.parse<{ value: boolean }>(serialized);
		t.expect(deserialized.value).toBe(true);
	});

	test("stringify and parse of null value", async (t) => {
		const serialized = await serialization.stringify({ value: null });
		const deserialized = await serialization.parse<{ value: null }>(serialized);
		t.expect(deserialized.value).toBeNull();
	});

	test("stringify and parse of undefined value", async (t) => {
		const serialized = await serialization.stringify({ value: undefined });
		const deserialized = await serialization.parse<{ value: undefined }>(serialized);
		t.expect(deserialized.value).toBeUndefined();
	});

	test("stringify and parse of object value", async (t) => {
		const original = {
			key: faker.lorem.word(),
			count: faker.number.int(100),
			active: faker.datatype.boolean(),
		};
		const serialized = await serialization.stringify({ value: original });
		const deserialized = await serialization.parse<{ value: typeof original }>(serialized);
		t.expect(deserialized.value).toEqual(original);
	});

	test("stringify and parse of array value", async (t) => {
		const serialized = await serialization.stringify([1, "hello", true, null]);
		const deserialized = await serialization.parse<unknown[]>(serialized);
		t.expect(deserialized).toEqual([1, "hello", true, null]);
	});

	test("stringify and parse of nested arrays", async (t) => {
		const serialized = await serialization.stringify({
			value: [
				[1, 2],
				[3, 4],
			],
		});
		const deserialized = await serialization.parse<{ value: number[][] }>(serialized);
		t.expect(deserialized.value).toEqual([
			[1, 2],
			[3, 4],
		]);
	});

	test("stringify/parse with main keyv", async (t) => {
		const keyv = new Keyv({ serialization });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await keyv.set(key, value);
		t.expect(await keyv.get(key)).toBe(value);
	});
};

export { serializationTestSuite };
