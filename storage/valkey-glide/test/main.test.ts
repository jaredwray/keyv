import process from "node:process";
import { faker } from "@faker-js/faker";
import { GlideClient } from "@valkey/valkey-glide";
import { describe, expect, test } from "vitest";
import KeyvValkeyGlide, {
	createKeyv,
	KeyvValkeyGlide as NamedKeyvValkeyGlide,
} from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

describe("KeyvValkeyGlide", () => {
	test("should be a class", () => {
		expect(KeyvValkeyGlide).toBeInstanceOf(Function);
	});

	test("should be available as a named export", () => {
		expect(NamedKeyvValkeyGlide).toBe(KeyvValkeyGlide);
	});

	test("should declare expires capability", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		expect(store.capabilities.expires).toBe(true);
		await store.disconnect();
	});

	test("should expose the client instance after connect", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const client = await store.getClient();
		expect(client).toBeInstanceOf(GlideClient);
		expect(store.client).toBe(client);
		await store.disconnect();
	});

	test("should throw when reading client before connect", () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		expect(() => store.client).toThrow(/getClient/);
	});

	test("should reuse an existing glide client", async () => {
		const client = await GlideClient.createClient({
			addresses: [{ host: "localhost", port: 6370 }],
		});
		const store = new KeyvValkeyGlide(client);
		expect(store.client).toBe(client);

		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);
		expect(await store.get(key)).toBe(value);
		await store.disconnect();
	});

	test("should apply useSets from options when passing in a client", async () => {
		const client = await GlideClient.createClient({
			addresses: [{ host: "localhost", port: 6370 }],
		});
		const store = new KeyvValkeyGlide(client, { useSets: true });
		expect(store.useSets).toBe(true);
		await store.disconnect();
	});

	test("should default useSets to false", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		expect(store.useSets).toBe(false);
		await store.disconnect();
	});

	test("should get and set useSets via the setter", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		store.useSets = true;
		expect(store.useSets).toBe(true);
		await store.disconnect();
	});

	test("should replace the client via the setter", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const previous = await store.getClient();
		const newClient = await GlideClient.createClient({
			addresses: [{ host: "localhost", port: 6370 }],
		});
		store.client = newClient;
		expect(store.client).toBe(newClient);
		previous.close();
		await store.disconnect();
	});

	test("should close the connection on disconnect", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const key = faker.string.alphanumeric(10);
		expect(await store.get(key)).toBe(undefined);
		await store.disconnect();
		await expect(store.get(key)).rejects.toThrow();
	});

	test("should parse a uri into glide addresses", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);
		expect(await store.get(key)).toBe(value);
		await store.disconnect();
	});
});

describe("createKeyv", () => {
	test("should create a Keyv instance from a uri", async () => {
		const keyv = createKeyv(valkeyUri);
		expect(keyv).toBeTruthy();
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
		await keyv.disconnect();
	});

	test("should propagate the namespace option to the store", async () => {
		const namespace = faker.string.alphanumeric(8);
		const keyv = createKeyv(valkeyUri, { namespace });
		expect(keyv.namespace).toBe(namespace);
		expect(keyv.store.namespace).toBe(namespace);
		await keyv.disconnect();
	});

	test("should preserve the namespace from the connect options object", async () => {
		const namespace = faker.string.alphanumeric(8);
		const keyv = createKeyv({ uri: valkeyUri, namespace });
		expect(keyv.namespace).toBe(namespace);
		expect(keyv.store.namespace).toBe(namespace);

		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		const client = await GlideClient.createClient({
			addresses: [{ host: "localhost", port: 6370 }],
		});
		expect(await client.exists([`namespace:${namespace}:${key}`])).toBe(1);
		expect(await client.exists([key])).toBe(0);
		client.close();

		await keyv.clear();
		await keyv.disconnect();
	});
});
