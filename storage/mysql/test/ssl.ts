import fs from "node:fs";
import path from "node:path";
import { faker } from "@faker-js/faker";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import KeyvMysqlAdapter, { type KeyvMysqlOptions } from "../src/index.js";

const uri = "mysql://root@localhost:3307/keyv_test";
const mysqlAdapters = new Set<KeyvMysqlAdapter>();

class KeyvMysql extends KeyvMysqlAdapter {
	constructor(options?: KeyvMysqlOptions | string) {
		super(options);
		mysqlAdapters.add(this);
	}
}

const options = {
	ssl: {
		rejectUnauthorized: false,
		ca: fs.readFileSync(path.join(__dirname, "/certs/ca.pem")).toString(),
		key: fs.readFileSync(path.join(__dirname, "/certs/client-key.pem")).toString(),
		cert: fs.readFileSync(path.join(__dirname, "/certs/client-cert.pem")).toString(),
	},
};

beforeEach(async () => {
	const keyv = new KeyvMysql({ uri, ...options });
	await keyv.clear();
});

afterEach(async () => {
	const adapters = [...mysqlAdapters];
	mysqlAdapters.clear();
	await Promise.all(adapters.map(async (adapter) => adapter.disconnect()));
});

describe("ssl", () => {
	test("rejects when ssl is required but not provided", async () => {
		const keyv = new KeyvMysql({ uri });
		await expect(keyv.get(faker.string.alphanumeric(10))).rejects.toThrow();
	});

	test("sets and gets a value over an ssl connection", async () => {
		const keyv = new KeyvMysql({ uri, ...options });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
	});
});
