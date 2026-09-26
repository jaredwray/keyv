import process from "node:process";
import { faker } from "@faker-js/faker";
import { delay } from "@keyv/test-suite";
import { Decoder, GlideClient } from "@valkey/valkey-glide";
import { afterEach, describe, expect, test, vi } from "vitest";
import KeyvValkeyGlide from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("set", () => {
	test("should set and return a stored value", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		expect(await store.set(key, value)).toBe(true);
		expect(await store.get(key)).toBe(value);
		await store.disconnect();
	});

	test("should return false when setting an undefined value", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const key = faker.string.alphanumeric(10);
		expect(await store.set(key, undefined)).toBe(false);
		expect(await store.get(key)).toBeUndefined();
		await store.disconnect();
	});

	test("should expire a value after its expiry", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value, Date.now() + 100);
		expect(await store.get(key)).toBe(value);
		await delay(200);
		expect(await store.get(key)).toBeUndefined();
		await store.disconnect();
	});

	test("should store binary values without mangling invalid UTF-8 bytes", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const key = faker.string.alphanumeric(10);
		const bytes = Buffer.from([0xff, 0xfe, 0xfd, 0x00, 0x01]);
		await store.set(key, bytes);

		const rawClient = await GlideClient.createClient({
			addresses: [{ host: "localhost", port: 6370 }],
			defaultDecoder: Decoder.Bytes,
		});
		const stored = await rawClient.get(key);
		expect(Buffer.isBuffer(stored)).toBe(true);
		expect(stored).toEqual(bytes);
		rawClient.close();
		await store.disconnect();
	});

	test("should stringify non-string, non-buffer values", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const key = faker.string.alphanumeric(10);
		await store.set(key, 12345);
		expect(await store.get(key)).toBe("12345");
		await store.disconnect();
	});

	test("should decode Buffer responses from GLIDE back into strings", async () => {
		const store = new KeyvValkeyGlide({ uri: valkeyUri, defaultDecoder: Decoder.Bytes });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);
		expect(await store.get(key)).toBe(value);
		await store.disconnect();
	});
});

describe("setMany", () => {
	test("should set multiple values", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		await store.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
		]);
		expect(await store.getMany([key1, key2])).toEqual([val1, val2]);
		await store.disconnect();
	});

	test("should expire values with an expiry", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.setMany([{ key, value, expires: Date.now() + 100 }]);
		expect(await store.get(key)).toBe(value);
		await delay(200);
		expect(await store.get(key)).toBeUndefined();
		await store.disconnect();
	});

	test("should not error on an empty array", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		expect(await store.setMany([])).toEqual([]);
		await store.disconnect();
	});

	test("should skip undefined values", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		await store.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: undefined },
		]);
		expect(await store.get(key1)).toBe(val1);
		expect(await store.get(key2)).toBeUndefined();
		await store.disconnect();
	});

	test("should return false for every entry without a batch call when all values are undefined", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const client = await store.getClient();
		const execSpy = vi.spyOn(client, "exec");
		expect(
			await store.setMany([
				{ key: faker.string.alphanumeric(10), value: undefined },
				{ key: faker.string.alphanumeric(10), value: undefined },
			]),
		).toEqual([false, false]);
		expect(execSpy).not.toHaveBeenCalled();
		await store.disconnect();
	});

	test("should track keys in the tracking set when useSets is true", async () => {
		const store = new KeyvValkeyGlide(valkeyUri, {
			useSets: true,
			namespace: faker.string.alphanumeric(8),
		});
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		expect(
			await store.setMany([
				{ key: key1, value: val1 },
				{ key: key2, value: val2 },
			]),
		).toEqual([true, true]);
		expect(await store.getMany([key1, key2])).toEqual([val1, val2]);
		await store.clear();
		expect(await store.get(key1)).toBeUndefined();
		await store.disconnect();
	});

	test("should return false for every entry and emit once when the batch exec fails", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const client = await store.getClient();
		const originalExec = client.exec.bind(client);
		client.exec = async () => {
			throw new Error(faker.lorem.sentence());
		};

		const errors: unknown[] = [];
		store.on("error", (error) => errors.push(error));
		expect(
			await store.setMany([
				{ key: faker.string.alphanumeric(10), value: faker.string.alphanumeric(10) },
				{ key: faker.string.alphanumeric(10), value: faker.string.alphanumeric(10) },
			]),
		).toEqual([false, false]);
		expect(errors).toHaveLength(1);
		client.exec = originalExec;
		await store.disconnect();
	});
});
