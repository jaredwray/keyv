import net from "node:net";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import KeyvRedis, {
	createClient,
	createKeyv,
	createKeyvNonBlocking,
	defaultReconnectStrategy,
	type RedisClientType,
	RedisErrorMessages,
} from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";
const redisBadUri = process.env.REDIS_BAD_URI ?? "redis://localhost:6378";

async function createHangServer(): Promise<{
	port: number;
	readonly openServerSockets: number;
	close: () => Promise<void>;
}> {
	const sockets = new Set<net.Socket>();
	const server = net.createServer((socket) => {
		sockets.add(socket);
		socket.on("close", () => {
			sockets.delete(socket);
		});
		socket.on("error", () => {});
		// Flow incoming bytes so a client destroy() can emit `close`. A paused socket with unread
		// HELLO data never emits `close`, which is a Node stream artifact rather than a client leak.
		socket.resume();
	});

	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			resolve();
		});
	});

	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("expected a TCP listen address");
	}

	return {
		port: address.port,
		get openServerSockets() {
			return sockets.size;
		},
		async close() {
			for (const socket of sockets) {
				socket.destroy();
			}

			await new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) {
						reject(error);
						return;
					}

					resolve();
				});
			});
		},
	};
}

async function waitForOpenSockets(
	server: { openServerSockets: number },
	expected: number,
	timeoutMs = 1000,
): Promise<void> {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		if (server.openServerSockets === expected) {
			return;
		}

		await delay(20);
	}

	expect(server.openServerSockets).toBe(expected);
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
			expect((error as Error).message).toBe(RedisErrorMessages.RedisClientNotConnectedThrown);
		}

		expect(didError).toBe(true);
		await keyvRedis.disconnect(true);
	});

	test("should throw an error if not connected with Keyv when throwOnErrors is true", async () => {
		const keyv = createKeyv(redisBadUri, {
			throwOnErrors: true,
			connectionTimeout: 500,
		});
		let didError = false;
		try {
			await keyv.get(faker.string.alphanumeric(10));
		} catch {
			didError = true;
		}

		expect(didError).toBe(true);
	});

	test("should throw an error if not connected with Keyv when throwOnConnectError is true", async () => {
		const keyv = createKeyv(redisBadUri, {
			throwOnConnectError: true,
			connectionTimeout: 500,
		});
		let didError = false;
		try {
			await keyv.get(faker.string.alphanumeric(10));
		} catch {
			didError = true;
		}

		expect(didError).toBe(true);
	});

	test("should apply connectionTimeout as socket.connectTimeout when constructing a client", () => {
		const keyvRedis = new KeyvRedis(redisUri, { connectionTimeout: 1234 });
		expect((keyvRedis.client as RedisClientType).options?.socket?.connectTimeout).toBe(1234);
		expect((keyvRedis.client as RedisClientType).options?.socket?.reconnectStrategy).toBe(false);
	});

	test("should not overwrite existing socket timeouts", () => {
		const keyvRedis = new KeyvRedis(
			{
				url: redisUri,
				socket: {
					connectTimeout: 999,
					socketTimeout: 888,
					reconnectStrategy: false,
				},
			},
			{ connectionTimeout: 50 },
		);
		expect((keyvRedis.client as RedisClientType).options?.socket?.connectTimeout).toBe(999);
		expect((keyvRedis.client as RedisClientType).options?.socket?.socketTimeout).toBe(888);
	});

	test("should construct cluster and sentinel clients with connectionTimeout", () => {
		const cluster = new KeyvRedis(
			{
				rootNodes: [{ url: "redis://localhost:7001" }],
			},
			{ connectionTimeout: 150 },
		);
		expect(cluster.isCluster()).toBe(true);

		const sentinel = new KeyvRedis(
			{
				name: "mymaster",
				sentinelRootNodes: [{ host: "127.0.0.1", port: 26_379 }],
			},
			{ connectionTimeout: 175 },
		);
		expect(sentinel.isSentinel()).toBe(true);
	});

	test("should abort a hung handshake without leaving sockets open", async () => {
		const server = await createHangServer();
		const keyvRedis = new KeyvRedis(`redis://127.0.0.1:${server.port}`, {
			connectionTimeout: 50,
		});
		keyvRedis.on("error", () => {});

		try {
			const started = Date.now();
			await expect(keyvRedis.getClient()).rejects.toThrow(
				RedisErrorMessages.RedisClientNotConnectedThrown,
			);
			expect(Date.now() - started).toBeLessThan(400);

			await waitForOpenSockets(server, 0);

			await expect(keyvRedis.getClient()).rejects.toThrow(
				RedisErrorMessages.RedisClientNotConnectedThrown,
			);
			await waitForOpenSockets(server, 0);
		} finally {
			await keyvRedis.disconnect(true);
			await server.close();
		}
	});

	test("should share one hung connect among concurrent getClient callers", async () => {
		const server = await createHangServer();
		const keyvRedis = new KeyvRedis(`redis://127.0.0.1:${server.port}`, {
			connectionTimeout: 50,
		});
		keyvRedis.on("error", () => {});

		try {
			const results = await Promise.allSettled([keyvRedis.getClient(), keyvRedis.getClient()]);
			expect(results.every((result) => result.status === "rejected")).toBe(true);
			await waitForOpenSockets(server, 0);
		} finally {
			await keyvRedis.disconnect(true);
			await server.close();
		}
	});

	test("should not throw on a hung handshake when throwOnConnectError is false", async () => {
		const server = await createHangServer();
		const keyvRedis = new KeyvRedis(`redis://127.0.0.1:${server.port}`, {
			connectionTimeout: 50,
			throwOnConnectError: false,
		});
		keyvRedis.on("error", () => {});

		try {
			const client = await keyvRedis.getClient();
			expect(client).toBeDefined();
			expect(client.isOpen).toBe(false);
			await waitForOpenSockets(server, 0);
		} finally {
			await keyvRedis.disconnect(true);
			await server.close();
		}
	});

	test("should abort a hung handshake on an injected client", async () => {
		const server = await createHangServer();
		const client = createClient({
			url: `redis://127.0.0.1:${server.port}`,
			socket: { reconnectStrategy: false },
		}) as RedisClientType;
		const keyvRedis = new KeyvRedis(client, { connectionTimeout: 50 });
		keyvRedis.on("error", () => {});

		try {
			await expect(keyvRedis.getClient()).rejects.toThrow(
				RedisErrorMessages.RedisClientNotConnectedThrown,
			);
			await waitForOpenSockets(server, 0);
			expect(keyvRedis.client).toBe(client);
			expect(() => {
				client.emit("error", new Error("late handshake error"));
			}).not.toThrow();
		} finally {
			await keyvRedis.disconnect(true);
			await server.close();
		}
	});

	test("should export defaultReconnectStrategy with exponential backoff and jitter", () => {
		const first = defaultReconnectStrategy(0);
		expect(first).toBeGreaterThanOrEqual(50);
		expect(first).toBeLessThanOrEqual(150);

		const capped = defaultReconnectStrategy(10);
		expect(capped).toBeGreaterThanOrEqual(1950);
		expect(capped).toBeLessThanOrEqual(2050);
	});

	test("should abort a hung handshake for createKeyvNonBlocking without throwing", async () => {
		const server = await createHangServer();
		const keyv = createKeyvNonBlocking(`redis://127.0.0.1:${server.port}`, {
			connectionTimeout: 50,
		});
		keyv.on("error", () => {});
		keyv.store.on("error", () => {});

		try {
			const value = await keyv.get(faker.string.alphanumeric(10));
			expect(value).toBeUndefined();
			await waitForOpenSockets(server, 0);
		} finally {
			await (keyv.store as KeyvRedis<string>).disconnect(true);
			await server.close();
		}
	});

	test("should keep a successful connection alive after connectionTimeout elapses", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { connectionTimeout: 50 });
		keyvRedis.on("error", () => {});
		const client = await keyvRedis.getClient();
		expect(client.isOpen).toBe(true);
		await delay(120);
		const key = faker.string.alphanumeric(10);
		expect(await keyvRedis.set(key, "ok")).toBe(true);
		expect(await keyvRedis.get(key)).toBe("ok");
		await keyvRedis.delete(key);
		await keyvRedis.disconnect(true);
	});

	test("should force disconnect a client that was never opened", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		await expect(keyvRedis.disconnect(true)).resolves.toBeUndefined();
	});
});
