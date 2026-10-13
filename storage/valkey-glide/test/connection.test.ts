import { GlideClient, GlideClusterClient } from "@valkey/valkey-glide";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import KeyvValkeyGlide, { type KeyvValkeyGlideClient } from "../src/index.js";

function clientStub(cluster: boolean): KeyvValkeyGlideClient {
	const client = Object.create(
		cluster ? GlideClusterClient.prototype : GlideClient.prototype,
	) as KeyvValkeyGlideClient;
	client.close = vi.fn();
	client.get = vi.fn().mockResolvedValue("replacement value");
	client.set = vi.fn().mockResolvedValue("OK");
	return client;
}

describe.each([false, true])("pending connection lifecycle (cluster: %s)", (cluster) => {
	let store: KeyvValkeyGlide;
	let lateClient: KeyvValkeyGlideClient;
	let resolveConnection: (client: KeyvValkeyGlideClient) => void;
	let rejectConnection: (error: Error) => void;
	let onConnect: ReturnType<typeof vi.fn>;
	let onError: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		lateClient = clientStub(cluster);
		const connection = new Promise<KeyvValkeyGlideClient>((resolve, reject) => {
			resolveConnection = resolve;
			rejectConnection = reject;
		});
		if (cluster) {
			vi.spyOn(GlideClusterClient, "createClient").mockReturnValue(
				connection as Promise<GlideClusterClient>,
			);
		} else {
			vi.spyOn(GlideClient, "createClient").mockReturnValue(connection as Promise<GlideClient>);
		}

		store = new KeyvValkeyGlide({ cluster });
		onConnect = vi.fn();
		onError = vi.fn();
		store.on("connect", onConnect);
		store.on("error", onError);
	});

	afterEach(async () => {
		await store.disconnect();
		vi.restoreAllMocks();
	});

	test("closes a late client and rejects all waiters after disconnect", async () => {
		const first = store.getClient();
		const second = store.getClient();
		await store.disconnect();
		resolveConnection(lateClient);

		const outcomes = await Promise.allSettled([first, second]);
		expect(outcomes).toEqual([
			{ status: "rejected", reason: expect.any(Error) },
			{ status: "rejected", reason: expect.any(Error) },
		]);
		expect(lateClient.close).toHaveBeenCalledTimes(1);
		expect(onConnect).not.toHaveBeenCalled();
		expect(onError).toHaveBeenCalledExactlyOnceWith(
			new Error("Valkey GLIDE connection attempt was superseded"),
		);
		expect(() => store.client).toThrow("not connected");
		await expect(store.getClient()).rejects.toThrow("disconnected");
		await store.disconnect();
		expect(lateClient.close).toHaveBeenCalledTimes(1);
	});

	test("does not execute a pending write after disconnect", async () => {
		const pending = store.set("key", "value");
		await store.disconnect();
		resolveConnection(lateClient);

		expect(await pending).toBe(false);
		expect(lateClient.set).not.toHaveBeenCalled();
		expect(lateClient.close).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledTimes(1);
	});

	test.each([false, true])(
		"keeps an assigned client when an old connection succeeds (disconnect first: %s)",
		async (disconnectFirst) => {
			const pending = store.getClient();
			if (disconnectFirst) {
				await store.disconnect();
			}

			const replacement = clientStub(!cluster);
			store.client = replacement;
			resolveConnection(lateClient);

			await expect(pending).rejects.toThrow("superseded");
			expect(lateClient.close).toHaveBeenCalledTimes(1);
			expect(replacement.close).not.toHaveBeenCalled();
			expect(store.client).toBe(replacement);
			await expect(store.getClient()).resolves.toBe(replacement);
			await expect(store.get("key")).resolves.toBe("replacement value");
			expect(onConnect).toHaveBeenCalledExactlyOnceWith(replacement);
		},
	);

	test("keeps an assigned client when the old connection fails", async () => {
		const pending = store.getClient();
		const replacement = clientStub(!cluster);
		store.client = replacement;
		const failure = new Error("old connection failed");
		rejectConnection(failure);

		await expect(pending).rejects.toBe(failure);
		await expect(store.getClient()).resolves.toBe(replacement);
		expect(replacement.close).not.toHaveBeenCalled();
		expect(onConnect).toHaveBeenCalledExactlyOnceWith(replacement);
		expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
	});

	test("does not close a late client that was explicitly assigned as the current client", async () => {
		const pending = store.getClient();
		store.client = lateClient;
		resolveConnection(lateClient);

		await expect(pending).rejects.toThrow("superseded");
		await expect(store.getClient()).resolves.toBe(lateClient);
		expect(lateClient.close).not.toHaveBeenCalled();
		expect(onConnect).toHaveBeenCalledExactlyOnceWith(lateClient);
	});
});
