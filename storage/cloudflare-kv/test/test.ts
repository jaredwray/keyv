// biome-ignore-all lint/suspicious/noExplicitAny: this is a test file
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { faker } from "@faker-js/faker";
import { keyvIteratorTests, keyvTestSuite, storageTestSuite } from "@keyv/test-suite";
import { Keyv } from "keyv";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import KeyvCloudflareKV, {
	type CloudflareKVNamespace,
	type CloudflareKVPutOptions,
	CloudflareKVRestClient,
	createKeyv,
} from "../src/index.js";

// Everything below runs against a real local Cloudflare KV: the binding tests use the Miniflare
// namespace directly, and the REST tests use a tiny local HTTP bridge that implements the Cloudflare
// REST API on top of the SAME Miniflare namespace. No KV behavior is mocked.
let mf: Miniflare;
let kvNamespace: CloudflareKVNamespace;
let bridge: Bridge;

/** Controls the bridge can flex per-test to exercise pagination and error paths against real KV. */
type BridgeControls = {
	failIf: ((method: string, pathname: string) => boolean) | null;
	maxKeysPerPage: number;
};

type Bridge = {
	server: Server;
	url: string;
	accountId: string;
	namespaceId: string;
	apiToken: string;
	controls: BridgeControls;
};

/**
 * Starts an HTTP server that speaks the Cloudflare KV REST API and forwards every call to the
 * provided KV namespace (the local Miniflare instance). This lets the REST client run end-to-end
 * against real local storage.
 */
async function startBridge(kv: CloudflareKVNamespace): Promise<Bridge> {
	const accountId = "test-account";
	const namespaceId = "test-namespace";
	const apiToken = "test-token";
	const prefix = `/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}`;
	const controls: BridgeControls = { failIf: null, maxKeysPerPage: 1000 };

	const server = createServer(async (req, res) => {
		try {
			const requestUrl = new URL(req.url ?? "/", "http://localhost");
			const { pathname } = requestUrl;

			if (controls.failIf?.(req.method ?? "GET", pathname)) {
				res.writeHead(500);
				res.end("forced failure");
				return;
			}

			if (!pathname.startsWith(prefix)) {
				res.writeHead(404);
				res.end("not found");
				return;
			}

			const sub = pathname.slice(prefix.length);
			const chunks: Buffer[] = [];
			for await (const chunk of req) {
				chunks.push(chunk as Buffer);
			}
			const body = Buffer.concat(chunks);

			if (sub.startsWith("/values/")) {
				const key = decodeURIComponent(sub.slice("/values/".length));

				if (req.method === "GET") {
					const value = await kv.get(key);
					if (value === null) {
						res.writeHead(404);
						res.end();
						return;
					}
					res.writeHead(200, { "content-type": "text/plain" });
					res.end(value);
					return;
				}

				if (req.method === "PUT") {
					const contentType = req.headers["content-type"] ?? "";
					const options: CloudflareKVPutOptions = {};
					let value: string;
					if (contentType.startsWith("multipart/form-data")) {
						const form = await new Request("http://local", {
							method: "POST",
							headers: { "content-type": contentType },
							body,
						}).formData();
						value = String(form.get("value"));
						const metadata = form.get("metadata");
						if (metadata !== null) {
							options.metadata = JSON.parse(String(metadata));
						}
					} else {
						value = body.toString("utf8");
					}
					const ttl = requestUrl.searchParams.get("expiration_ttl");
					const expiration = requestUrl.searchParams.get("expiration");
					if (ttl) {
						options.expirationTtl = Number(ttl);
					}
					if (expiration) {
						options.expiration = Number(expiration);
					}
					await kv.put(key, value, options);
					res.writeHead(200);
					res.end(JSON.stringify({ success: true }));
					return;
				}

				if (req.method === "DELETE") {
					// Cloudflare returns 404 when the key is absent; mirror that so the client's
					// 404-tolerance is exercised against real behavior.
					const exists = (await kv.get(key)) !== null;
					if (!exists) {
						res.writeHead(404);
						res.end();
						return;
					}
					await kv.delete(key);
					res.writeHead(200);
					res.end(JSON.stringify({ success: true }));
					return;
				}
			}

			if (sub.startsWith("/metadata/")) {
				const key = decodeURIComponent(sub.slice("/metadata/".length));
				const { value, metadata } = await kv.getWithMetadata(key);
				// Cloudflare returns 404 when the key (or its metadata) is absent.
				if (value === null || metadata === null) {
					res.writeHead(404);
					res.end();
					return;
				}
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify({ success: true, result: metadata }));
				return;
			}

			if (sub.startsWith("/keys")) {
				const requestedLimit = Number(requestUrl.searchParams.get("limit") ?? "1000");
				const limit = Math.min(requestedLimit || 1000, controls.maxKeysPerPage);
				const result = await kv.list({
					prefix: requestUrl.searchParams.get("prefix") ?? undefined,
					cursor: requestUrl.searchParams.get("cursor") ?? undefined,
					limit,
				});
				res.writeHead(200, { "content-type": "application/json" });
				res.end(
					JSON.stringify({
						success: true,
						result: result.keys,
						result_info: { cursor: result.list_complete ? "" : (result.cursor ?? "") },
					}),
				);
				return;
			}

			res.writeHead(404);
			res.end("not found");
		} catch (error) {
			res.writeHead(500);
			res.end(String(error));
		}
	});

	await new Promise<void>((resolve) => server.listen(0, resolve));
	const { port } = server.address() as AddressInfo;

	return {
		server,
		url: `http://localhost:${port}/client/v4`,
		accountId,
		namespaceId,
		apiToken,
		controls,
	};
}

beforeAll(async () => {
	mf = new Miniflare({
		modules: true,
		script: "export default { fetch() { return new Response('ok'); } };",
		kvNamespaces: ["KV"],
	});
	kvNamespace = (await mf.getKVNamespace("KV")) as unknown as CloudflareKVNamespace;
	bridge = await startBridge(kvNamespace);
});

afterAll(async () => {
	await new Promise<void>((resolve) => bridge.server.close(() => resolve()));
	await mf.dispose();
});

const store = () => new KeyvCloudflareKV({ kvNamespace });
const restOptions = () => ({
	accountId: bridge.accountId,
	namespaceId: bridge.namespaceId,
	apiToken: bridge.apiToken,
	url: bridge.url,
});
const restStore = () => new KeyvCloudflareKV(restOptions());
const restClient = () => new CloudflareKVRestClient(restOptions());

beforeEach(async () => {
	bridge.controls.failIf = null;
	bridge.controls.maxKeysPerPage = 1000;
	await store().clear();
});

// Full compliance suites against the native binding (local Miniflare KV).
keyvTestSuite(it, Keyv, store as any);
keyvIteratorTests(it, Keyv, store as any);
storageTestSuite(it, store as any);

// Storage-level compliance against the REST path, end-to-end against the same local KV.
describe("REST adapter compliance", () => {
	storageTestSuite(it, restStore as any);
});

describe("construction", () => {
	it("should accept a KV binding directly", async () => {
		const s = new KeyvCloudflareKV(kvNamespace);
		expect(s.client).toBe(kvNamespace);
		const key = faker.string.uuid();
		await s.set(key, "value");
		expect(await s.get(key)).toBe("value");
	});

	it("should accept a KV binding via the kvNamespace option", () => {
		const s = new KeyvCloudflareKV({ kvNamespace });
		expect(s.client).toBe(kvNamespace);
	});

	it("should expose and replace the client", () => {
		const s = new KeyvCloudflareKV({ kvNamespace });
		const replacement = restClient();
		s.client = replacement;
		expect(s.client).toBe(replacement);
	});

	it("should construct a REST client from credentials", () => {
		const s = new KeyvCloudflareKV(restOptions());
		expect(s.client).toBeInstanceOf(CloudflareKVRestClient);
	});

	it("should default to bind mode and infer rest from credentials", () => {
		expect(new KeyvCloudflareKV({ kvNamespace }).mode).toBe("bind");
		expect(new KeyvCloudflareKV(kvNamespace).mode).toBe("bind");
		expect(new KeyvCloudflareKV(restOptions()).mode).toBe("rest");
	});

	it("should honor an explicit rest mode", () => {
		const s = new KeyvCloudflareKV({ ...restOptions(), mode: "rest" });
		expect(s.mode).toBe("rest");
		expect(s.client).toBeInstanceOf(CloudflareKVRestClient);
	});

	it("should honor an explicit bind mode", () => {
		const s = new KeyvCloudflareKV({ kvNamespace, mode: "bind" });
		expect(s.mode).toBe("bind");
		expect(s.client).toBe(kvNamespace);
	});

	it("should throw when bind mode has no binding", () => {
		expect(() => new KeyvCloudflareKV({})).toThrow(/'bind' mode requires/);
		expect(() => new KeyvCloudflareKV(undefined as any)).toThrow(/'bind' mode requires/);
		expect(() => new KeyvCloudflareKV({ ...restOptions(), mode: "bind" })).toThrow(
			/'bind' mode requires/,
		);
	});

	it("should set the namespace and separator from options", () => {
		const s = new KeyvCloudflareKV({ kvNamespace, namespace: "ns", keyPrefixSeparator: "::" });
		expect(s.namespace).toBe("ns");
		expect(s.keyPrefixSeparator).toBe("::");
	});
});

describe("namespace and key prefixing", () => {
	it("should format a key with the namespace and avoid double prefixing", () => {
		const s = new KeyvCloudflareKV({ kvNamespace });
		s.namespace = "ns";
		expect(s.formatKey("key")).toBe("ns:key");
		expect(s.formatKey("ns:key")).toBe("ns:key");
		s.namespace = undefined;
		expect(s.formatKey("key")).toBe("key");
	});

	it("should create and remove a key prefix when a namespace is provided", () => {
		const s = new KeyvCloudflareKV({ kvNamespace });
		expect(s.createKeyPrefix("key", "ns")).toBe("ns:key");
		expect(s.createKeyPrefix("key")).toBe("key");
		expect(s.removeKeyPrefix("ns:key", "ns")).toBe("key");
		expect(s.removeKeyPrefix("key")).toBe("key");
	});

	it("should get and set the keyPrefixSeparator", () => {
		const s = new KeyvCloudflareKV({ kvNamespace });
		expect(s.keyPrefixSeparator).toBe(":");
		s.keyPrefixSeparator = "::";
		expect(s.createKeyPrefix("key", "ns")).toBe("ns::key");
	});

	it("should isolate values across namespaces", async () => {
		const s1 = new KeyvCloudflareKV({ kvNamespace, namespace: faker.string.alphanumeric(8) });
		const s2 = new KeyvCloudflareKV({ kvNamespace, namespace: faker.string.alphanumeric(8) });
		const key = faker.string.uuid();
		await s1.set(key, "one");
		await s2.set(key, "two");
		expect(await s1.get(key)).toBe("one");
		expect(await s2.get(key)).toBe("two");
	});
});

describe("get, set, delete, has", () => {
	it("should round-trip various data types through Keyv", async () => {
		// Keyv owns serialization; the adapter stores the serialized string. Drive these through a
		// Keyv instance so non-string values are serialized before reaching the adapter.
		const keyv = createKeyv({ kvNamespace });
		const cases: unknown[] = [
			faker.lorem.sentence(),
			faker.number.float({ max: 1000 }),
			faker.datatype.boolean(),
			{ a: 1, b: { c: [1, 2, 3] }, d: faker.lorem.word() },
			[1, "two", true, { x: 1 }],
		];
		for (const value of cases) {
			const key = faker.string.uuid();
			await keyv.set(key, value);
			expect(await keyv.get(key)).toEqual(value);
		}
	});

	it("should store the value verbatim with no adapter-level envelope", async () => {
		// Keyv handles serialization, so the adapter must not wrap the value in its own JSON.
		const s = store();
		const key = faker.string.uuid();
		const serialized = JSON.stringify({ value: "hello" });
		await s.set(key, serialized);
		// The raw KV value is exactly what was passed in — not re-wrapped.
		expect(await kvNamespace.get(s.formatKey(key))).toBe(serialized);
		expect(await s.get(key)).toBe(serialized);
	});

	it("should coerce a non-string value passed directly to the adapter", async () => {
		const s = store();
		const key = faker.string.uuid();
		await s.set(key, 123);
		expect(await s.get(key)).toBe("123");
	});

	it("should return undefined for a missing key", async () => {
		const s = store();
		expect(await s.get(faker.string.uuid())).toBeUndefined();
	});

	it("should return false when deleting a missing key", async () => {
		const s = store();
		expect(await s.delete(faker.string.uuid())).toBe(false);
	});

	it("should report has correctly before and after delete", async () => {
		const s = store();
		const key = faker.string.uuid();
		await s.set(key, "value");
		expect(await s.has(key)).toBe(true);
		expect(await s.delete(key)).toBe(true);
		expect(await s.has(key)).toBe(false);
	});
});

describe("batch operations", () => {
	it("should set, get, has, and delete many", async () => {
		const s = store();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const missing = faker.string.uuid();
		const results = await s.setMany([
			{ key: key1, value: "one", expires: Date.now() + 120_000 },
			{ key: key2, value: "two" },
		]);
		expect(results).toEqual([true, true]);
		expect(await s.getMany([key1, key2, missing])).toEqual(["one", "two", undefined]);
		expect(await s.hasMany([key1, key2, missing])).toEqual([true, true, false]);
		expect(await s.deleteMany([key1, key2, missing])).toEqual([true, true, false]);
	});
});

describe("expiration", () => {
	it("should expire values via the client-side check", async () => {
		const s = store();
		const key = faker.string.uuid();
		await s.set(key, "value", Date.now() + 100);
		expect(await s.get(key)).toBe("value");
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(await s.get(key)).toBeUndefined();
		expect(await s.has(key)).toBe(false);
	});

	it("should not persist an already-elapsed deadline", async () => {
		const s = store();
		const key = faker.string.uuid();
		await s.set(key, "value", Date.now() - 1000);
		expect(await s.get(key)).toBeUndefined();
	});

	it("should store the precise expiry in KV metadata", async () => {
		const s = store();
		const key = faker.string.uuid();
		const expires = Date.now() + 250;
		await s.set(key, "value", expires);
		const { metadata } = await kvNamespace.getWithMetadata(s.formatKey(key));
		expect((metadata as { e: number }).e).toBe(expires);
	});

	it("should attach a native KV expiration for long TTLs", async () => {
		const s = store();
		const key = faker.string.uuid();
		await s.set(key, "value", Date.now() + 5 * 60 * 1000);
		// Observe via the real KV: the key carries a native expiration set by KV itself.
		const { keys } = await kvNamespace.list({ prefix: key });
		const entry = keys.find((k) => k.name === key);
		expect(entry?.expiration).toBeTypeOf("number");
	});

	it("should not attach a native KV expiration for short TTLs", async () => {
		const s = store();
		const key = faker.string.uuid();
		await s.set(key, "value", Date.now() + 1000);
		const { keys } = await kvNamespace.list({ prefix: key });
		const entry = keys.find((k) => k.name === key);
		expect(entry?.expiration).toBeUndefined();
	});

	it("should store and serve a key at exactly the 60s minimum without a native expiration", async () => {
		const s = store();
		const key = faker.string.uuid();
		// A 60s TTL floors to 60, which is not strictly greater than the minimum, so it is served by
		// the client-side check only — never sent to KV where latency could reject it.
		expect(await s.set(key, "value", Date.now() + 60_000)).toBe(true);
		expect(await s.get(key)).toBe("value");
		const { keys } = await kvNamespace.list({ prefix: key });
		expect(keys.find((k) => k.name === key)?.expiration).toBeUndefined();
	});
});

describe("clear and iterator", () => {
	it("should clear only namespaced keys when a namespace is set", async () => {
		const ns = new KeyvCloudflareKV({ kvNamespace, namespace: faker.string.alphanumeric(8) });
		const plain = store();
		const nsKey = faker.string.uuid();
		const plainKey = faker.string.uuid();
		await ns.set(nsKey, "ns-value");
		await plain.set(plainKey, "plain-value");

		await ns.clear();
		expect(await ns.get(nsKey)).toBeUndefined();
		expect(await plain.get(plainKey)).toBe("plain-value");
	});

	it("should clear every key when the batch size is small", async () => {
		const s = store();
		s.clearBatchSize = 2;
		expect(s.clearBatchSize).toBe(2);
		const keys = Array.from({ length: 5 }, () => faker.string.uuid());
		for (const key of keys) {
			await s.set(key, "value");
		}
		await s.clear();
		for (const key of keys) {
			expect(await s.get(key)).toBeUndefined();
		}
	});

	it("should iterate over all entries with no namespace", async () => {
		const s = store();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		await s.set(key1, "val1");
		await s.set(key2, "val2");

		const collected = new Map<string, unknown>();
		for await (const [key, value] of s.iterator()) {
			collected.set(key as string, value);
		}
		expect(collected.get(key1)).toBe("val1");
		expect(collected.get(key2)).toBe("val2");
	});

	it("should follow REST pagination cursors when listing many keys", async () => {
		// Force the bridge to return one key per page so the client must follow cursors against
		// the real KV listing.
		bridge.controls.maxKeysPerPage = 1;
		const s = restStore();
		const keys = Array.from({ length: 3 }, () => faker.string.uuid());
		for (const key of keys) {
			await s.set(key, "value");
		}

		const collected: string[] = [];
		for await (const [key] of s.iterator()) {
			collected.push(key as string);
		}
		expect(collected.sort()).toEqual([...keys].sort());
	});
});

describe("error handling", () => {
	it("should emit an error and return false when set fails", async () => {
		const s = restStore();
		const handler = vi.fn();
		s.on("error", handler);
		bridge.controls.failIf = () => true;
		expect(await s.set("key", "value")).toBe(false);
		expect(handler).toHaveBeenCalled();
	});

	it("should emit an error and return undefined when get fails", async () => {
		const s = restStore();
		const handler = vi.fn();
		s.on("error", handler);
		bridge.controls.failIf = () => true;
		expect(await s.get("key")).toBeUndefined();
		expect(handler).toHaveBeenCalled();
	});

	it("should emit an error and return false when delete fails", async () => {
		const s = restStore();
		const handler = vi.fn();
		s.on("error", handler);
		bridge.controls.failIf = () => true;
		expect(await s.delete("key")).toBe(false);
		expect(handler).toHaveBeenCalled();
	});

	it("should emit an error and return false when has fails", async () => {
		const s = restStore();
		const handler = vi.fn();
		s.on("error", handler);
		bridge.controls.failIf = () => true;
		expect(await s.has("key")).toBe(false);
		expect(handler).toHaveBeenCalled();
	});

	it("should swallow errors in clear", async () => {
		const s = restStore();
		s.on("error", () => {});
		bridge.controls.failIf = (_method, pathname) => pathname.includes("/keys");
		await expect(s.clear()).resolves.toBeUndefined();
	});
});

describe("disconnect", () => {
	it("should resolve without error", async () => {
		const s = store();
		await expect(s.disconnect()).resolves.toBeUndefined();
	});
});

describe("createKeyv", () => {
	it("should create a Keyv instance with no namespace", () => {
		const keyv = createKeyv({ kvNamespace });
		expect(keyv).toBeInstanceOf(Keyv);
		expect(keyv.store).toBeInstanceOf(KeyvCloudflareKV);
		expect(keyv.namespace).toBeUndefined();
	});

	it("should create a Keyv instance with a namespace", () => {
		const namespace = faker.string.alphanumeric(8);
		const keyv = createKeyv({ kvNamespace, namespace });
		expect(keyv.namespace).toBe(namespace);
		expect((keyv.store as KeyvCloudflareKV).namespace).toBe(namespace);
	});

	it("should create a Keyv instance from a binding directly", () => {
		const keyv = createKeyv(kvNamespace);
		expect(keyv.store).toBeInstanceOf(KeyvCloudflareKV);
		expect(keyv.namespace).toBeUndefined();
	});

	it("should store and retrieve through the Keyv instance", async () => {
		const keyv = createKeyv({ kvNamespace });
		const key = faker.string.uuid();
		await keyv.set(key, "value");
		expect(await keyv.get(key)).toBe("value");
		await keyv.delete(key);
		expect(await keyv.get(key)).toBeUndefined();
	});
});

describe("CloudflareKVRestClient", () => {
	it("should require all credentials", () => {
		expect(() => new CloudflareKVRestClient({ ...restOptions(), apiToken: "" })).toThrow(
			/requires/,
		);
	});

	it("should default to the Cloudflare base url when none is given", () => {
		const client = new CloudflareKVRestClient({ accountId: "a", namespaceId: "n", apiToken: "t" });
		expect(client).toBeInstanceOf(CloudflareKVRestClient);
	});

	it("should round-trip a value with metadata against local KV", async () => {
		const client = restClient();
		const key = faker.string.uuid();
		const expires = Date.now() + 120_000;
		await client.put(key, "hello", { metadata: { e: expires } });
		expect(await client.get(key)).toBe("hello");
		const result = await client.getWithMetadata(key);
		expect(result.value).toBe("hello");
		expect(result.metadata).toEqual({ e: expires });
	});

	it("should return null and empty metadata for a missing key", async () => {
		const client = restClient();
		expect(await client.get(faker.string.uuid())).toBeNull();
		expect(await client.getWithMetadata(faker.string.uuid())).toEqual({
			value: null,
			metadata: null,
		});
	});

	it("should send native expiration query params to local KV", async () => {
		const client = restClient();
		const absolute = faker.string.uuid();
		await client.put(absolute, "value", { expiration: Math.floor(Date.now() / 1000) + 120 });
		expect(await client.get(absolute)).toBe("value");

		const relative = faker.string.uuid();
		await client.put(relative, "value", { expirationTtl: 120 });
		expect(await client.get(relative)).toBe("value");
	});

	it("should return null metadata for a key written without metadata", async () => {
		const client = restClient();
		const key = faker.string.uuid();
		await client.put(key, "plain");
		const result = await client.getWithMetadata(key);
		expect(result.value).toBe("plain");
		expect(result.metadata).toBeNull();
	});

	it("should tolerate deleting a missing key", async () => {
		const client = restClient();
		await expect(client.delete(faker.string.uuid())).resolves.toBeUndefined();
	});

	it("should list keys and report completion", async () => {
		const client = restClient();
		const key = faker.string.uuid();
		await client.put(key, "value");
		const result = await client.list({ prefix: key, limit: 100 });
		expect(result.keys.map((k) => k.name)).toContain(key);
		expect(result.list_complete).toBe(true);
		expect(result.cursor).toBeUndefined();
	});

	it("should report more pages when a cursor is returned", async () => {
		bridge.controls.maxKeysPerPage = 1;
		const client = restClient();
		await client.put(faker.string.uuid(), "a");
		await client.put(faker.string.uuid(), "b");
		const result = await client.list();
		expect(result.list_complete).toBe(false);
		expect(result.cursor).toBeTruthy();
	});

	it("should honor a custom base url with a trailing slash", async () => {
		const client = new CloudflareKVRestClient({ ...restOptions(), url: `${bridge.url}/` });
		const key = faker.string.uuid();
		await client.put(key, "value");
		expect(await client.get(key)).toBe("value");
	});

	it("should throw on a failed get", async () => {
		const client = restClient();
		bridge.controls.failIf = () => true;
		await expect(client.get("key")).rejects.toThrow(/get failed/);
	});

	it("should throw on a failed put", async () => {
		const client = restClient();
		bridge.controls.failIf = () => true;
		await expect(client.put("key", "value")).rejects.toThrow(/put failed/);
	});

	it("should throw on a failed put with metadata", async () => {
		const client = restClient();
		bridge.controls.failIf = () => true;
		await expect(client.put("key", "value", { metadata: { e: 1 } })).rejects.toThrow(/put failed/);
	});

	it("should throw on a failed delete", async () => {
		const client = restClient();
		const key = faker.string.uuid();
		await client.put(key, "value");
		bridge.controls.failIf = () => true;
		await expect(client.delete(key)).rejects.toThrow(/delete failed/);
	});

	it("should throw on a failed metadata read", async () => {
		const client = restClient();
		const key = faker.string.uuid();
		await client.put(key, "value", { metadata: { e: Date.now() + 1000 } });
		bridge.controls.failIf = (_method, pathname) => pathname.includes("/metadata/");
		await expect(client.getWithMetadata(key)).rejects.toThrow(/metadata get failed/);
	});

	it("should throw on a failed list", async () => {
		const client = restClient();
		bridge.controls.failIf = () => true;
		await expect(client.list()).rejects.toThrow(/list failed/);
	});
});
