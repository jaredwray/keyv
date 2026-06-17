// biome-ignore-all lint/suspicious/noExplicitAny: this is a test file
import process from "node:process";
import { ResourceInUseException } from "@aws-sdk/client-dynamodb";
import { faker } from "@faker-js/faker";
import { keyvIteratorTests, keyvTestSuite, storageTestSuite } from "@keyv/test-suite";
import Keyv from "keyv";
import { beforeEach, describe, it, vi } from "vitest";
import KeyvDynamo, { createKeyv } from "../src/index.js";

process.env.AWS_ACCESS_KEY_ID = "dummyAccessKeyId";
process.env.AWS_SECRET_ACCESS_KEY = "dummySecretAccessKey";
process.env.AWS_REGION = "local";

const dynamoURL = "http://localhost:8000";
const keyvDynamodb = new KeyvDynamo({
	endpoint: dynamoURL,
	tableName: faker.string.uuid(),
});
const store = () => new KeyvDynamo({ endpoint: dynamoURL, tableName: faker.string.uuid() });

keyvTestSuite(it, Keyv, store);
keyvIteratorTests(it, Keyv, store);
storageTestSuite(it, store, { ttlGranularity: "seconds" });

beforeEach(async () => {
	const keyv = store();
	await keyv.clear();
});

describe("construction and properties", () => {
	it("should create a keyv instance from a store", (t) => {
		const keyv = new Keyv<string>({ store: keyvDynamodb });
		t.expect((keyv.store as KeyvDynamo).endpoint).toEqual(dynamoURL);
	});

	it("should create a store with a namespace", (t) => {
		const namespace = faker.string.alphanumeric(10);
		const store = new KeyvDynamo({ endpoint: dynamoURL, namespace });
		t.expect(store.endpoint).toEqual(dynamoURL);
		t.expect(store.namespace).toEqual(namespace);
	});

	it("should expose the underlying client", (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL });
		t.expect(store.client).toBeDefined();
		t.expect(store.client).toHaveProperty("send");
		t.expect(store.client).toHaveProperty("get");
		t.expect(store.client).toHaveProperty("put");
		t.expect(store.client).toHaveProperty("delete");
		t.expect(store.client).toHaveProperty("batchGet");
		t.expect(store.client).toHaveProperty("batchWrite");
		t.expect(store.client).toHaveProperty("scan");
	});

	it("should get and set the client", (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL });
		const originalClient = store.client;
		t.expect(originalClient).toBeDefined();
		const newStore = new KeyvDynamo({ endpoint: dynamoURL });
		store.client = newStore.client;
		t.expect(store.client).toBe(newStore.client);
	});

	it("should get and set sixHoursInMilliseconds", (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL });
		t.expect(store.sixHoursInMilliseconds).toBe(6 * 60 * 60 * 1000);
		store.sixHoursInMilliseconds = 1000;
		t.expect(store.sixHoursInMilliseconds).toBe(1000);
	});
});

describe("namespace and key prefixing", () => {
	it("should format a key with the namespace and avoid double prefixing", (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL });
		store.namespace = "ns";
		t.expect(store.formatKey("key")).toBe("ns:key");
		t.expect(store.formatKey("ns:key")).toBe("ns:key");
		store.namespace = undefined;
		t.expect(store.formatKey("key")).toBe("key");
	});

	it("should create a key prefix when a namespace is provided", (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL });
		t.expect(store.createKeyPrefix("key", "ns")).toBe("ns:key");
		t.expect(store.createKeyPrefix("key")).toBe("key");
		t.expect(store.createKeyPrefix("key", undefined)).toBe("key");
	});

	it("should remove a key prefix when a namespace is provided", (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL });
		t.expect(store.removeKeyPrefix("ns:key", "ns")).toBe("key");
		t.expect(store.removeKeyPrefix("key")).toBe("key");
		t.expect(store.removeKeyPrefix("key", undefined)).toBe("key");
	});

	it("should get and set the keyPrefixSeparator", (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL });
		t.expect(store.keyPrefixSeparator).toBe(":");
		store.keyPrefixSeparator = "::";
		t.expect(store.keyPrefixSeparator).toBe("::");
		t.expect(store.createKeyPrefix("key", "ns")).toBe("ns::key");
	});
});

describe("get, set, and delete", () => {
	it("should set and get a value with a namespace", async (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL });
		store.namespace = faker.string.alphanumeric(10);
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await store.set(key, value);
		t.expect(await store.get(key)).toBe(value);
	});

	it("should delete a value with a namespace", async (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL });
		store.namespace = faker.string.alphanumeric(10);
		const key = faker.string.uuid();
		await store.set(key, faker.lorem.word());
		t.expect(await store.delete(key)).toBe(true);
		t.expect(await store.get(key)).toBeUndefined();
	});

	it("should return undefined for a missing key", async (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL });
		t.expect(await store.get(faker.string.uuid())).toBeUndefined();
	});
});

describe("expiration", () => {
	it("should store expiresAtMs at millisecond precision", async (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL });
		const key = faker.string.uuid();
		const value = faker.lorem.sentence();

		const beforeSet = Date.now();
		await store.set(key, value, 1000);
		const afterSet = Date.now();

		const result = await store.client.get({
			TableName: store.tableName,
			Key: { id: store.formatKey(key) },
		});

		t.expect(typeof result.Item?.expiresAtMs).toBe("number");
		t.expect(result.Item?.expiresAtMs).toBeGreaterThanOrEqual(beforeSet + 1000);
		t.expect(result.Item?.expiresAtMs).toBeLessThanOrEqual(afterSet + 1000);

		t.expect(typeof result.Item?.expiresAt).toBe("number");
		t.expect(result.Item?.expiresAt).toBeGreaterThanOrEqual(Math.ceil((beforeSet + 1000) / 1000));
	});

	it("should return the value for items missing both expiry fields", async (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL });
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await store.client.put({
			TableName: store.tableName,
			Item: {
				id: store.formatKey(key),
				value,
			},
		});
		t.expect(await store.get(key)).toBe(value);
	});

	it("should return false from has for an expired key", async (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL });
		const key = faker.string.uuid();
		// Set with a TTL of 0ms so it expires immediately (expiresAt will be ~now+1s)
		await store.set(key, faker.lorem.word(), 0);
		// Manually overwrite with an already-expired expiresAt
		await store.client.put({
			TableName: store.tableName,
			Item: {
				id: store.formatKey(key),
				value: faker.lorem.word(),
				expiresAt: Math.floor(Date.now() / 1000) - 10,
			},
		});
		t.expect(await store.has(key)).toBe(false);
	});

	it("should return false from hasMany for expired keys", async (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL });
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		await store.set(key1, faker.lorem.word());
		await store.set(key2, faker.lorem.word());
		// Overwrite key1 with an expired expiresAt
		await store.client.put({
			TableName: store.tableName,
			Item: {
				id: store.formatKey(key1),
				value: faker.lorem.word(),
				expiresAt: Math.floor(Date.now() / 1000) - 10,
			},
		});
		const results = await store.hasMany([key1, key2]);
		t.expect(results).toEqual([false, true]);
	});
});

describe("batch operations", () => {
	it("should set many entries with per-entry ttl", async (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL });
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const value2 = faker.lorem.word();
		const result = await store.setMany([
			{ key: key1, value: value1, ttl: 5000 },
			{ key: key2, value: value2 },
		]);
		t.expect(result).toEqual([true, true]);
		t.expect(await store.get(key1)).toBe(value1);
		t.expect(await store.get(key2)).toBe(value2);
	});

	it("should mark all entries false when batchWrite throws", async (t) => {
		const dynamo = store();
		dynamo.on("error", () => {});
		// Wait for table to be ready before mocking
		await dynamo.set("_warmup", "ok");
		const originalBatchWrite = dynamo._client.batchWrite.bind(dynamo._client);
		dynamo._client.batchWrite = async () => {
			throw new Error("batchWrite failure");
		};

		const result = await dynamo.setMany([
			{ key: faker.string.uuid(), value: faker.lorem.word() },
			{ key: faker.string.uuid(), value: faker.lorem.word() },
		]);
		t.expect(result).toEqual([false, false]);
		dynamo._client.batchWrite = originalBatchWrite;
	});

	it("should mark unprocessed items as false", async (t) => {
		const dynamo = store();
		dynamo.on("error", () => {});
		// Wait for table to be ready before mocking
		await dynamo.set("_warmup", "ok");
		const key2 = faker.string.uuid();
		const key2Formatted = dynamo.formatKey(key2);
		dynamo._client.batchWrite = async (input: any) => {
			const tableName = Object.keys(input.RequestItems)[0];
			return {
				UnprocessedItems: {
					[tableName]: [{ PutRequest: { Item: { id: key2Formatted } } }],
				},
			};
		};

		const result = await dynamo.setMany([
			{ key: faker.string.uuid(), value: faker.lorem.word() },
			{ key: key2, value: faker.lorem.word() },
		]);
		t.expect(result?.[0]).toBe(true);
		t.expect(result?.[1]).toBe(false);
	});

	it("should ignore unprocessed items with a missing id", async (t) => {
		const dynamo = store();
		await dynamo.set("_warmup", "ok");
		dynamo._client.batchWrite = async (input: any) => {
			const tableName = Object.keys(input.RequestItems)[0];
			return {
				UnprocessedItems: {
					[tableName]: [{ PutRequest: { Item: {} } }],
				},
			};
		};
		const result = await dynamo.setMany([{ key: faker.string.uuid(), value: faker.lorem.word() }]);
		t.expect(result).toEqual([true]);
	});

	it("should retry unprocessed keys in getMany", async (t) => {
		const dynamo = store();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const value2 = faker.lorem.word();
		await dynamo.set(key1, value1);
		await dynamo.set(key2, value2);

		const originalBatchGet = dynamo._client.batchGet.bind(dynamo._client);
		let callCount = 0;
		dynamo._client.batchGet = async (input: any) => {
			callCount++;
			if (callCount === 1) {
				const tableName = Object.keys(input.RequestItems)[0];
				return {
					UnprocessedKeys: {
						[tableName]: {
							Keys: [{ id: dynamo.formatKey(key1) }, { id: dynamo.formatKey(key2) }],
						},
					},
				};
			}
			return originalBatchGet(input);
		};

		const result = await dynamo.getMany([key1, key2]);
		t.expect(result).toEqual([value1, value2]);
		t.expect(callCount).toBe(2);
		dynamo._client.batchGet = originalBatchGet;
	});

	it("should retry unprocessed keys in hasMany", async (t) => {
		const dynamo = store();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		await dynamo.set(key1, faker.lorem.word());
		await dynamo.set(key2, faker.lorem.word());

		const originalBatchGet = dynamo._client.batchGet.bind(dynamo._client);
		let callCount = 0;
		dynamo._client.batchGet = async (input: any) => {
			callCount++;
			if (callCount === 1) {
				const tableName = Object.keys(input.RequestItems)[0];
				return {
					UnprocessedKeys: {
						[tableName]: {
							Keys: [{ id: dynamo.formatKey(key1) }, { id: dynamo.formatKey(key2) }],
						},
					},
				};
			}
			return originalBatchGet(input);
		};

		const result = await dynamo.hasMany([key1, key2]);
		t.expect(result).toEqual([true, true]);
		t.expect(callCount).toBe(2);
		dynamo._client.batchGet = originalBatchGet;
	});
});

describe("clear", () => {
	it("should clear the entire store with the default namespace", async (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL });
		t.expect(await store.clear()).toBeUndefined();
	});

	it("should clear the store with a namespace", async (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL, namespace: faker.string.alphanumeric(10) });
		t.expect(await store.clear()).toBeUndefined();
	});

	it("should not fail when clearing an empty store", async () => {
		const store = new KeyvDynamo({ endpoint: dynamoURL });
		await store.clear();
		await store.clear();
	});

	it("should handle a scan result with undefined Items", async (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL });

		// Mock the scan method to return undefined Items
		const originalScan = (store as any).client.scan;
		(store as any).client.scan = vi.fn().mockResolvedValueOnce({
			Items: undefined,
		});

		t.expect(await store.clear()).toBeUndefined();
		(store as any).client.scan = originalScan;
	});

	it("should clear when the namespace is explicitly undefined", async (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL, namespace: undefined });

		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await store.set(key, value);

		t.expect(await store.clear()).toBeUndefined();
	});
});

describe("iterator", () => {
	it("should iterate over all entries with no namespace", async (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL, tableName: faker.string.uuid() });
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		await store.set(key1, "val1");
		await store.set(key2, "val2");

		const entries: Array<[string, string]> = [];
		for await (const entry of store.iterator()) {
			entries.push(entry as [string, string]);
		}

		t.expect(entries.length).toBe(2);
		const keys = entries.map(([key]) => key);
		t.expect(keys).toContain(key1);
		t.expect(keys).toContain(key2);
	});

	it("should only iterate over namespaced keys and strip the prefix", async (t) => {
		const tableName = faker.string.uuid();
		const namespace = faker.string.alphanumeric(10);
		const store = new KeyvDynamo({ endpoint: dynamoURL, tableName, namespace });
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		await store.set(key1, "val1");
		await store.set(key2, "val2");

		// Also set a key without the namespace directly
		const storeNoNs = new KeyvDynamo({ endpoint: dynamoURL, tableName });
		await storeNoNs.set(faker.string.uuid(), "val3");

		const entries: Array<[string, string]> = [];
		for await (const entry of store.iterator()) {
			entries.push(entry as [string, string]);
		}

		// Should only return the 2 namespaced keys, with the namespace prefix removed
		t.expect(entries.length).toBe(2);
		const keys = entries.map(([key]) => key);
		t.expect(keys).toContain(key1);
		t.expect(keys).toContain(key2);
	});
});

describe("table management", () => {
	it("should create the table on first use", async (t) => {
		const store = new KeyvDynamo({
			endpoint: dynamoURL,
			tableName: faker.string.uuid(),
		});
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await store.set(key, value);
		await t.expect(store.get(key)).resolves.toBe(value);
	});

	it("should emit an error when ensureTable fails for a non-ResourceNotFound error", async (t) => {
		const store = new KeyvDynamo({
			endpoint: dynamoURL,
			tableName: "invalid_table%&#@",
		});

		const expectedError = new Promise((_resolve, reject) => {
			store.on("error", reject);
		});
		await t.expect(expectedError).rejects.toThrow(Error);
	});

	it("should fall back to waiting when CreateTable hits ResourceInUseException", async (t) => {
		const store = new KeyvDynamo({
			endpoint: dynamoURL,
			tableName: faker.string.uuid(),
		});

		const originalSend = (store as any).client.send;
		(store as any).client.send = vi.fn().mockImplementation((command) => {
			if (command.constructor.name === "CreateTableCommand") {
				// Call CreateTableCommand twice to trigger the ResourceInUseException
				originalSend.call((store as any).client, command).catch(() => {});
			}

			return originalSend.call((store as any).client, command);
		});

		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await store.set(key, value);
		(store as any).client.send = originalSend;
		await t.expect(store.get(key)).resolves.toBe(value);
	});

	it("should wait for the table when it exists but is not ACTIVE", async (t) => {
		const tableName = faker.string.uuid();

		// First create a store and table
		const store = new KeyvDynamo({
			endpoint: dynamoURL,
			tableName,
		});
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await store.set(key, value);

		// Now test ensureTable directly with a mocked CREATING status
		let describeCallCount = 0;
		const originalSend = (store as any).client.send;
		(store as any).client.send = vi.fn().mockImplementation(async (command) => {
			if (command.constructor.name === "DescribeTableCommand") {
				describeCallCount++;
				if (describeCallCount === 1) {
					// First call returns CREATING status
					return {
						Table: {
							TableName: tableName,
							TableStatus: "CREATING",
						},
					};
				}
			}
			return originalSend.call((store as any).client, command);
		});

		// Call ensureTable directly - this should hit the CREATING branch
		await store.ensureTable(tableName);
		t.expect(describeCallCount).toBeGreaterThanOrEqual(1);
		(store as any).client.send = originalSend;
	});

	it("should wait for the table when CreateTable throws ResourceInUseException", {
		timeout: 10000,
	}, async (t) => {
		const tableName = faker.string.uuid();
		const store = new KeyvDynamo({
			endpoint: dynamoURL,
			tableName,
		});

		// First create the table
		const key1 = faker.string.uuid();
		const value1 = faker.lorem.word();
		await store.set(key1, value1);

		// Now create another store instance that will hit ResourceInUseException
		const store2 = new KeyvDynamo({
			endpoint: dynamoURL,
			tableName,
		});

		const originalSend = (store2 as any).client.send;
		let createTableCalled = false;
		(store2 as any).client.send = vi.fn().mockImplementation(async (command) => {
			if (command.constructor.name === "CreateTableCommand" && !createTableCalled) {
				createTableCalled = true;
				throw new ResourceInUseException({
					message: "Table already being created",
					$metadata: {},
				});
			}
			return originalSend.call((store2 as any).client, command);
		});

		// This should wait for the table to exist
		const key2 = faker.string.uuid();
		const value2 = faker.lorem.word();
		await store2.set(key2, value2);
		t.expect(await store2.get(key2)).toBe(value2);
		(store2 as any).client.send = originalSend;
	});
});

describe("createKeyv", () => {
	it("should create a Keyv instance with default options", (t) => {
		const keyv = createKeyv();
		t.expect(keyv).toBeDefined();
		t.expect(keyv.store).toBeInstanceOf(KeyvDynamo);
		t.expect(keyv.namespace).toBeUndefined();
		t.expect((keyv.store as KeyvDynamo).namespace).toBeUndefined();
	});

	it("should create a Keyv instance with a string endpoint", (t) => {
		const keyv = createKeyv(dynamoURL);
		t.expect(keyv).toBeDefined();
		t.expect(keyv.store).toBeInstanceOf(KeyvDynamo);
		t.expect(keyv.namespace).toBeUndefined();
		t.expect((keyv.store as KeyvDynamo).namespace).toBeUndefined();
		t.expect((keyv.store as KeyvDynamo).endpoint).toBe(dynamoURL);
	});

	it("should create a Keyv instance with a custom namespace", (t) => {
		const namespace = faker.string.alphanumeric(10);
		const keyv = createKeyv({ endpoint: dynamoURL, namespace });
		t.expect(keyv).toBeDefined();
		t.expect(keyv.store).toBeInstanceOf(KeyvDynamo);
		t.expect(keyv.namespace).toBe(namespace);
		t.expect((keyv.store as KeyvDynamo).namespace).toBe(namespace);
		t.expect((keyv.store as KeyvDynamo).endpoint).toBe(dynamoURL);
	});

	it("should create a Keyv instance with a custom table name", (t) => {
		const tableName = faker.string.alphanumeric(10);
		const keyv = createKeyv({ endpoint: dynamoURL, tableName });
		t.expect(keyv).toBeDefined();
		t.expect(keyv.store).toBeInstanceOf(KeyvDynamo);
		t.expect(keyv.namespace).toBeUndefined();
		t.expect((keyv.store as KeyvDynamo).namespace).toBeUndefined();
		t.expect((keyv.store as KeyvDynamo).tableName).toBe(tableName);
	});

	it("should create a Keyv instance with both a namespace and a table name", (t) => {
		const namespace = faker.string.alphanumeric(10);
		const tableName = faker.string.alphanumeric(10);
		const keyv = createKeyv({ endpoint: dynamoURL, namespace, tableName });
		t.expect(keyv).toBeDefined();
		t.expect(keyv.store).toBeInstanceOf(KeyvDynamo);
		t.expect(keyv.namespace).toBe(namespace);
		t.expect((keyv.store as KeyvDynamo).namespace).toBe(namespace);
		t.expect((keyv.store as KeyvDynamo).tableName).toBe(tableName);
	});

	it("should store and retrieve values through the Keyv instance", async (t) => {
		const keyv = createKeyv({ endpoint: dynamoURL });
		const key = faker.string.uuid();
		const value = faker.lorem.word();

		await keyv.set(key, value);
		t.expect(await keyv.get(key)).toBe(value);

		await keyv.delete(key);
		t.expect(await keyv.get(key)).toBeUndefined();
	});

	it("should share namespaced data across Keyv instances", async (t) => {
		const namespace = faker.string.alphanumeric(10);
		const keyv = createKeyv({ endpoint: dynamoURL, namespace });
		const key = faker.string.uuid();
		const value = faker.lorem.word();

		await keyv.set(key, value);
		t.expect(await keyv.get(key)).toBe(value);

		// Create another Keyv instance with same namespace to verify it can access the same data
		const keyv2 = createKeyv({ endpoint: dynamoURL, namespace });
		t.expect(await keyv2.get(key)).toBe(value);

		await keyv.delete(key);
		t.expect(await keyv.get(key)).toBeUndefined();
	});

	it("should handle various data types", async (t) => {
		const keyv = createKeyv({ endpoint: dynamoURL });

		const stringKey = faker.string.uuid();
		const stringValue = faker.lorem.sentence();
		await keyv.set(stringKey, stringValue);
		t.expect(await keyv.get(stringKey)).toBe(stringValue);

		const numberKey = faker.string.uuid();
		const numberValue = faker.number.float({ max: 1000 });
		await keyv.set(numberKey, numberValue);
		t.expect(await keyv.get(numberKey)).toBe(numberValue);

		const boolKey = faker.string.uuid();
		const boolValue = faker.datatype.boolean();
		await keyv.set(boolKey, boolValue);
		t.expect(await keyv.get(boolKey)).toBe(boolValue);

		const objectKey = faker.string.uuid();
		const objectValue = {
			id: faker.string.uuid(),
			name: faker.person.fullName(),
			count: faker.number.int({ max: 100 }),
			active: faker.datatype.boolean(),
			nested: {
				field1: faker.lorem.word(),
				field2: faker.number.float({ max: 50 }),
			},
			array: [faker.string.uuid(), faker.string.uuid(), faker.string.uuid()],
		};
		await keyv.set(objectKey, objectValue);
		t.expect(await keyv.get(objectKey)).toEqual(objectValue);

		const arrayKey = faker.string.uuid();
		const arrayValue = [
			faker.string.uuid(),
			faker.number.float({ max: 100 }),
			faker.datatype.boolean(),
			{ id: faker.string.uuid() },
			[1, 2, 3],
		];
		await keyv.set(arrayKey, arrayValue);
		t.expect(await keyv.get(arrayKey)).toEqual(arrayValue);

		const dateKey = faker.string.uuid();
		const dateValue = faker.date.recent();
		await keyv.set(dateKey, dateValue);
		t.expect(await keyv.get(dateKey)).toBe(dateValue.toISOString());

		await keyv.delete(stringKey);
		await keyv.delete(numberKey);
		await keyv.delete(boolKey);
		await keyv.delete(objectKey);
		await keyv.delete(arrayKey);
		await keyv.delete(dateKey);
	});
});
