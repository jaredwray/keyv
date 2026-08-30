import process from "node:process";
import { faker } from "@faker-js/faker";
import { Hookified } from "hookified";
import Redis from "iovalkey";
import { describe, expect, test } from "vitest";
import KeyvValkey from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

describe("events", () => {
	test("should extend Hookified", async () => {
		const store = new KeyvValkey(valkeyUri);
		expect(store).toBeInstanceOf(Hookified);
		await store.disconnect();
	});

	test("should expose the hookified event methods", async () => {
		const store = new KeyvValkey(valkeyUri);
		expect(typeof store.on).toBe("function");
		expect(typeof store.once).toBe("function");
		expect(typeof store.emit).toBe("function");
		expect(typeof store.off).toBe("function");
		await store.disconnect();
	});

	test("should re-emit the client error event on the adapter", async () => {
		const store = new KeyvValkey(valkeyUri);
		const error = new Error(faker.lorem.sentence());
		let received: Error | undefined;
		store.on("error", (emitted) => {
			received = emitted as Error;
		});

		store.client.emit("error", error);

		expect(received).toBe(error);
		await store.disconnect();
	});

	test("should re-emit the client connect event on the adapter", async () => {
		const store = new KeyvValkey(valkeyUri);
		let received: unknown;
		store.on("connect", (client) => {
			received = client;
		});

		store.client.emit("connect");

		expect(received).toBe(store.client);
		await store.disconnect();
	});

	test("should re-emit the client reconnecting event on the adapter", async () => {
		const store = new KeyvValkey(valkeyUri);
		let received = false;
		store.on("reconnecting", () => {
			received = true;
		});

		store.client.emit("reconnecting");

		expect(received).toBe(true);
		await store.disconnect();
	});

	test("should re-emit the client close event as disconnect", async () => {
		const store = new KeyvValkey(valkeyUri);
		let received: unknown;
		store.on("disconnect", (client) => {
			received = client;
		});

		store.client.emit("close");

		expect(received).toBe(store.client);
		await store.disconnect();
	});

	test("should wire a single listener per client event", async () => {
		const store = new KeyvValkey(valkeyUri);
		expect(store.client.listenerCount("error")).toBe(1);
		expect(store.client.listenerCount("connect")).toBe(1);
		expect(store.client.listenerCount("reconnecting")).toBe(1);
		expect(store.client.listenerCount("close")).toBeGreaterThanOrEqual(1);
		await store.disconnect();
	});

	test("should re-wire listeners when the client is replaced", async () => {
		const store = new KeyvValkey(valkeyUri);
		const oldClient = store.client;
		const newClient = new Redis(valkeyUri);
		store.client = newClient;

		const error = new Error(faker.lorem.sentence());
		let received: Error | undefined;
		let disconnectedFromOld = false;
		store.on("error", (emitted) => {
			received = emitted as Error;
		});
		store.on("disconnect", () => {
			disconnectedFromOld = true;
		});

		newClient.emit("error", error);
		oldClient.emit("close");

		expect(received).toBe(error);
		expect(disconnectedFromOld).toBe(false);
		expect(newClient.listenerCount("error")).toBe(1);
		expect(oldClient.listenerCount("error")).toBe(0);
		await oldClient.disconnect();
		await store.disconnect();
	});

	test("should not attach duplicate listeners when the same client is reused", async () => {
		const client = new Redis(valkeyUri);
		const store = new KeyvValkey(client);
		const errorCount = client.listenerCount("error");
		const connectCount = client.listenerCount("connect");
		const closeCount = client.listenerCount("close");

		store.client = client;

		expect(client.listenerCount("error")).toBe(errorCount);
		expect(client.listenerCount("connect")).toBe(connectCount);
		expect(client.listenerCount("close")).toBe(closeCount);
		await store.disconnect();
	});
});
