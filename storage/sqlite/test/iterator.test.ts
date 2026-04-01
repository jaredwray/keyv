import { faker } from "@faker-js/faker";
import Keyv from "keyv";
import { it } from "vitest";
import KeyvSqlite from "../src/index.js";

it("Async Iterator with Keyv", async (t) => {
	const store = new KeyvSqlite({
		uri: "sqlite://test/testdb2.sqlite",
		busyTimeout: 3000,
	});
	const keyv = new Keyv({ store });
	await keyv.clear();
	// Test with Keyv instance
	const keyvData = {
		key: faker.string.alphanumeric(10),
		value: faker.string.alphanumeric(10),
	};
	await keyv.set(keyvData.key, keyvData.value);
	const keyvResult = await keyv.get(keyvData.key);
	t.expect(keyvResult).toBe(keyvData.value);
	// Ensure the Keyv instance can still use the iterator
	t.expect(keyv.iterator).toBeDefined();
	if (typeof keyv.iterator === "function") {
		const keyvIterator = keyv.iterator();
		let keyvDataFound = false;
		for await (const [key, raw] of keyvIterator) {
			t.expect(key).toBe(keyvData.key);
			t.expect(raw).toBe(keyvData.value);
			keyvDataFound = true;
		}

		if (!keyvDataFound) {
			t.expect.fail("Keyv iterator did not find the expected data");
		}
	} else {
		t.expect.fail("Keyv iterator is not a function");
	}
});

it("Async Iterator with Keyv and no namespace", async (t) => {
	const store = new KeyvSqlite({
		uri: "sqlite://test/testdb2.sqlite",
		busyTimeout: 3000,
	});
	const keyv = new Keyv({ store });
	keyv.namespace = undefined;
	await keyv.clear();
	// Test with Keyv instance
	const keyvData = {
		key: faker.string.alphanumeric(10),
		value: faker.string.alphanumeric(10),
	};
	await keyv.set(keyvData.key, keyvData.value);
	const keyvResult = await keyv.get(keyvData.key);
	t.expect(keyvResult).toBe(keyvData.value);
	// Ensure the Keyv instance can still use the iterator
	t.expect(keyv.iterator).toBeDefined();
	if (typeof keyv.iterator === "function") {
		const keyvIterator = keyv.iterator();
		let keyvDataFound = false;
		for await (const [key, raw] of keyvIterator) {
			t.expect(key).toBe(keyvData.key);
			t.expect(raw).toBe(keyvData.value);
			keyvDataFound = true;
		}

		if (!keyvDataFound) {
			t.expect.fail("Keyv iterator did not find the expected data");
		}
	} else {
		t.expect.fail("Keyv iterator is not a function");
	}
});
