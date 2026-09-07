import { EventEmitter } from "node:events";
import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import KeyvRedis, {
	createKeyv,
	type RedisClientType,
	RedisErrorMessages,
} from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";
const redisBadUri = process.env.REDIS_BAD_URI ?? "redis://localhost:6378";

describe("getClient", () => {
	test("should get client that is connected", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const client = await keyvRedis.getClient();
		expect(client).toBeDefined();
	});

	test("should get client that is connected with default timeout", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { connectionTimeout: 2000 });
		expect(keyvRedis.connectionTimeout).toBe(2000);
		keyvRedis.connectionTimeout = undefined; // Reset to default
		expect(keyvRedis.connectionTimeout).toBe(undefined);
		const client = await keyvRedis.getClient();
		expect(client).toBeDefined();
	});

	test("should get client that is connected with timeout", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { connectionTimeout: 2000 });
		expect(keyvRedis.connectionTimeout).toBe(2000);
		const client = await keyvRedis.getClient();
		expect(client).toBeDefined();
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

class FakeRedisClient extends EventEmitter {
	isOpen = false;

	async connect(): Promise<void> {
		this.isOpen = true;
		this.emit("connect");
	}

	async close(): Promise<void> {
		this.isOpen = false;
		this.emit("disconnect");
	}

	async destroy(): Promise<void> {
		this.isOpen = false;
		this.emit("disconnect");
	}
}

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
