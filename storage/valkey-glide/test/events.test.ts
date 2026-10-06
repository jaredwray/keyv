import process from "node:process";
import { faker } from "@faker-js/faker";
import { GlideClient } from "@valkey/valkey-glide";
import { Hookified } from "hookified";
import { describe, expect, test } from "vitest";
import KeyvValkeyGlide from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370/1";

describe("events", () => {
	test("should extend Hookified", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		expect(store).toBeInstanceOf(Hookified);
		await store.disconnect();
	});

	test("should emit connect after getClient", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		let received: unknown;
		store.on("connect", (client) => {
			received = client;
		});
		const client = await store.getClient();
		expect(received).toBe(client);
		await store.disconnect();
	});

	test("should emit connect when a client is assigned", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const replacement = await GlideClient.createClient({
			addresses: [{ host: "localhost", port: 6370 }],
			databaseId: 1,
		});
		let received: unknown;
		store.on("connect", (client) => {
			received = client;
		});
		store.client = replacement;
		expect(received).toBe(replacement);
		await store.disconnect();
	});

	test("should emit disconnect on disconnect", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		await store.getClient();
		let received = false;
		store.on("disconnect", () => {
			received = true;
		});
		await store.disconnect();
		expect(received).toBe(true);
	});

	test("should emit error when set fails", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const client = await store.getClient();
		const originalSet = client.set.bind(client);
		client.set = async () => {
			throw new Error(faker.lorem.sentence());
		};

		const errors: unknown[] = [];
		store.on("error", (error) => {
			errors.push(error);
		});
		expect(await store.set(faker.string.alphanumeric(10), faker.string.alphanumeric(10))).toBe(
			false,
		);
		expect(errors).toHaveLength(1);
		client.set = originalSet;
		await store.disconnect();
	});
});
