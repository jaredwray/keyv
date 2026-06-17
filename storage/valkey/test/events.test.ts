import process from "node:process";
import { faker } from "@faker-js/faker";
import Redis from "iovalkey";
import { describe, expect, test } from "vitest";
import KeyvValkey from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

describe("events", () => {
	test("should expose the hookified event methods", () => {
		const keyv = new KeyvValkey(valkeyUri);
		expect(typeof keyv.on).toBe("function");
		expect(typeof keyv.once).toBe("function");
		expect(typeof keyv.emit).toBe("function");
	});

	test("should re-emit the client error event on the adapter", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		const error = new Error(faker.lorem.sentence());
		let received: Error | undefined;
		keyv.on("error", (emitted) => {
			received = emitted as Error;
		});

		keyv.client.emit("error", error);

		expect(received).toBe(error);
		await keyv.disconnect();
	});

	test("should re-emit the client connect event on the adapter", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		let received: unknown;
		keyv.on("connect", (client) => {
			received = client;
		});

		keyv.client.emit("connect");

		expect(received).toBe(keyv.client);
		await keyv.disconnect();
	});

	test("should re-emit the client reconnecting event on the adapter", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		let received = false;
		keyv.on("reconnecting", () => {
			received = true;
		});

		keyv.client.emit("reconnecting");

		expect(received).toBe(true);
		await keyv.disconnect();
	});

	test("should wire a single error listener on the client", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		expect(keyv.client.listenerCount("error")).toBe(1);
		await keyv.disconnect();
	});

	test("should re-wire the error listener when the client is replaced", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		const oldClient = keyv.client;
		const newClient = new Redis(valkeyUri);
		keyv.client = newClient;

		const error = new Error(faker.lorem.sentence());
		let received: Error | undefined;
		keyv.on("error", (emitted) => {
			received = emitted as Error;
		});

		newClient.emit("error", error);

		expect(received).toBe(error);
		expect(newClient.listenerCount("error")).toBe(1);
		// The old client's listener must be removed so it no longer drives the adapter.
		expect(oldClient.listenerCount("error")).toBe(0);
		await oldClient.disconnect();
		await keyv.disconnect();
	});

	test("should not attach duplicate listeners when the same client is reused", async () => {
		const client = new Redis(valkeyUri);
		const keyv = new KeyvValkey(client);
		const errorCount = client.listenerCount("error");
		const connectCount = client.listenerCount("connect");

		keyv.client = client;

		expect(client.listenerCount("error")).toBe(errorCount);
		expect(client.listenerCount("connect")).toBe(connectCount);
		await keyv.disconnect();
	});
});
