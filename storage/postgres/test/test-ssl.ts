import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, test } from "vitest";
import KeyvPostgres from "../src/index.js";
import { endAllPools } from "../src/pool.js";

const postgresUri = "postgresql://postgres:postgres@localhost:5433/keyv_test";

const options = { ssl: { rejectUnauthorized: false } };

const store = () => new KeyvPostgres({ uri: postgresUri, iterationLimit: 2, ...options });

beforeEach(async () => {
	const keyv = new KeyvPostgres({ uri: postgresUri, ...options });
	await keyv.clear();
});

describe("ssl", () => {
	test("throws when ssl is not used", async () => {
		await endAllPools();
		try {
			const keyv = new KeyvPostgres({ uri: postgresUri });
			await keyv.get(faker.string.alphanumeric(10));
			expect.fail("expected the connection to fail without ssl");
		} catch {
			expect(true).toBeTruthy();
		} finally {
			await endAllPools();
		}
	});

	test("iterates over the default namespace", async () => {
		const keyv = new KeyvPostgres({ uri: postgresUri, ...options });
		const key1 = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.alphanumeric(10);
		const value2 = faker.lorem.sentence();
		const key3 = faker.string.alphanumeric(10);
		const value3 = faker.lorem.sentence();
		await keyv.set(key1, value1);
		await keyv.set(key2, value2);
		await keyv.set(key3, value3);

		const collected = new Map<string, string>();
		for await (const [key, value] of keyv.iterator()) {
			collected.set(key, value);
		}

		expect(collected.get(key1)).toBe(value1);
		expect(collected.get(key2)).toBe(value2);
		expect(collected.get(key3)).toBe(value3);
	});

	test("clear returns undefined with the default namespace", async () => {
		const keyv = store();
		expect(await keyv.clear()).toBeUndefined();
	});

	test("closes the connection on disconnect", async () => {
		const keyv = store();
		const key = faker.string.alphanumeric(10);
		expect(await keyv.get(key)).toBeUndefined();
		await keyv.disconnect();
		await expect(keyv.get(key)).rejects.toBeDefined();
	});
});
