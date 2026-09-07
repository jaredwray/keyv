import { EventEmitter } from "node:events";
import process from "node:process";
import { faker } from "@faker-js/faker";
import type { RedisClientType } from "@redis/client";
import { describe, expect, test } from "vitest";
import KeyvRedis, { createKeyv, RedisErrorMessages } from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";
const redisBadUri = process.env.REDIS_BAD_URI ?? "redis://localhost:6378";

class ClientOfflineError extends Error {
	constructor() {
		super("The client is offline");
		this.name = "ClientOfflineError";
	}
}

/**
 * Stand-in for `@redis/client` that matches node-redis connect timing:
 * `isOpen` becomes true synchronously in `connect()`, `isReady` only after a delay.
 */
class FakeRedisClient extends EventEmitter {
	isOpen = false;
	isReady = false;
	store = new Map<string, string>();
	connectCalls = 0;
	connectDelayMs = 25;
	failConnect = false;

	async connect(): Promise<this> {
		this.connectCalls += 1;
		if (this.isOpen) {
			throw new Error("Socket already opened");
		}

		this.isOpen = true;
		this.emit("connect");

		if (this.failConnect) {
			this.isOpen = false;
			const error = new Error("connect failed");
			this.emit("error", error);
			throw error;
		}

		await new Promise((resolve) => {
			setTimeout(resolve, this.connectDelayMs);
		});
		this.isReady = true;
		this.emit("ready");
		return this;
	}

	async set(key: string, value: string): Promise<string> {
		if (!this.isOpen) {
			throw new Error("The client is closed");
		}

		if (!this.isReady) {
			throw new ClientOfflineError();
		}

		this.store.set(key, value);
		return "OK";
	}

	async get(key: string): Promise<string | null> {
		if (!this.isReady) {
			throw new ClientOfflineError();
		}

		const value = this.store.get(key);
		return value === undefined ? null : value;
	}

	async close(): Promise<void> {
		this.isOpen = false;
		this.isReady = false;
		this.emit("end");
	}

	async destroy(): Promise<void> {
		this.isOpen = false;
		this.isReady = false;
		this.emit("end");
	}
}

function createAdapter(
	client: FakeRedisClient,
	options?: { connectionTimeout?: number },
): KeyvRedis<string> {
	const keyvRedis = new KeyvRedis(
		client as unknown as RedisClientType,
		options,
	);
	keyvRedis.throwOnConnectError = false;
	keyvRedis.throwOnErrors = false;
	keyvRedis.on("error", () => {});
	return keyvRedis;
}

describe("getClient", () => {
	test("should get client that is connected", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const client = await keyvRedis.getClient();
		expect(client).toBeDefined();
		await keyvRedis.disconnect();
	});

	test("should get client that is connected with default timeout", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { connectionTimeout: 2000 });
		expect(keyvRedis.connectionTimeout).toBe(2000);
		keyvRedis.connectionTimeout = undefined; // Reset to default
		expect(keyvRedis.connectionTimeout).toBe(undefined);
		const client = await keyvRedis.getClient();
		expect(client).toBeDefined();
		await keyvRedis.disconnect();
	});

	test("should get client that is connected with timeout", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { connectionTimeout: 2000 });
		expect(keyvRedis.connectionTimeout).toBe(2000);
		const client = await keyvRedis.getClient();
		expect(client).toBeDefined();
		await keyvRedis.disconnect();
	});

	test("should throw an error if not connected", async () => {
		const keyvRedis = new KeyvRedis(redisBadUri, { connectionTimeout: 500 });
		keyvRedis.on("error", () => {}); // Silence expected connection errors
		let didError = false;
		try {
			await keyvRedis.getClient();
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe(
				RedisErrorMessages.RedisClientNotConnectedThrown,
			);
		}

		expect(didError).toBe(true);
	});

	test("should throw an error if not connected with Keyv", async () => {
		const keyv = createKeyv(redisBadUri, {
			throwOnErrors: true,
			connectionTimeout: 500,
		});
		keyv.on("error", () => {}); // Silence expected connection errors
		let didError = false;
		try {
			await keyv.get(faker.string.alphanumeric(10));
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe(
				RedisErrorMessages.RedisClientNotConnectedThrown,
			);
		}

		expect(didError).toBe(true);
	});

	test("should throw an error if not connected with Keyv", async () => {
		const keyv = createKeyv(redisBadUri, {
			throwOnConnectError: true,
			connectionTimeout: 500,
		});
		keyv.on("error", () => {}); // Silence expected connection errors
		let didError = false;
		try {
			await keyv.get(faker.string.alphanumeric(10));
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe(
				RedisErrorMessages.RedisClientNotConnectedThrown,
			);
		}

		expect(didError).toBe(true);
	});

	test("should share one connect across concurrent getClient callers", async () => {
		const client = new FakeRedisClient();
		const keyvRedis = createAdapter(client);

		const clients = await Promise.all([
			keyvRedis.getClient(),
			keyvRedis.getClient(),
			keyvRedis.getClient(),
		]);

		expect(client.connectCalls).toBe(1);
		expect(client.isReady).toBe(true);
		expect(new Set(clients).size).toBe(1);
	});

	test("should persist concurrent sets while the initial connect is in flight", async () => {
		const client = new FakeRedisClient();
		const keyvRedis = createAdapter(client);
		const errors: Error[] = [];
		keyvRedis.on("error", (error) => {
			errors.push(error as Error);
		});

		const keys = Array.from(
			{ length: 50 },
			(_, index) => `concurrent:${index}`,
		);
		await Promise.all(
			keys.map((key, index) => keyvRedis.set(key, String(index))),
		);
		const values = await Promise.all(keys.map((key) => keyvRedis.get(key)));

		expect(client.connectCalls).toBe(1);
		expect(values).toEqual(keys.map((_, index) => String(index)));
		expect(
			errors.filter((error) => error.name === "ClientOfflineError"),
		).toHaveLength(0);
	});

	test("should persist concurrent sets after disconnect reconnects the client", async () => {
		const client = new FakeRedisClient();
		const keyvRedis = createAdapter(client);

		await keyvRedis.getClient();
		await keyvRedis.disconnect();
		client.connectCalls = 0;
		client.store.clear();

		const keys = Array.from({ length: 50 }, (_, index) => `reconnect:${index}`);
		await Promise.all(
			keys.map((key, index) => keyvRedis.set(key, String(index))),
		);
		const values = await Promise.all(keys.map((key) => keyvRedis.get(key)));

		expect(client.connectCalls).toBe(1);
		expect(values).toEqual(keys.map((_, index) => String(index)));
	});

	test("should wait for an already-open client to become ready instead of calling connect again", async () => {
		const client = new FakeRedisClient();
		client.isOpen = true;
		const keyvRedis = createAdapter(client);

		const ready = new Promise<void>((resolve) => {
			setTimeout(() => {
				client.isReady = true;
				client.emit("ready");
				resolve();
			}, 20);
		});

		const connected = keyvRedis.getClient();
		await ready;
		await connected;

		expect(client.connectCalls).toBe(0);
		expect(client.isReady).toBe(true);
	});

	test("should ignore connect events until the open client is ready", async () => {
		const client = new FakeRedisClient();
		client.isOpen = true;
		const keyvRedis = createAdapter(client);

		const connected = keyvRedis.getClient();
		setTimeout(() => {
			client.emit("connect");
		}, 10);
		setTimeout(() => {
			client.isReady = true;
			client.emit("ready");
		}, 30);

		await connected;
		expect(client.connectCalls).toBe(0);
		expect(client.isReady).toBe(true);
	});

	test("should drop a stale connect promise when the client is replaced", async () => {
		const client = new FakeRedisClient();
		client.connectDelayMs = 50;
		const keyvRedis = createAdapter(client);

		const pending = keyvRedis.getClient();
		const replacement = new FakeRedisClient();
		replacement.isOpen = true;
		replacement.isReady = true;
		keyvRedis.client = replacement as unknown as RedisClientType;

		await pending;
		const connected = await keyvRedis.getClient();
		expect(connected).toBe(replacement);
	});

	test("should not register duplicate listeners after connect or wait-until-ready", async () => {
		const client = new FakeRedisClient();
		const keyvRedis = createAdapter(client);
		const errorListeners = client.listenerCount("error");
		const connectListeners = client.listenerCount("connect");

		await keyvRedis.getClient();
		expect(client.listenerCount("error")).toBe(errorListeners);
		expect(client.listenerCount("connect")).toBe(connectListeners);

		await keyvRedis.disconnect();
		await keyvRedis.getClient();
		expect(client.listenerCount("error")).toBe(errorListeners);
		expect(client.listenerCount("connect")).toBe(connectListeners);

		await keyvRedis.disconnect();
		client.isOpen = true;
		const pending = keyvRedis.getClient();
		setTimeout(() => {
			client.isReady = true;
			client.emit("ready");
		}, 20);
		await pending;
		expect(client.listenerCount("error")).toBe(errorListeners);
		expect(client.listenerCount("connect")).toBe(connectListeners);
	});

	test("should not hang on cluster clients that have isOpen but no isReady", async () => {
		const client = new FakeRedisClient();
		Object.defineProperty(client, "slots", {
			configurable: true,
			value: {},
		});
		Object.defineProperty(client, "isReady", {
			configurable: true,
			get: () => undefined,
			set: () => {},
		});
		const keyvRedis = createAdapter(client);

		const first = await keyvRedis.getClient();
		const second = await keyvRedis.getClient();

		expect(client.connectCalls).toBe(1);
		expect(first).toBe(client);
		expect(second).toBe(client);
	});

	test("should treat cluster connect as ready when isReady becomes true", async () => {
		const client = new FakeRedisClient();
		client.isOpen = true;
		const keyvRedis = createAdapter(client);

		const connected = keyvRedis.getClient();
		setTimeout(() => {
			client.isReady = true;
			client.emit("connect");
		}, 20);

		await connected;
		expect(client.connectCalls).toBe(0);
		expect(client.isReady).toBe(true);
	});

	test("should ignore transient errors while waiting for an open client to become ready", async () => {
		const client = new FakeRedisClient();
		client.isOpen = true;
		const keyvRedis = createAdapter(client);

		const connected = keyvRedis.getClient();
		setTimeout(() => {
			client.emit("error", new Error("transient"));
		}, 10);
		setTimeout(() => {
			client.isReady = true;
			client.emit("ready");
		}, 30);

		await connected;
		expect(client.isReady).toBe(true);
	});

	test("should fail if an already-open client closes before it becomes ready", async () => {
		const client = new FakeRedisClient();
		client.isOpen = true;
		const keyvRedis = new KeyvRedis(client as unknown as RedisClientType, {
			connectionTimeout: 500,
		});
		keyvRedis.on("error", () => {});

		const pending = keyvRedis.getClient();
		setTimeout(() => {
			client.isOpen = false;
			client.emit("end");
		}, 10);

		await expect(pending).rejects.toThrow(
			RedisErrorMessages.RedisClientNotConnectedThrown,
		);
	});

	test("should fail if an already-open client errors and closes before it becomes ready", async () => {
		const client = new FakeRedisClient();
		client.isOpen = true;
		const keyvRedis = new KeyvRedis(client as unknown as RedisClientType, {
			connectionTimeout: 500,
		});
		keyvRedis.on("error", () => {});

		const pending = keyvRedis.getClient();
		setTimeout(() => {
			client.isOpen = false;
			client.emit("error", new Error("socket gone"));
		}, 10);

		await expect(pending).rejects.toThrow(
			RedisErrorMessages.RedisClientNotConnectedThrown,
		);
	});

	test("should time out while waiting for an already-open client to become ready", async () => {
		const client = new FakeRedisClient();
		client.isOpen = true;
		const keyvRedis = new KeyvRedis(client as unknown as RedisClientType, {
			connectionTimeout: 50,
		});
		keyvRedis.on("error", () => {});

		await expect(keyvRedis.getClient()).rejects.toThrow(
			RedisErrorMessages.RedisClientNotConnectedThrown,
		);
	});

	test("should not throw on connect failure when throwOnConnectError is false", async () => {
		const client = new FakeRedisClient();
		client.failConnect = true;
		const keyvRedis = createAdapter(client);

		const connected = await keyvRedis.getClient();
		expect(connected).toBe(client);
		expect(client.isReady).toBe(false);
	});

	test("should retry connect after a previous attempt fails", async () => {
		const client = new FakeRedisClient();
		client.failConnect = true;
		const keyvRedis = createAdapter(client);

		await keyvRedis.getClient();
		client.failConnect = false;
		client.connectCalls = 0;

		const connected = await keyvRedis.getClient();
		expect(client.connectCalls).toBe(1);
		expect(connected).toBe(client);
		expect(client.isReady).toBe(true);
	});

	test("should return immediately when the client is already ready", async () => {
		const client = new FakeRedisClient();
		client.isOpen = true;
		client.isReady = true;
		const keyvRedis = createAdapter(client);

		const connected = await keyvRedis.getClient();
		expect(connected).toBe(client);
		expect(client.connectCalls).toBe(0);
	});

	test("should return if the client becomes ready after getClient starts connectClient", async () => {
		const client = new FakeRedisClient();
		let readyChecks = 0;
		Object.defineProperty(client, "isReady", {
			configurable: true,
			get: () => {
				readyChecks += 1;
				return readyChecks > 1;
			},
		});
		const keyvRedis = createAdapter(client);

		const connected = await keyvRedis.getClient();
		expect(connected).toBe(client);
		expect(client.connectCalls).toBe(0);
	});

	test("should return from waitUntilReady if the client is already ready", async () => {
		const client = new FakeRedisClient();
		client.isOpen = true;
		let readyChecks = 0;
		Object.defineProperty(client, "isReady", {
			configurable: true,
			get: () => {
				readyChecks += 1;
				return readyChecks >= 3;
			},
		});
		const keyvRedis = createAdapter(client);

		const connected = await keyvRedis.getClient();
		expect(connected).toBe(client);
		expect(client.connectCalls).toBe(0);
	});

	test("should resolve waitUntilReady if the client becomes ready while listeners are attached", async () => {
		const client = new FakeRedisClient();
		client.isOpen = true;
		let readyChecks = 0;
		Object.defineProperty(client, "isReady", {
			configurable: true,
			get: () => {
				readyChecks += 1;
				return readyChecks >= 4;
			},
		});
		const keyvRedis = createAdapter(client);

		const connected = await keyvRedis.getClient();
		expect(connected).toBe(client);
		expect(client.connectCalls).toBe(0);
	});

	test("should fail waitUntilReady if the client closes while listeners are attached", async () => {
		const client = new FakeRedisClient();
		let openChecks = 0;
		Object.defineProperty(client, "isOpen", {
			configurable: true,
			get: () => {
				openChecks += 1;
				return openChecks === 1;
			},
			set: () => {},
		});
		Object.defineProperty(client, "isReady", {
			configurable: true,
			get: () => false,
		});
		const keyvRedis = new KeyvRedis(client as unknown as RedisClientType, {
			connectionTimeout: 500,
		});
		keyvRedis.on("error", () => {});

		await expect(keyvRedis.getClient()).rejects.toThrow(
			RedisErrorMessages.RedisClientNotConnectedThrown,
		);
	});

	test("should not accumulate listeners after reconnects", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const client = keyvRedis.client as RedisClientType;

		expect(client.listenerCount("error")).toBe(1);
		expect(client.listenerCount("connect")).toBe(1);
		expect(client.listenerCount("disconnect")).toBe(1);
		expect(client.listenerCount("reconnecting")).toBe(1);

		for (let index = 0; index < 12; index++) {
			await keyvRedis.getClient();
			await keyvRedis.disconnect();
			expect(client.listenerCount("error")).toBe(1);
			expect(client.listenerCount("connect")).toBe(1);
			expect(client.listenerCount("disconnect")).toBe(1);
			expect(client.listenerCount("reconnecting")).toBe(1);
		}

		await keyvRedis.getClient();
		await keyvRedis.set("listener-reconnect-key", "ok");
		expect(await keyvRedis.get("listener-reconnect-key")).toBe("ok");
		await keyvRedis.delete("listener-reconnect-key");
		await keyvRedis.disconnect();
	});
});

describe("client event listeners", () => {
	test("should attach listeners once across reconnects", async () => {
		const client = new FakeRedisClient();
		const store = new KeyvRedis(client as unknown as RedisClientType);
		const listenerCounts = [client.listenerCount("error")];

		for (let index = 0; index < 12; index++) {
			await store.getClient();
			await store.disconnect();
			listenerCounts.push(client.listenerCount("error"));
		}

		expect(listenerCounts).toEqual(Array.from({ length: 13 }).fill(1));
		expect(client.listenerCount("connect")).toBe(1);
		expect(client.listenerCount("disconnect")).toBe(1);
		expect(client.listenerCount("reconnecting")).toBe(1);
	});

	test("should forward a client error only once after reconnects", async () => {
		const client = new FakeRedisClient();
		const store = new KeyvRedis(client as unknown as RedisClientType);
		let forwardedErrors = 0;
		store.on("error", () => {
			forwardedErrors++;
		});

		for (let index = 0; index < 5; index++) {
			await store.getClient();
			await store.disconnect();
		}

		client.emit("error", new Error("test"));
		expect(forwardedErrors).toBe(1);
	});

	test("should forward connect, disconnect, and reconnecting events", async () => {
		const client = new FakeRedisClient();
		const store = new KeyvRedis(client as unknown as RedisClientType);
		const events: unknown[] = [];
		store.on("connect", (value) => {
			events.push(["connect", value]);
		});
		store.on("disconnect", (value) => {
			events.push(["disconnect", value]);
		});
		store.on("reconnecting", (value) => {
			events.push(["reconnecting", value]);
		});

		client.emit("connect");
		client.emit("disconnect");
		client.emit("reconnecting", { attempt: 2 });

		expect(events).toEqual([
			["connect", client],
			["disconnect", client],
			["reconnecting", { attempt: 2 }],
		]);
	});

	test("should move listeners when the client is replaced", () => {
		const originalClient = new FakeRedisClient();
		const replacementClient = new FakeRedisClient();
		const store = new KeyvRedis(originalClient as unknown as RedisClientType);
		let forwardedErrors = 0;
		store.on("error", () => {
			forwardedErrors++;
		});

		expect(originalClient.listenerCount("error")).toBe(1);

		store.client = replacementClient as unknown as RedisClientType;
		store.client = replacementClient as unknown as RedisClientType;

		expect(originalClient.listenerCount("error")).toBe(0);
		expect(replacementClient.listenerCount("error")).toBe(1);

		originalClient.on("error", () => {});
		originalClient.emit("error", new Error("old"));
		expect(forwardedErrors).toBe(0);

		replacementClient.emit("error", new Error("new"));
		expect(forwardedErrors).toBe(1);
	});
});
