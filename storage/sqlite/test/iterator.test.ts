import { faker } from "@faker-js/faker";
import Keyv from "keyv";
import { describe, expect, test } from "vitest";
import KeyvSqlite from "../src/index.js";

const sqliteUri = "sqlite://test/testdb2.sqlite";

describe("iterator with Keyv", () => {
	test("iterates over values set through a Keyv instance", async () => {
		const store = new KeyvSqlite({ uri: sqliteUri, busyTimeout: 3000 });
		const keyv = new Keyv({ store });
		await keyv.clear();
		const keyvData = {
			key: faker.string.alphanumeric(10),
			value: faker.string.alphanumeric(10),
		};
		await keyv.set(keyvData.key, keyvData.value);
		expect(await keyv.get(keyvData.key)).toBe(keyvData.value);
		expect(typeof keyv.iterator).toBe("function");

		let keyvDataFound = false;
		for await (const [key, value] of keyv.iterator()) {
			expect(key).toBe(keyvData.key);
			expect(value).toBe(keyvData.value);
			keyvDataFound = true;
		}

		expect(keyvDataFound).toBe(true);
	});

	test("iterates when the Keyv namespace is undefined", async () => {
		const store = new KeyvSqlite({ uri: sqliteUri, busyTimeout: 3000 });
		const keyv = new Keyv({ store });
		keyv.namespace = undefined;
		await keyv.clear();
		const keyvData = {
			key: faker.string.alphanumeric(10),
			value: faker.string.alphanumeric(10),
		};
		await keyv.set(keyvData.key, keyvData.value);
		expect(await keyv.get(keyvData.key)).toBe(keyvData.value);
		expect(typeof keyv.iterator).toBe("function");

		let keyvDataFound = false;
		for await (const [key, value] of keyv.iterator()) {
			expect(key).toBe(keyvData.key);
			expect(value).toBe(keyvData.value);
			keyvDataFound = true;
		}

		expect(keyvDataFound).toBe(true);
	});
});
