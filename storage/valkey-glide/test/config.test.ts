import process from "node:process";
import { faker } from "@faker-js/faker";
import { GlideClient, GlideClusterClient } from "@valkey/valkey-glide";
import { afterEach, describe, expect, test, vi } from "vitest";
import KeyvValkeyGlide from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

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
		});
		await store.getClient().catch(() => {});
		const config = getConfig();
		expect(config.readFrom).toBe("AZAffinity");
		expect(config.clientAz).toBe("us-east-1a");
		expect(config).not.toHaveProperty("cluster");
		expect(config).not.toHaveProperty("useSets");
		expect(config).not.toHaveProperty("namespace");
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
		await expect(store.getClient()).rejects.toThrow(failure.message);
	});
});

describe("connect bookkeeping", () => {
	test("should not clobber connect state cleared by an in-flight disconnect", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const pending = store.getClient();
		await store.disconnect();
		const client = await pending;
		client.close();
	});
});
