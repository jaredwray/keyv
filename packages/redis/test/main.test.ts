import process from "node:process";
import { createClient, type RedisClientType } from "@redis/client";
import { beforeEach, describe, expect, test } from "vitest";
import KeyvRedis, {
	createKeyv,
	defaultReconnectStrategy,
} from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";

describe("KeyvRedis Module Loading", () => {
	test("should not create a Redis connection on module import", async () => {
		// This test verifies that importing the module doesn't create a default Redis connection.
		// The fix for issue #1805 ensures that createClient() is only called in the constructor,
		// not at module load time via class field initialization.
		//
		// We verify this by checking that KeyvRedis is a class (function) but doesn't have
		// any static Redis client properties that would indicate premature connection.
		expect(typeof KeyvRedis).toBe("function");
		expect(KeyvRedis.prototype).toBeDefined();

		// The class should only create a client when instantiated
		const instance = new KeyvRedis("redis://localhost:6379");
		expect(instance.client).toBeDefined();
		expect(instance.client.isOpen).toBe(false); // Not connected yet, just created
	});
});

describe("KeyvRedis", () => {
	test("should be a class", () => {
		expect(KeyvRedis).toBeInstanceOf(Function);
	});

	test("should have a client property", () => {
		const keyvRedis = new KeyvRedis();
		expect(keyvRedis.client).toBeDefined();
	});

	test("keeps v5 client defaults when KeyvRedis creates the client", () => {
		const keyvRedis = new KeyvRedis("redis://localhost:6379");
		const options = (keyvRedis.client as RedisClientType).options;
		const socket = options?.socket as
			| { keepAliveInitialDelay?: number; reconnectStrategy?: unknown }
			| undefined;
		expect(options?.RESP).toBe(2);
		expect(options?.commandOptions?.timeout).toBeUndefined();
		expect(socket?.keepAliveInitialDelay).toBe(5000);
		expect(socket?.reconnectStrategy).toBe(defaultReconnectStrategy);
		expect(() => {
			keyvRedis.emit("error", new Error("no listeners"));
		}).not.toThrow();
	});

	test("does not override explicit Redis client options", () => {
		const keyvRedis = new KeyvRedis({
			url: "redis://localhost:6379",
			RESP: 3,
			commandOptions: { timeout: 1500 },
			socket: { keepAliveInitialDelay: 1000 },
		});
		const options = (keyvRedis.client as RedisClientType).options;
		const socket = options?.socket as
			| { keepAliveInitialDelay?: number }
			| undefined;
		expect(options?.RESP).toBe(3);
		expect(options?.commandOptions?.timeout).toBe(1500);
		expect(socket?.keepAliveInitialDelay).toBe(1000);
	});

	test("leaves an existing Redis client unchanged", () => {
		const client = createClient({
			url: "redis://localhost:6379",
			RESP: 3,
		});
		const keyvRedis = new KeyvRedis(client);
		expect(keyvRedis.client).toBe(client);
		expect((keyvRedis.client as RedisClientType).options?.RESP).toBe(3);
	});

	test("keeps v5 defaults for cluster and sentinel clients it creates", () => {
		const cluster = new KeyvRedis({
			rootNodes: [{ url: "redis://127.0.0.1:7001" }],
		});
		const clusterOptions = (
			cluster.client as {
				_options?: {
					RESP?: number;
					commandOptions?: { timeout?: number };
					defaults?: {
						socket?: { keepAliveInitialDelay?: number };
						commandOptions?: { timeout?: number };
					};
					rootNodes?: Array<{ socket?: { keepAliveInitialDelay?: number } }>;
				};
			}
		)._options;
		expect(clusterOptions?.RESP).toBe(2);
		expect(clusterOptions?.commandOptions?.timeout).toBeUndefined();
		expect(clusterOptions?.defaults?.socket?.keepAliveInitialDelay).toBe(5000);
		expect(clusterOptions?.defaults?.commandOptions?.timeout).toBeUndefined();
		expect(clusterOptions?.rootNodes?.[0]?.socket?.keepAliveInitialDelay).toBe(
			5000,
		);

		const sentinel = new KeyvRedis({
			name: "mymaster",
			sentinelRootNodes: [{ host: "127.0.0.1", port: 26379 }],
		});
		expect(sentinel.isSentinel()).toBe(true);
		expect(
			(sentinel.client as { commandOptions?: { timeout?: number } })
				.commandOptions?.timeout,
		).toBeUndefined();
	});

	test("leaves a non-array rootNodes value unchanged", () => {
		const rootNodes = {
			map: (
				fn: (node: { socket?: { host?: string; port?: number } }) => unknown,
			) => [{ socket: { host: "127.0.0.1", port: 7001 } }].map(fn),
		};
		const cluster = new KeyvRedis({
			rootNodes: rootNodes as unknown as Array<{ url: string }>,
		});
		const clusterOptions = (
			cluster.client as {
				_options?: {
					rootNodes?: unknown;
					RESP?: number;
				};
			}
		)._options;
		expect(clusterOptions?.rootNodes).toBe(rootNodes);
		expect(clusterOptions?.RESP).toBe(2);
	});

	test("keeps hookified v1 logger and throwHookErrors names", () => {
		const keyvRedis = new KeyvRedis();
		const logger = {
			trace: () => undefined,
			debug: () => undefined,
			info: () => undefined,
			warn: () => undefined,
			error: () => undefined,
			fatal: () => undefined,
		};
		keyvRedis.logger = logger;
		keyvRedis.throwHookErrors = true;
		expect(keyvRedis.logger).toBe(logger);
		expect(keyvRedis.eventLogger).toBe(logger);
		expect(keyvRedis.throwHookErrors).toBe(true);
		expect(keyvRedis.throwOnHookError).toBe(true);
		keyvRedis.throwHookErrors = false;
		expect(keyvRedis.throwHookErrors).toBe(false);
		expect(keyvRedis.throwOnHookError).toBe(false);
	});

	test("keeps hookified v1 hook method signatures", async () => {
		const keyvRedis = new KeyvRedis();
		const calls: string[] = [];
		const handler = () => {
			calls.push("prepend");
		};
		const entry = () => {
			calls.push("entry");
		};
		keyvRedis.prependHook("ready", handler);
		keyvRedis.onceHook("ready", () => {
			calls.push("once");
		});
		keyvRedis.onHookEntry({ event: "ready", handler: entry });
		expect(keyvRedis.getHooks("ready")?.[0]).toBe(handler);
		await keyvRedis.hook("ready");
		await keyvRedis.hook("ready");
		keyvRedis.removeHook("ready", handler);
		keyvRedis.removeHook("ready", entry);
		await keyvRedis.hook("ready");
		expect(calls).toEqual(["prepend", "once", "entry", "prepend", "entry"]);
	});

	test("should be able to create Keyv instance", async () => {
		const keyv = createKeyv("redis://localhost:6379", { namespace: "test" });
		expect(keyv).toBeDefined();
		expect(keyv.namespace).toBe("test");
		expect(keyv.store.namespace).toBe("test");
		await keyv.set("mykey", "myvalue");
		await keyv.set("mykey2", { foo: "bar" });
		const value = await keyv.get<string>("mykey");
		expect(value).toBe("myvalue");
		const value2 = await keyv.get("mykey2");
		expect(value2).toEqual({ foo: "bar" });
	});

	test("should be able to set the client property", () => {
		const keyvRedis = new KeyvRedis();
		const client = createClient() as RedisClientType;
		keyvRedis.client = client;
		expect(keyvRedis.client).toBe(client);
	});

	test("should be able to pass in a client to constructor", () => {
		const client = createClient() as RedisClientType;
		const keyvRedis = new KeyvRedis(client);
		expect(keyvRedis.client).toBe(client);
	});

	test("should be able to pass in client options to constructor", () => {
		const uri = "redis://foo:6379";
		const keyvRedis = new KeyvRedis({ url: uri });
		expect((keyvRedis.client as RedisClientType).options?.url).toBe(uri);
	});

	test("should be able to pass in the url and options to constructor", () => {
		const uri = "redis://localhost:6379";
		const keyvRedis = new KeyvRedis(uri, { namespace: "test" });
		expect((keyvRedis.client as RedisClientType).options?.url).toBe(uri);
		expect(keyvRedis.namespace).toBe("test");
	});

	test("should be able to pass in the url and options to constructor", () => {
		const uri = "redis://localhost:6379";
		const options = {
			namespace: "test",
			keyPrefixSeparator: "->",
			clearBatchSize: 100,
			useUnlink: true,
			noNamespaceAffectsAll: true,
		};
		const keyvRedis = new KeyvRedis(uri, options);
		expect(keyvRedis.namespace).toBe("test");
		expect(keyvRedis.keyPrefixSeparator).toBe("->");
		expect(keyvRedis.clearBatchSize).toBe(100);
		expect(keyvRedis.useUnlink).toBe(true);
		expect(keyvRedis.noNamespaceAffectsAll).toBe(true);
	});

	test("should be able to get and set properties", () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.namespace = "test";
		keyvRedis.keyPrefixSeparator = "->";
		keyvRedis.clearBatchSize = 1001;
		keyvRedis.useUnlink = false;
		expect(keyvRedis.namespace).toBe("test");
		expect(keyvRedis.keyPrefixSeparator).toBe("->");
		expect(keyvRedis.clearBatchSize).toBe(1001);
		expect(keyvRedis.useUnlink).toBe(false);
	});

	test("keyPrefixSeparator should be able to set to blank string", () => {
		const keyvRedis = new KeyvRedis("redis://localhost:6379", {
			keyPrefixSeparator: "",
		});
		expect(keyvRedis.keyPrefixSeparator).toBe("");
		keyvRedis.keyPrefixSeparator = "->";
		expect(keyvRedis.keyPrefixSeparator).toBe("->");
		keyvRedis.keyPrefixSeparator = "";
		expect(keyvRedis.keyPrefixSeparator).toBe("");
	});

	test("clearBatchSize should not set if 0 or less than", () => {
		const keyvRedis = new KeyvRedis("redis://localhost:6379", {
			clearBatchSize: 0,
		});
		expect(keyvRedis.clearBatchSize).toBe(1000);
		keyvRedis.clearBatchSize = 200;
		expect(keyvRedis.clearBatchSize).toBe(200);
		let error = "";
		keyvRedis.on("error", (message) => {
			error = message as string;
		});
		keyvRedis.clearBatchSize = -1;
		expect(error).toBe("clearBatchSize must be greater than 0");
		expect(keyvRedis.clearBatchSize).toBe(200);
	});

	test("should be able to get and set opts", async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.opts = {
			namespace: "test",
			keyPrefixSeparator: ":1",
			clearBatchSize: 2000,
			noNamespaceAffectsAll: true,
		};

		expect(keyvRedis.opts).toEqual({
			namespace: "test",
			keyPrefixSeparator: ":1",
			clearBatchSize: 2000,
			dialect: "redis",
			url: "redis://localhost:6379",
			noNamespaceAffectsAll: true,
			throwOnErrors: false,
			throwOnConnectError: true,
			useUnlink: true,
		});
	});

	test("should get and set throwOnConnectError", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { throwOnConnectError: true });
		const client = await keyvRedis.getClient();
		expect(client).toBeDefined();

		expect(keyvRedis.throwOnConnectError).toBe(true);
		keyvRedis.throwOnConnectError = false;
		expect(keyvRedis.throwOnConnectError).toBe(false);
		keyvRedis.throwOnConnectError = true;
		expect(keyvRedis.throwOnConnectError).toBe(true);
	});

	test("should get and set throwOnErrors", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { throwOnErrors: true });
		const client = await keyvRedis.getClient();
		expect(client).toBeDefined();
		expect(keyvRedis.throwOnErrors).toBe(true);
		keyvRedis.throwOnErrors = false;
		expect(keyvRedis.throwOnErrors).toBe(false);
		keyvRedis.throwOnErrors = true;
		expect(keyvRedis.throwOnErrors).toBe(true);
	});
});

describe("KeyvRedis Methods", () => {
	beforeEach(async () => {
		const keyvRedis = new KeyvRedis();
		const client = (await keyvRedis.getClient()) as RedisClientType;
		await client.flushDb();
		await keyvRedis.disconnect();
	});
	test("should be able to connect, set, delete, and disconnect", async () => {
		const keyvRedis = new KeyvRedis();
		await keyvRedis.set("foo", "bar");
		const value = await keyvRedis.get("foo");
		expect(value).toBe("bar");
		const deleted = await keyvRedis.delete("foo");
		expect(deleted).toBe(true);
		await keyvRedis.disconnect();
	});

	test("should be able to connect, set, delete, and disconnect using useUnlink to false", async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.useUnlink = false;
		await keyvRedis.set("foo", "bar");
		const value = await keyvRedis.get("foo");
		expect(value).toBe("bar");
		const deleted = await keyvRedis.delete("foo");
		expect(deleted).toBe(true);
		await keyvRedis.disconnect();
	});

	test("should do nothing if no keys on clear", async () => {
		const keyvRedis = new KeyvRedis();
		const client = (await keyvRedis.getClient()) as RedisClientType;
		await client.flushDb();
		await keyvRedis.clear();
		keyvRedis.namespace = "ns1";
		await keyvRedis.clear();
		await keyvRedis.disconnect();
	});
});
