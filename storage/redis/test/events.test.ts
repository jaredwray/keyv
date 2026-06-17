import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import KeyvRedis, { createClient, type RedisClientType } from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";

describe("events", () => {
	test("should expose hookified event methods", () => {
		const keyvRedis = new KeyvRedis(redisUri);
		expect(typeof keyvRedis.on).toBe("function");
		expect(typeof keyvRedis.once).toBe("function");
		expect(typeof keyvRedis.emit).toBe("function");
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

	test("should emit a connect event when the client connects", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		let connected = false;
		keyvRedis.on("connect", () => {
			connected = true;
		});

		await keyvRedis.getClient();

		expect(connected).toBe(true);
		await keyvRedis.disconnect();
	});

	test("should not attach duplicate listeners when connecting", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		// The constructor wires up a single listener per event.
		expect(keyvRedis.client.listenerCount("error")).toBe(1);
		expect(keyvRedis.client.listenerCount("connect")).toBe(1);

		// Connecting (and re-initializing the client) must not add duplicates.
		await keyvRedis.getClient();
		await keyvRedis.getClient();

		expect(keyvRedis.client.listenerCount("error")).toBe(1);
		expect(keyvRedis.client.listenerCount("connect")).toBe(1);
		await keyvRedis.disconnect();
	});

	test("should re-wire listeners when the client is replaced", () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const newClient = createClient({ url: redisUri }) as RedisClientType;

		keyvRedis.client = newClient;

		expect(keyvRedis.client).toBe(newClient);
		expect(keyvRedis.client.listenerCount("error")).toBe(1);
		expect(keyvRedis.client.listenerCount("connect")).toBe(1);
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
