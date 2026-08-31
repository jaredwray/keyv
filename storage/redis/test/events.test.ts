import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import KeyvRedis, { createClient, type RedisClientType } from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";

describe("events", () => {
	test("should expose the Hookified event methods", () => {
		const keyvRedis = new KeyvRedis(redisUri);
		expect(typeof keyvRedis.on).toBe("function");
		expect(typeof keyvRedis.once).toBe("function");
		expect(typeof keyvRedis.emit).toBe("function");
	});

	test("should deliver an event only once when once() is used", () => {
		const keyvRedis = new KeyvRedis(redisUri);
		let count = 0;
		keyvRedis.once("error", () => {
			count += 1;
		});

		keyvRedis.emit("error", new Error(faker.lorem.sentence()));
		keyvRedis.emit("error", new Error(faker.lorem.sentence()));

		expect(count).toBe(1);
	});

	test("should re-emit the client error event on the adapter", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const error = new Error(faker.lorem.sentence());
		let received: Error | undefined;
		keyvRedis.on("error", (emitted) => {
			received = emitted as Error;
		});

		keyvRedis.client.emit("error", error);

		expect(received).toBe(error);
		await keyvRedis.disconnect();
	});

	test("should re-emit the client connect event on the adapter", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		let received: unknown;
		keyvRedis.on("connect", (client) => {
			received = client;
		});

		await keyvRedis.getClient();

		expect(received).toBe(keyvRedis.client);
		await keyvRedis.disconnect();
	});

	test("should re-emit the client reconnecting event on the adapter", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		let received: unknown;
		keyvRedis.on("reconnecting", (info) => {
			received = info;
		});

		const reconnectInfo = { attempt: 1 };
		keyvRedis.client.emit("reconnecting", reconnectInfo);

		expect(received).toBe(reconnectInfo);
		await keyvRedis.disconnect();
	});

	test("should re-emit the client disconnect event on the adapter", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		let received: unknown;
		keyvRedis.on("disconnect", (client) => {
			received = client;
		});

		keyvRedis.client.emit("disconnect");

		expect(received).toBe(keyvRedis.client);
		await keyvRedis.disconnect();
	});

	test("should not attach duplicate listeners when connecting", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		expect(keyvRedis.client.listenerCount("error")).toBe(1);
		expect(keyvRedis.client.listenerCount("connect")).toBe(1);

		await keyvRedis.getClient();
		await keyvRedis.getClient();

		expect(keyvRedis.client.listenerCount("error")).toBe(1);
		expect(keyvRedis.client.listenerCount("connect")).toBe(1);
		await keyvRedis.disconnect();
	});

	test("should not attach duplicate listeners when the same client is reused", () => {
		const client = createClient({ url: redisUri }) as RedisClientType;
		const keyvRedis = new KeyvRedis(client);
		const errorCount = client.listenerCount("error");
		const connectCount = client.listenerCount("connect");

		keyvRedis.client = client;

		expect(client.listenerCount("error")).toBe(errorCount);
		expect(client.listenerCount("connect")).toBe(connectCount);
	});

	test("should re-wire listeners when the client is replaced", () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const newClient = createClient({ url: redisUri }) as RedisClientType;

		keyvRedis.client = newClient;

		expect(keyvRedis.client).toBe(newClient);
		expect(keyvRedis.client.listenerCount("error")).toBe(1);
		expect(keyvRedis.client.listenerCount("connect")).toBe(1);
	});

	test("should remove listeners from the previous client when replaced", () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const oldClient = keyvRedis.client;
		const newClient = createClient({ url: redisUri }) as RedisClientType;

		expect(oldClient.listenerCount("error")).toBe(1);
		expect(oldClient.listenerCount("connect")).toBe(1);

		keyvRedis.client = newClient;

		expect(oldClient.listenerCount("error")).toBe(0);
		expect(oldClient.listenerCount("connect")).toBe(0);
		expect(oldClient.listenerCount("disconnect")).toBe(0);
		expect(oldClient.listenerCount("reconnecting")).toBe(0);
		expect(newClient.listenerCount("error")).toBe(1);
		expect(newClient.listenerCount("connect")).toBe(1);
	});

	test("should reset PXAT detection when the client is replaced", () => {
		const keyvRedis = new KeyvRedis(redisUri);
		(keyvRedis as unknown as { _pxatSupported: boolean })._pxatSupported = false;

		keyvRedis.client = createClient({ url: redisUri }) as RedisClientType;

		expect((keyvRedis as unknown as { _pxatSupported?: boolean })._pxatSupported).toBeUndefined();
	});

	test("should emit an error event when clearBatchSize is set to an invalid value", () => {
		const keyvRedis = new KeyvRedis(redisUri);
		let received = "";
		keyvRedis.on("error", (message) => {
			received = message as string;
		});

		keyvRedis.clearBatchSize = -1;

		expect(received).toBe("clearBatchSize must be greater than 0");
	});
});
