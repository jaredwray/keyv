import process from "node:process";
import { faker } from "@faker-js/faker";
import { GlideClient, GlideClusterClient } from "@valkey/valkey-glide";
import Keyv from "keyv";
import { afterEach, describe, expect, test, vi } from "vitest";
import KeyvValkeyGlide from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370/1";

/**
 * Captures the config object passed to `GlideClient`/`GlideClusterClient.createClient`
 * without opening a real connection, so URI parsing and option pass-through can be
 * asserted directly.
 */
function captureClientConfig<T extends typeof GlideClient | typeof GlideClusterClient>(client: T) {
	let captured: unknown;
	vi.spyOn(client, "createClient").mockImplementation(async (config) => {
		captured = config;
		throw new Error("intentionally not connecting");
	});
	return () => captured as Record<string, unknown>;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("connection config", () => {
	test("should default to localhost:6379 when no connect value is given", async () => {
		const getConfig = captureClientConfig(GlideClient);
		const store = new KeyvValkeyGlide();
		await store.getClient().catch(() => {});
		expect(getConfig().addresses).toEqual([{ host: "localhost", port: 6379 }]);
	});

	test("should default the port to 6379 when the uri omits it", async () => {
		const getConfig = captureClientConfig(GlideClient);
		const store = new KeyvValkeyGlide("redis://myhost");
		await store.getClient().catch(() => {});
		expect(getConfig().addresses).toEqual([{ host: "myhost", port: 6379 }]);
	});

	test("should parse host, port, and useTLS from a uri", async () => {
		const getConfig = captureClientConfig(GlideClient);
		const store = new KeyvValkeyGlide("rediss://myhost:1234");
		await store.getClient().catch(() => {});
		expect(getConfig().addresses).toEqual([{ host: "myhost", port: 1234 }]);
		expect(getConfig().useTLS).toBe(true);
	});

	test("should parse credentials with username and password", async () => {
		const getConfig = captureClientConfig(GlideClient);
		const store = new KeyvValkeyGlide("redis://user:secret@myhost:1234");
		await store.getClient().catch(() => {});
		expect(getConfig().credentials).toEqual({ username: "user", password: "secret" });
	});

	test("should parse credentials with only a password", async () => {
		const getConfig = captureClientConfig(GlideClient);
		const store = new KeyvValkeyGlide("redis://:secret@myhost:1234");
		await store.getClient().catch(() => {});
		expect(getConfig().credentials).toEqual({ password: "secret" });
	});

	test("should not set credentials when only a username is present", async () => {
		const getConfig = captureClientConfig(GlideClient);
		const store = new KeyvValkeyGlide("redis://user@myhost:1234");
		await store.getClient().catch(() => {});
		expect(getConfig().credentials).toBeUndefined();
	});

	test("should fall back to the raw value when a uri component is not valid percent-encoding", async () => {
		const getConfig = captureClientConfig(GlideClient);
		const store = new KeyvValkeyGlide("redis://user:%E0%A4%A@myhost:1234");
		await store.getClient().catch(() => {});
		expect(getConfig().credentials).toEqual({ username: "user", password: "%E0%A4%A" });
	});

	test("should default the host to localhost when the uri has no authority", async () => {
		const getConfig = captureClientConfig(GlideClient);
		const store = new KeyvValkeyGlide("redis:///2");
		await store.getClient().catch(() => {});
		expect(getConfig().addresses).toEqual([{ host: "localhost", port: 6379 }]);
		expect(getConfig().databaseId).toBe(2);
	});

	test("should parse the database id from the uri path", async () => {
		const getConfig = captureClientConfig(GlideClient);
		const store = new KeyvValkeyGlide("redis://myhost:1234/7");
		await store.getClient().catch(() => {});
		expect(getConfig().databaseId).toBe(7);
	});

	test("should ignore a non-numeric database path segment", async () => {
		const getConfig = captureClientConfig(GlideClient);
		const store = new KeyvValkeyGlide("redis://myhost:1234/not-a-number");
		await store.getClient().catch(() => {});
		expect(getConfig().databaseId).toBeUndefined();
	});

	test("should forward pass-through GLIDE options like readFrom and clientAz", async () => {
		const getConfig = captureClientConfig(GlideClient);
		const store = new KeyvValkeyGlide({
			addresses: [{ host: "myhost", port: 1234 }],
			readFrom: "AZAffinity",
			clientAz: "us-east-1a",
			namespace: faker.string.alphanumeric(8),
			namespaceSeparator: "|",
		});
		await store.getClient().catch(() => {});
		const config = getConfig();
		expect(config.readFrom).toBe("AZAffinity");
		expect(config.clientAz).toBe("us-east-1a");
		expect(config).not.toHaveProperty("cluster");
		expect(config).not.toHaveProperty("useSets");
		expect(config).not.toHaveProperty("namespace");
		expect(config).not.toHaveProperty("namespaceSeparator");
	});

	test("should drop pass-through options explicitly set to undefined", async () => {
		const getConfig = captureClientConfig(GlideClient);
		const store = new KeyvValkeyGlide({
			addresses: [{ host: "myhost", port: 1234 }],
			clientName: undefined,
		});
		await store.getClient().catch(() => {});
		expect(getConfig()).not.toHaveProperty("clientName");
	});

	test("should let an explicit addresses option win over the uri", async () => {
		const getConfig = captureClientConfig(GlideClient);
		const store = new KeyvValkeyGlide({
			uri: "redis://from-uri:9999",
			addresses: [{ host: "override", port: 1 }],
		});
		await store.getClient().catch(() => {});
		expect(getConfig().addresses).toEqual([{ host: "override", port: 1 }]);
	});

	test("should build a cluster client from a {cluster: true, addresses} constructor path", async () => {
		const getConfig = captureClientConfig(GlideClusterClient);
		const store = new KeyvValkeyGlide({
			cluster: true,
			addresses: [{ host: "myhost", port: 1234 }],
		});
		await store.getClient().catch(() => {});
		expect(GlideClusterClient.createClient).toHaveBeenCalled();
		expect(getConfig().addresses).toEqual([{ host: "myhost", port: 1234 }]);
	});

	test("should apply namespace and useSets when constructed from an existing client", async () => {
		const client = await GlideClient.createClient({
			addresses: [{ host: "localhost", port: 6370 }],
			databaseId: 1,
		});
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkeyGlide(client, { namespace, useSets: true });
		expect(store.namespace).toBe(namespace);
		expect(store.useSets).toBe(true);
		await store.disconnect();
	});
});

describe("connect failures", () => {
	test("should emit error exactly once and resolve false when the initial connection fails", async () => {
		const failure = new Error(faker.lorem.sentence());
		vi.spyOn(GlideClient, "createClient").mockRejectedValueOnce(failure);

		const store = new KeyvValkeyGlide(valkeyUri);
		const errors: unknown[] = [];
		store.on("error", (error) => errors.push(error));

		expect(await store.set(faker.string.alphanumeric(10), faker.string.alphanumeric(10))).toBe(
			false,
		);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toBe(failure);
	});

	test("should emit error exactly once and resolve false for setMany when the initial connection fails", async () => {
		const failure = new Error(faker.lorem.sentence());
		vi.spyOn(GlideClient, "createClient").mockRejectedValueOnce(failure);

		const store = new KeyvValkeyGlide(valkeyUri);
		const errors: unknown[] = [];
		store.on("error", (error) => errors.push(error));

		expect(
			await store.setMany([
				{ key: faker.string.alphanumeric(10), value: faker.string.alphanumeric(10) },
			]),
		).toEqual([false]);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toBe(failure);
	});

	test("should propagate the connect failure when calling getClient directly", async () => {
		const failure = new Error(faker.lorem.sentence());
		vi.spyOn(GlideClient, "createClient").mockRejectedValueOnce(failure);

		const store = new KeyvValkeyGlide(valkeyUri);
		const errors: unknown[] = [];
		store.on("error", (error) => errors.push(error));
		await expect(store.getClient()).rejects.toThrow(failure.message);
		expect(errors).toHaveLength(0);
	});

	test("should make Keyv reject when no error listener is attached", async () => {
		const failure = new Error(faker.lorem.sentence());
		vi.spyOn(GlideClient, "createClient").mockRejectedValue(failure);

		const keyv = new Keyv({ store: new KeyvValkeyGlide(valkeyUri) });
		const key = faker.string.alphanumeric(10);
		await expect(keyv.set(key, faker.string.alphanumeric(10))).rejects.toThrow(failure.message);
		await expect(keyv.setMany([{ key, value: faker.string.alphanumeric(10) }])).rejects.toThrow(
			failure.message,
		);
		await expect(keyv.get(key)).rejects.toThrow(failure.message);
	});

	test("should emit one Keyv error per failed operation when a listener is attached", async () => {
		const failure = new Error(faker.lorem.sentence());
		vi.spyOn(GlideClient, "createClient").mockRejectedValue(failure);

		const keyv = new Keyv({ store: new KeyvValkeyGlide(valkeyUri) });
		const errors: unknown[] = [];
		keyv.on("error", (error) => errors.push(error));
		const key = faker.string.alphanumeric(10);
		expect(await keyv.set(key, faker.string.alphanumeric(10))).toBe(false);
		expect(errors).toHaveLength(1);
		expect(await keyv.setMany([{ key, value: faker.string.alphanumeric(10) }])).toEqual([false]);
		expect(errors).toHaveLength(2);
		expect(await keyv.get(key)).toBeUndefined();
		expect(errors).toHaveLength(3);
		expect(errors.every((error) => error === failure)).toBe(true);
	});
});

describe("connect bookkeeping", () => {
	/** Records each client the adapter creates, with a spy on its `close()`. */
	function trackCreatedClients(): GlideClient[] {
		const created: GlideClient[] = [];
		const createClient = GlideClient.createClient.bind(GlideClient);
		vi.spyOn(GlideClient, "createClient").mockImplementation(async (config) => {
			const client = await createClient(config);
			vi.spyOn(client, "close");
			created.push(client);
			return client;
		});
		return created;
	}

	test("should close a client that finishes connecting after disconnect", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const created = trackCreatedClients();
		const pending = store.getClient();
		await store.disconnect();
		await expect(pending).rejects.toThrow(/disconnected/);
		expect(created).toHaveLength(1);
		expect(created[0].close).toHaveBeenCalled();
		expect(() => store.client).toThrow(/getClient/);
	});

	test("should keep a client set while another was connecting", async () => {
		const replacement = await GlideClient.createClient({
			addresses: [{ host: "localhost", port: 6370 }],
			databaseId: 1,
		});
		const store = new KeyvValkeyGlide(valkeyUri);
		const created = trackCreatedClients();
		const pending = store.getClient();
		store.client = replacement;
		expect(await pending).toBe(replacement);
		expect(created).toHaveLength(1);
		expect(created[0].close).toHaveBeenCalled();
		expect(store.client).toBe(replacement);
		await store.disconnect();
	});
});
