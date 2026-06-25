// biome-ignore-all lint/suspicious/noExplicitAny: this is a test file
import { faker } from "@faker-js/faker";
import { keyvIteratorTests, keyvTestSuite, storageTestSuite } from "@keyv/test-suite";
import { Keyv } from "keyv";
import { Miniflare } from "miniflare";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import KeyvCloudflareKV, {
	type CloudflareKVNamespace,
	CloudflareKVRestClient,
	createKeyv,
} from "../src/index.js";

// A single local Miniflare-backed KV namespace is shared across the suite. Tests run sequentially
// within the file, and `beforeEach` clears the namespace so each test starts from a clean slate.
let mf: Miniflare;
let kvNamespace: CloudflareKVNamespace;

beforeAll(async () => {
	mf = new Miniflare({
		modules: true,
		script: "export default { fetch() { return new Response('ok'); } };",
		kvNamespaces: ["KV"],
	});
	kvNamespace = (await mf.getKVNamespace("KV")) as unknown as CloudflareKVNamespace;
});

afterAll(async () => {
	await mf.dispose();
});

const store = () => new KeyvCloudflareKV({ kvNamespace });

// A deterministic in-process KV used by the spy/mock-based tests below. Miniflare's namespace is a
// proxy whose methods can't be replaced by `vi.spyOn`, so those tests use this plain object instead.
function makeFakeKV(): CloudflareKVNamespace {
	const map = new Map<string, string>();
	return {
		async get(key) {
			return map.has(key) ? (map.get(key) as string) : null;
		},
		async put(key, value) {
			map.set(key, value);
		},
		async delete(key) {
			map.delete(key);
		},
		async list(options) {
			const prefix = options?.prefix ?? "";
			const keys = [...map.keys()]
				.filter((name) => name.startsWith(prefix))
				.map((name) => ({ name }));
			return { keys, list_complete: true };
		},
	};
}

const fakeStore = () => new KeyvCloudflareKV({ kvNamespace: makeFakeKV() });

beforeEach(async () => {
	await store().clear();
});

keyvTestSuite(it, Keyv, store as any);
keyvIteratorTests(it, Keyv, store as any);
storageTestSuite(it, store as any);

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
		const replacement = { ...kvNamespace } as CloudflareKVNamespace;
		s.client = replacement;
		expect(s.client).toBe(replacement);
	});

	it("should construct a REST client from credentials", () => {
		const s = new KeyvCloudflareKV({
			accountId: "account",
			namespaceId: "namespace",
			apiToken: "token",
		});
		expect(s.client).toBeInstanceOf(CloudflareKVRestClient);
	});

	it("should throw when neither a binding nor credentials are provided", () => {
		expect(() => new KeyvCloudflareKV({})).toThrow(/requires either/);
		expect(() => new KeyvCloudflareKV(undefined as any)).toThrow(/requires either/);
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
	it("should round-trip various data types", async () => {
		const s = store();
		const cases: Array<[string, unknown]> = [
			["string", faker.lorem.sentence()],
			["number", faker.number.float({ max: 1000 })],
			["boolean", faker.datatype.boolean()],
			["object", { a: 1, b: { c: [1, 2, 3] }, d: faker.lorem.word() }],
			["array", [1, "two", true, { x: 1 }]],
			["null", null],
		];
		for (const [, value] of cases) {
			const key = faker.string.uuid();
			await s.set(key, value);
			expect(await s.get(key)).toEqual(value);
		}
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

	it("should read a raw non-envelope value written outside the adapter", async () => {
		const s = store();
		const key = faker.string.uuid();
		await kvNamespace.put(s.formatKey(key), "plain-string");
		expect(await s.get(key)).toBe("plain-string");

		const jsonKey = faker.string.uuid();
		await kvNamespace.put(s.formatKey(jsonKey), JSON.stringify({ unrelated: true }));
		expect(await s.get(jsonKey)).toEqual({ unrelated: true });
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

	it("should attach a native expirationTtl for long TTLs", async () => {
		const s = fakeStore();
		const key = faker.string.uuid();
		const putSpy = vi.spyOn(s.client, "put");
		await s.set(key, "value", Date.now() + 5 * 60 * 1000);
		expect(putSpy).toHaveBeenCalledWith(
			s.formatKey(key),
			expect.any(String),
			expect.objectContaining({ expirationTtl: expect.any(Number) }),
		);
		const options = putSpy.mock.calls[0][2] as { expirationTtl: number };
		// Never below Cloudflare's 60s minimum, even after the floor + safety margin.
		expect(options.expirationTtl).toBeGreaterThan(60);
		expect(options.expirationTtl).toBeLessThanOrEqual(300);
	});

	it("should not attach a native expiration for short TTLs", async () => {
		const s = fakeStore();
		const key = faker.string.uuid();
		const putSpy = vi.spyOn(s.client, "put");
		await s.set(key, "value", Date.now() + 1000);
		expect(putSpy).toHaveBeenCalledWith(s.formatKey(key), expect.any(String), {});
	});

	it("should not attach a native expiration at exactly the 60s minimum", async () => {
		const s = fakeStore();
		const key = faker.string.uuid();
		const putSpy = vi.spyOn(s.client, "put");
		// A 60s TTL floors to 60, which is not strictly greater than the minimum, so it is
		// served by client-side expiry only — never sent to KV where latency could reject it.
		expect(await s.set(key, "value", Date.now() + 60_000)).toBe(true);
		expect(putSpy).toHaveBeenCalledWith(s.formatKey(key), expect.any(String), {});
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

	it("should clear keys in batches", async () => {
		const s = fakeStore();
		s.clearBatchSize = 2;
		expect(s.clearBatchSize).toBe(2);
		const keys = ["a", "b", "c", "d", "e"];
		for (const key of keys) {
			await s.set(key, "value");
		}
		const deleteSpy = vi.spyOn(s.client, "delete");
		await s.clear();
		expect(deleteSpy).toHaveBeenCalledTimes(keys.length);
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

	it("should paginate when listing more keys than a single page", async () => {
		const s = fakeStore();
		const calls: Array<{ cursor?: string }> = [];
		let call = 0;
		const realList = s.client.list.bind(s.client);
		vi.spyOn(s.client, "list").mockImplementation(async (options) => {
			calls.push({ cursor: options?.cursor });
			call += 1;
			if (call === 1) {
				return { keys: [{ name: "a" }], list_complete: false, cursor: "next" };
			}
			return realList({ ...options, cursor: undefined });
		});

		await s.set("a", "value");
		const names: string[] = [];
		for await (const entry of s.iterator()) {
			names.push(entry[0] as string);
		}
		expect(call).toBeGreaterThanOrEqual(2);
		expect(calls[1]?.cursor).toBe("next");
	});
});

describe("error handling", () => {
	it("should emit an error and return false when set fails", async () => {
		const s = fakeStore();
		const handler = vi.fn();
		s.on("error", handler);
		vi.spyOn(s.client, "put").mockRejectedValueOnce(new Error("boom"));
		expect(await s.set("key", "value")).toBe(false);
		expect(handler).toHaveBeenCalled();
	});

	it("should emit an error and return undefined when get fails", async () => {
		const s = fakeStore();
		const handler = vi.fn();
		s.on("error", handler);
		vi.spyOn(s.client, "get").mockRejectedValueOnce(new Error("boom"));
		expect(await s.get("key")).toBeUndefined();
		expect(handler).toHaveBeenCalled();
	});

	it("should emit an error and return false when delete fails", async () => {
		const s = fakeStore();
		const handler = vi.fn();
		s.on("error", handler);
		await s.set("key", "value");
		vi.spyOn(s.client, "delete").mockRejectedValueOnce(new Error("boom"));
		expect(await s.delete("key")).toBe(false);
		expect(handler).toHaveBeenCalled();
	});

	it("should emit an error and return false when has fails", async () => {
		const s = fakeStore();
		const handler = vi.fn();
		s.on("error", handler);
		vi.spyOn(s.client, "get").mockRejectedValueOnce(new Error("boom"));
		expect(await s.has("key")).toBe(false);
		expect(handler).toHaveBeenCalled();
	});

	it("should swallow errors in clear", async () => {
		const s = fakeStore();
		s.on("error", () => {});
		vi.spyOn(s.client, "list").mockRejectedValueOnce(new Error("boom"));
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
	const baseOptions = {
		accountId: "account",
		namespaceId: "namespace",
		apiToken: "token",
	};
	const expectedBase =
		"https://api.cloudflare.com/client/v4/accounts/account/storage/kv/namespaces/namespace";

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should require all credentials", () => {
		expect(() => new CloudflareKVRestClient({ ...baseOptions, apiToken: "" })).toThrow(/requires/);
	});

	it("should get a value", async () => {
		const client = new CloudflareKVRestClient(baseOptions);
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("hello", { status: 200 }));
		expect(await client.get("my key")).toBe("hello");
		const [url, init] = fetchSpy.mock.calls[0];
		expect(String(url)).toBe(`${expectedBase}/values/my%20key`);
		expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token" });
	});

	it("should return null on a 404 get", async () => {
		const client = new CloudflareKVRestClient(baseOptions);
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));
		expect(await client.get("missing")).toBeNull();
	});

	it("should throw on a failed get", async () => {
		const client = new CloudflareKVRestClient(baseOptions);
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
		await expect(client.get("key")).rejects.toThrow(/get failed/);
	});

	it("should put a value with expiration", async () => {
		const client = new CloudflareKVRestClient(baseOptions);
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("", { status: 200 }));
		await client.put("key", "value", { expiration: 1234567890, expirationTtl: 120 });
		const [url, init] = fetchSpy.mock.calls[0];
		expect(String(url)).toContain("expiration=1234567890");
		expect(String(url)).toContain("expiration_ttl=120");
		expect((init as RequestInit).method).toBe("PUT");
		expect((init as RequestInit).body).toBe("value");
	});

	it("should throw on a failed put", async () => {
		const client = new CloudflareKVRestClient(baseOptions);
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad", { status: 400 }));
		await expect(client.put("key", "value")).rejects.toThrow(/put failed/);
	});

	it("should delete a value and tolerate 404", async () => {
		const client = new CloudflareKVRestClient(baseOptions);
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(new Response("", { status: 200 }))
			.mockResolvedValueOnce(new Response("", { status: 404 }));
		await client.delete("key");
		await client.delete("missing");
		expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
	});

	it("should throw on a failed delete", async () => {
		const client = new CloudflareKVRestClient(baseOptions);
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad", { status: 500 }));
		await expect(client.delete("key")).rejects.toThrow(/delete failed/);
	});

	it("should list keys and signal completion via the cursor", async () => {
		const client = new CloudflareKVRestClient(baseOptions);
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({ result: [{ name: "k1" }, { name: "k2" }], result_info: { cursor: "" } }),
				{ status: 200 },
			),
		);
		const result = await client.list({ prefix: "p", limit: 100, cursor: "c" });
		expect(result.keys).toHaveLength(2);
		expect(result.list_complete).toBe(true);
	});

	it("should default to an empty key list when the response omits results", async () => {
		const client = new CloudflareKVRestClient(baseOptions);
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({}), { status: 200 }),
		);
		const result = await client.list();
		expect(result.keys).toEqual([]);
		expect(result.list_complete).toBe(true);
	});

	it("should report more pages when a cursor is returned", async () => {
		const client = new CloudflareKVRestClient(baseOptions);
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ result: [], result_info: { cursor: "more" } }), {
				status: 200,
			}),
		);
		const result = await client.list();
		expect(result.list_complete).toBe(false);
		expect(result.cursor).toBe("more");
	});

	it("should throw on a failed list", async () => {
		const client = new CloudflareKVRestClient(baseOptions);
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad", { status: 500 }));
		await expect(client.list()).rejects.toThrow(/list failed/);
	});

	it("should honor a custom base url", async () => {
		const client = new CloudflareKVRestClient({ ...baseOptions, url: "https://example.com/v4/" });
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("v", { status: 200 }));
		await client.get("key");
		expect(String(fetchSpy.mock.calls[0][0])).toContain(
			"https://example.com/v4/accounts/account/storage/kv/namespaces/namespace/values/key",
		);
	});
});
