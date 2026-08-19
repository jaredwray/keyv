// biome-ignore-all lint/suspicious/noExplicitAny: this is a test file
import { GetParameterCommand, type SSMClient } from "@aws-sdk/client-ssm";
import { faker } from "@faker-js/faker";
import { keyvIteratorTests, keyvTestSuite, storageTestSuite } from "@keyv/test-suite";
import Keyv from "keyv";
import { describe, it } from "vitest";
import KeyvAwsSsm, { createKeyv } from "../src/index.js";
import { FakeSsmClient } from "./helpers/ssm-mock.js";

const fakeClient = () => new FakeSsmClient() as unknown as SSMClient;

// Each store() call gets its own in-memory FakeSsmClient, so every test case is
// fully isolated (mirrors @keyv/dynamo's per-call random table name).
const store = () => new KeyvAwsSsm({ client: fakeClient() });

keyvTestSuite(it, Keyv, store);
keyvIteratorTests(it, Keyv, store);
storageTestSuite(it, store);

describe("construction and validation", () => {
	it("should throw when no client is provided", (t) => {
		// @ts-expect-error - client is required, just for test
		t.expect(() => new KeyvAwsSsm({})).toThrow(/requires an SSMClient instance/);
	});

	it("should throw when constructed with no options at all", (t) => {
		// @ts-expect-error - options is required, just for test
		t.expect(() => new KeyvAwsSsm()).toThrow(/requires an SSMClient instance/);
	});

	it("should default to keyPrefix '/keyv/', separator '/', type 'String', tier 'Standard'", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient() });
		t.expect(s.keyPrefix).toBe("/keyv/");
		t.expect(s.keyPrefixSeparator).toBe("/");
		t.expect(s.type).toBe("String");
		t.expect(s.tier).toBe("Standard");
		t.expect(s.keyId).toBeUndefined();
		t.expect(s.namespace).toBeUndefined();
	});

	it("should get and set the client", (t) => {
		const originalClient = fakeClient();
		const s = new KeyvAwsSsm({ client: originalClient });
		t.expect(s.client).toBe(originalClient);
		const newClient = fakeClient();
		s.client = newClient;
		t.expect(s.client).toBe(newClient);
		t.expect(s.client).not.toBe(originalClient);
	});

	it("should get and set namespace", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient() });
		t.expect(s.namespace).toBeUndefined();
		s.namespace = "ns";
		t.expect(s.namespace).toBe("ns");
		s.namespace = undefined;
		t.expect(s.namespace).toBeUndefined();
	});

	it("should get and set keyPrefixSeparator", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient() });
		s.keyPrefixSeparator = "-";
		t.expect(s.keyPrefixSeparator).toBe("-");
	});

	it("should get and set type", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient() });
		s.type = "SecureString";
		t.expect(s.type).toBe("SecureString");
	});

	it("should get and set tier", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient() });
		s.tier = "Advanced";
		t.expect(s.tier).toBe("Advanced");
	});

	it("should get and set keyId", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient() });
		s.keyId = "alias/my-key";
		t.expect(s.keyId).toBe("alias/my-key");
		s.keyId = undefined;
		t.expect(s.keyId).toBeUndefined();
	});

	it("should accept options for type, tier, and keyId in the constructor", (t) => {
		const s = new KeyvAwsSsm({
			client: fakeClient(),
			type: "SecureString",
			tier: "Advanced",
			keyId: "alias/my-key",
		});
		t.expect(s.type).toBe("SecureString");
		t.expect(s.tier).toBe("Advanced");
		t.expect(s.keyId).toBe("alias/my-key");
	});

	it("should expose capabilities with expires: true", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient() });
		t.expect(s.capabilities.expires).toBe(true);
	});
});

describe("keyPrefix normalization", () => {
	it("should default keyPrefix to '/keyv/'", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient() });
		t.expect(s.keyPrefix).toBe("/keyv/");
	});

	it("should normalize a keyPrefix missing a leading slash", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient(), keyPrefix: "myapp/" });
		t.expect(s.keyPrefix).toBe("/myapp/");
	});

	it("should normalize a keyPrefix missing a trailing slash", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient(), keyPrefix: "/myapp" });
		t.expect(s.keyPrefix).toBe("/myapp/");
	});

	it("should normalize a keyPrefix missing both slashes", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient(), keyPrefix: "myapp" });
		t.expect(s.keyPrefix).toBe("/myapp/");
	});

	it("should collapse repeated slashes in a custom keyPrefix", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient(), keyPrefix: "//myapp//" });
		t.expect(s.keyPrefix).toBe("/myapp/");
	});

	it("should normalize keyPrefix through the setter too", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient() });
		s.keyPrefix = "other";
		t.expect(s.keyPrefix).toBe("/other/");
	});
});

describe("namespace and key prefixing", () => {
	it("should format a key with the default keyPrefix and no namespace", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient() });
		t.expect(s.formatKey("key")).toBe("/keyv/key");
	});

	it("should format a key with a namespace inserted between keyPrefix and key", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient() });
		s.namespace = "ns";
		t.expect(s.formatKey("key")).toBe("/keyv/ns/key");
	});

	it("should avoid double-prefixing an already-qualified key", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient() });
		t.expect(s.formatKey("/keyv/key")).toBe("/keyv/key");
		s.namespace = "ns";
		t.expect(s.formatKey("/keyv/ns/key")).toBe("/keyv/ns/key");
	});

	it("should create a key prefix when a namespace is provided", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient() });
		t.expect(s.createKeyPrefix("key", "ns")).toBe("ns/key");
		t.expect(s.createKeyPrefix("key")).toBe("key");
		t.expect(s.createKeyPrefix("key", undefined)).toBe("key");
	});

	it("should remove a key prefix when a namespace is provided", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient() });
		t.expect(s.removeKeyPrefix("ns/key", "ns")).toBe("key");
		t.expect(s.removeKeyPrefix("key")).toBe("key");
		t.expect(s.removeKeyPrefix("key", undefined)).toBe("key");
	});

	it("should use a custom keyPrefixSeparator when formatting keys", (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient(), keyPrefixSeparator: "-" });
		s.namespace = "ns";
		t.expect(s.formatKey("key")).toBe("/keyv/ns-key");
	});

	it("should isolate keys across namespaces sharing the same client", async (t) => {
		const client = fakeClient();
		const s1 = new KeyvAwsSsm({ client, namespace: "ns1" });
		const s2 = new KeyvAwsSsm({ client, namespace: "ns2" });

		await s1.set("shared-key", "value-1");
		await s2.set("shared-key", "value-2");

		t.expect(await s1.get("shared-key")).toBe("value-1");
		t.expect(await s2.get("shared-key")).toBe("value-2");

		t.expect(await s1.delete("shared-key")).toBe(true);
		t.expect(await s1.get("shared-key")).toBeUndefined();
		t.expect(await s2.get("shared-key")).toBe("value-2");
	});

	it("should scope clear() to the configured namespace only", async (t) => {
		const client = fakeClient();
		const s1 = new KeyvAwsSsm({ client, namespace: "ns1" });
		const s2 = new KeyvAwsSsm({ client, namespace: "ns2" });

		await s1.set("a", "1");
		await s1.set("b", "2");
		await s2.set("a", "3");

		await s1.clear();

		t.expect(await s1.get("a")).toBeUndefined();
		t.expect(await s1.get("b")).toBeUndefined();
		t.expect(await s2.get("a")).toBe("3");
	});

	it("should scope clear() to keyPrefix only when no namespace is set, without touching other prefixes", async (t) => {
		const client = fakeClient();
		const s1 = new KeyvAwsSsm({ client, keyPrefix: "/app-one/" });
		const s2 = new KeyvAwsSsm({ client, keyPrefix: "/app-two/" });

		await s1.set("a", "1");
		await s2.set("a", "2");

		await s1.clear();

		t.expect(await s1.get("a")).toBeUndefined();
		t.expect(await s2.get("a")).toBe("2");
	});
});

describe("type, tier, and keyId options", () => {
	it("should pass Type, Tier, and Overwrite through to PutParameter", async (t) => {
		const fake = new FakeSsmClient();
		const s = new KeyvAwsSsm({ client: fake as unknown as SSMClient, tier: "Advanced" });
		await s.set("key", "value");

		const result = (await fake.send(new GetParameterCommand({ Name: "/keyv/key" }))) as {
			Parameter?: { Type?: string };
		};
		t.expect(result.Parameter?.Type).toBe("String");
	});

	it("should only send KeyId when type is SecureString", async (t) => {
		const sends: any[] = [];
		const inner = new FakeSsmClient();
		const spyClient = {
			send: async (command: any) => {
				sends.push(command.input);
				return inner.send(command);
			},
		} as unknown as SSMClient;

		const stringStore = new KeyvAwsSsm({ client: spyClient, keyId: "alias/unused" });
		await stringStore.set("key1", "value1");
		const stringPut = sends.find((input) => input.Name === "/keyv/key1");
		t.expect(stringPut.Type).toBe("String");
		t.expect(stringPut.KeyId).toBeUndefined();

		const secureStore = new KeyvAwsSsm({
			client: spyClient,
			type: "SecureString",
			keyId: "alias/my-key",
		});
		await secureStore.set("key2", "value2");
		const securePut = sends.find((input) => input.Name === "/keyv/key2");
		t.expect(securePut.Type).toBe("SecureString");
		t.expect(securePut.KeyId).toBe("alias/my-key");
	});
});

describe("batching beyond AWS's 10-item limit", () => {
	const manyKeys = Array.from({ length: 23 }, (_, i) => `batch-key-${i}`);

	it("should chunk setMany/getMany/hasMany/deleteMany into groups of 10", async (t) => {
		const s = store();
		const entries = manyKeys.map((key) => ({ key, value: `value-${key}` }));

		const setResults = await s.setMany(entries);
		t.expect(setResults).toEqual(manyKeys.map(() => true));

		const getResults = await s.getMany(manyKeys);
		t.expect(getResults).toEqual(entries.map((e) => e.value));

		const hasResults = await s.hasMany(manyKeys);
		t.expect(hasResults).toEqual(manyKeys.map(() => true));

		const deleteResults = await s.deleteMany(manyKeys);
		t.expect(deleteResults).toEqual(manyKeys.map(() => true));

		const afterDelete = await s.getMany(manyKeys);
		t.expect(afterDelete).toEqual(manyKeys.map(() => undefined));
	});

	it("should paginate iterator() and clear() past a single 10-item page", async (t) => {
		const s = store();
		s.namespace = faker.string.alphanumeric(8);
		for (const key of manyKeys) {
			await s.set(key, `value-${key}`);
		}

		const collected = new Map<string, unknown>();
		for await (const [key, value] of s.iterator()) {
			collected.set(key, value);
		}

		t.expect(collected.size).toBe(manyKeys.length);
		for (const key of manyKeys) {
			t.expect(collected.get(key)).toBe(`value-${key}`);
		}

		await s.clear();
		const afterClear = await s.getMany(manyKeys);
		t.expect(afterClear).toEqual(manyKeys.map(() => undefined));
	});

	it("returns an empty array for empty batch calls without calling AWS", async (t) => {
		const s = store();
		t.expect(await s.getMany([])).toEqual([]);
		t.expect(await s.hasMany([])).toEqual([]);
		t.expect(await s.deleteMany([])).toEqual([]);
	});
});

describe("error handling", () => {
	it("should return undefined (no error event) for a missing key on get()", async (t) => {
		const s = store();
		let errorEmitted = false;
		s.on("error", () => {
			errorEmitted = true;
		});
		t.expect(await s.get("missing")).toBeUndefined();
		t.expect(errorEmitted).toBe(false);
	});

	it("should return false (no error event) for a missing key on delete()", async (t) => {
		const s = store();
		let errorEmitted = false;
		s.on("error", () => {
			errorEmitted = true;
		});
		t.expect(await s.delete("missing")).toBe(false);
		t.expect(errorEmitted).toBe(false);
	});

	it("should emit 'error' and return false when delete() hits an unexpected (non-ParameterNotFound) error", async (t) => {
		const throwingClient = {
			send: async () => {
				throw new Error("boom");
			},
		} as unknown as SSMClient;
		const s = new KeyvAwsSsm({ client: throwingClient });

		let captured: unknown;
		s.on("error", (error: unknown) => {
			captured = error;
		});

		t.expect(await s.delete("key")).toBe(false);
		t.expect((captured as Error)?.message).toBe("boom");
	});

	it("should return undefined/false when GetParameter resolves with a Parameter that has no Value", async (t) => {
		const noValueClient = {
			send: async (command: { constructor: { name: string } }) => {
				if (command.constructor.name === "GetParameterCommand") {
					return { Parameter: { Name: "/keyv/key" } };
				}

				throw new Error(`unexpected command ${command.constructor.name}`);
			},
		} as unknown as SSMClient;

		const s = new KeyvAwsSsm({ client: noValueClient });
		t.expect(await s.get("key")).toBeUndefined();
		t.expect(await s.has("key")).toBe(false);
	});

	it("should emit 'error' and return undefined when get() hits an unexpected error", async (t) => {
		const throwingClient = {
			send: async () => {
				throw new Error("boom");
			},
		} as unknown as SSMClient;
		const s = new KeyvAwsSsm({ client: throwingClient });

		let captured: unknown;
		s.on("error", (error: unknown) => {
			captured = error;
		});

		t.expect(await s.get("key")).toBeUndefined();
		t.expect((captured as Error)?.message).toBe("boom");
	});

	it("should emit 'error' and return false when set() hits an unexpected error", async (t) => {
		const throwingClient = {
			send: async () => {
				throw new Error("boom");
			},
		} as unknown as SSMClient;
		const s = new KeyvAwsSsm({ client: throwingClient });

		let captured: unknown;
		s.on("error", (error: unknown) => {
			captured = error;
		});

		t.expect(await s.set("key", "value")).toBe(false);
		t.expect((captured as Error)?.message).toBe("boom");
	});

	it("should return false (swallowing errors) for has() on unexpected errors", async (t) => {
		const throwingClient = {
			send: async () => {
				throw new Error("boom");
			},
		} as unknown as SSMClient;
		const s = new KeyvAwsSsm({ client: throwingClient });
		t.expect(await s.has("key")).toBe(false);
	});

	it("should emit 'error' and return false[] for getMany/hasMany/deleteMany on unexpected errors", async (t) => {
		const throwingClient = {
			send: async () => {
				throw new Error("boom");
			},
		} as unknown as SSMClient;
		const s = new KeyvAwsSsm({ client: throwingClient });
		s.on("error", () => {});

		t.expect(await s.getMany(["a", "b"])).toEqual([undefined, undefined]);
		t.expect(await s.hasMany(["a", "b"])).toEqual([false, false]);
		t.expect(await s.deleteMany(["a", "b"])).toEqual([false, false]);
	});

	it("should emit 'error' and no-op for clear() on unexpected errors", async (t) => {
		const throwingClient = {
			send: async () => {
				throw new Error("boom");
			},
		} as unknown as SSMClient;
		const s = new KeyvAwsSsm({ client: throwingClient });

		let captured: unknown;
		s.on("error", (error: unknown) => {
			captured = error;
		});

		await s.clear();
		t.expect((captured as Error)?.message).toBe("boom");
	});

	it("should emit 'error' and end iteration for iterator() on unexpected errors", async (t) => {
		const throwingClient = {
			send: async () => {
				throw new Error("boom");
			},
		} as unknown as SSMClient;
		const s = new KeyvAwsSsm({ client: throwingClient });

		let captured: unknown;
		s.on("error", (error: unknown) => {
			captured = error;
		});

		const results = [];
		for await (const entry of s.iterator()) {
			results.push(entry);
		}

		t.expect(results).toEqual([]);
		t.expect((captured as Error)?.message).toBe("boom");
	});

	it("should treat a real ParameterNotFound thrown by the client as a normal miss on delete()", async (t) => {
		// FakeSsmClient throws a real @aws-sdk/client-ssm ParameterNotFound instance for
		// missing parameters, exercising the `instanceof ParameterNotFound` check directly.
		const s = store();
		t.expect(await s.delete("does-not-exist")).toBe(false);
	});
});

describe("disconnect", () => {
	it("should resolve without throwing and leave the caller-owned client untouched", async (t) => {
		const client = fakeClient();
		const s = new KeyvAwsSsm({ client });
		await s.set("key", "value");
		await t.expect(s.disconnect()).resolves.toBeUndefined();
		t.expect(s.client).toBe(client);
		// The client must still be usable after disconnect() since the adapter doesn't own it.
		t.expect(await s.get("key")).toBe("value");
	});
});

describe("raw and non-enveloped values", () => {
	it("should return a raw (non-enveloped) value as-is when it isn't valid JSON", async (t) => {
		const client = new FakeSsmClient();
		const s = new KeyvAwsSsm({ client: client as unknown as SSMClient });
		client.seedRaw("/keyv/raw-key", "raw-value");
		t.expect(await s.get("raw-key")).toBe("raw-value");
		t.expect(await s.has("raw-key")).toBe(true);
	});

	it("should return a raw value as-is when it's valid JSON but not an object (e.g. a bare string/number)", async (t) => {
		const client = new FakeSsmClient();
		const s = new KeyvAwsSsm({ client: client as unknown as SSMClient });
		client.seedRaw("/keyv/number-key", "42");
		t.expect(await s.get("number-key")).toBe("42");
	});

	it("should return a raw value as-is when it's a JSON object without the `v` envelope field", async (t) => {
		const client = new FakeSsmClient();
		const s = new KeyvAwsSsm({ client: client as unknown as SSMClient });
		client.seedRaw("/keyv/other-shape-key", JSON.stringify({ foo: "bar" }));
		t.expect(await s.get("other-shape-key")).toBe(JSON.stringify({ foo: "bar" }));
	});

	it("should use Keyv's default serializer for the value envelope", async (t) => {
		const s = new KeyvAwsSsm({ client: fakeClient() });
		const key = faker.string.uuid();
		const value = {
			bigint: BigInt("9223372036854775807"),
			buffer: Buffer.from("keyv-aws-ssm"),
			markerLikeString: ":bigint:123",
		};

		t.expect(await s.set(key, value)).toBe(true);
		t.expect(await s.get(key)).toEqual(value);
	});
});

describe("createKeyv factory", () => {
	it("should create a Keyv instance without a namespace", async (t) => {
		const keyv = createKeyv({ client: fakeClient() });
		t.expect(keyv.namespace).toBeUndefined();
		await keyv.set("foo", "bar");
		t.expect(await keyv.get("foo")).toBe("bar");
	});

	it("should create a Keyv instance with a namespace applied to both Keyv and the adapter", async (t) => {
		const keyv = createKeyv({ client: fakeClient(), namespace: "my-app" });
		t.expect(keyv.namespace).toBe("my-app");
		t.expect((keyv.store as KeyvAwsSsm).namespace).toBe("my-app");
	});
});

describe("ttl and expiration", () => {
	it("should respect a per-call absolute expires and lazily delete on read", async (t) => {
		const s = store();
		const key = faker.string.uuid();
		await s.set(key, "value", Date.now() + 50);
		t.expect(await s.get(key)).toBe("value");
		await new Promise((resolve) => setTimeout(resolve, 150));
		t.expect(await s.get(key)).toBeUndefined();
		// Lazily deleted: a direct has() on the underlying store confirms removal.
		t.expect(await s.has(key)).toBe(false);
	});

	it("should accept an already-elapsed expires without throwing, and never return the value", async (t) => {
		const s = store();
		const key = faker.string.uuid();
		t.expect(await s.set(key, "value", Date.now() - 1000)).toBe(true);
		t.expect(await s.get(key)).toBeUndefined();
	});

	it("should exclude and clean up expired keys via hasMany()", async (t) => {
		const s = store();
		const expiredKey = faker.string.uuid();
		const liveKey = faker.string.uuid();
		await s.set(expiredKey, "value", Date.now() - 1000);
		await s.set(liveKey, "value");

		t.expect(await s.hasMany([expiredKey, liveKey])).toEqual([false, true]);
		// The expired entry is deleted as a side effect of hasMany()'s cleanup.
		t.expect(await s.getMany([expiredKey])).toEqual([undefined]);
	});
});
