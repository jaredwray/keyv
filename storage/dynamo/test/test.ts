// biome-ignore-all lint/suspicious/noExplicitAny: this is a test file
import { randomUUID } from "node:crypto";
import process from "node:process";
import {
	ResourceInUseException,
	ResourceNotFoundException,
	UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";
import keyvTestSuite from "@keyv/test-suite";
import Keyv from "keyv";
import * as test from "vitest";
import KeyvDynamo, { createKeyv } from "../src/index.js";

process.env.AWS_ACCESS_KEY_ID = "dummyAccessKeyId";
process.env.AWS_SECRET_ACCESS_KEY = "dummySecretAccessKey";
process.env.AWS_REGION = "local";

const dynamoURL = "http://localhost:8000";
const keyvDynamodb = new KeyvDynamo({
	endpoint: dynamoURL,
});
const store = () => new KeyvDynamo(dynamoURL);

keyvTestSuite(test, Keyv, store);

test.beforeEach(async () => {
	const keyv = store();
	await keyv.clear();
});

test.it("should ensure table creation", async (t) => {
	const store = new KeyvDynamo({ endpoint: dynamoURL, tableName: "newTable" });
	await store.set("test:key1", "value1");
	await t.expect(store.get("test:key1")).resolves.toBe("value1");
});

test.it("should be able to create a keyv instance", (t) => {
	const keyv = new Keyv<string>({ store: keyvDynamodb });
	t.expect(keyv.store.opts.endpoint).toEqual(dynamoURL);
});

test.it("should be able to create a keyv instance with namespace", (t) => {
	const keyv = new Keyv<string>({
		store: new KeyvDynamo({ endpoint: dynamoURL, namespace: "test" }),
	});
	t.expect(keyv.store.opts.endpoint).toEqual(dynamoURL);
	t.expect(keyv.store.opts.namespace).toEqual("test");
});

test.it(".clear() entire cache store with default namespace", async (t) => {
	const store = new KeyvDynamo({ endpoint: dynamoURL });
	t.expect(await store.clear()).toBeUndefined();
});

test.it(".clear() entire cache store with namespace", async (t) => {
	const store = new KeyvDynamo({ endpoint: dynamoURL, namespace: "test" });
	t.expect(await store.clear()).toBeUndefined();
});

test.it(".clear() an empty store should not fail", async () => {
	const store = new KeyvDynamo({ endpoint: dynamoURL });
	await store.clear();
	await store.clear();
});

test.it(
	"should emit error when not ResourceNotFoundException on ensureTable",
	async (t) => {
		const store = new KeyvDynamo({
			endpoint: dynamoURL,
			tableName: "invalid_table%&#@",
		});

		const expectedError = new Promise((_resolve, reject) => {
			store.on("error", reject);
		});
		await t.expect(expectedError).rejects.toThrow(Error);
	},
);

test.it("should handle scan result with undefined Items", async (t) => {
	const store = new KeyvDynamo({ endpoint: dynamoURL });

	// Mock the scan method to return undefined Items
	const originalScan = (store as any).client.scan;
	(store as any).client.scan = test.vi.fn().mockResolvedValueOnce({
		Items: undefined,
	});

	t.expect(await store.clear()).toBeUndefined();
	(store as any).client.scan = originalScan;
});

test.it(
	"should handle namespace filtering when namespace is undefined",
	async (t) => {
		const store = new KeyvDynamo({ endpoint: dynamoURL, namespace: undefined });

		await store.set("test:key1", "value1");

		t.expect(await store.clear()).toBeUndefined();
	},
);

test.it(
	"should handle ResourceInUseException when table already exists (fallback to wait for table to be created)",
	async (t) => {
		const store = new KeyvDynamo({
			endpoint: dynamoURL,
			tableName: "resourceInUseExceptionTable",
		});

		const originalSend = (store as any).client.send;
		(store as any).client.send = test.vi.fn().mockImplementation((command) => {
			if (command.constructor.name === "CreateTableCommand") {
				// Call CreateTableCommand twice to trigger the ResourceInUseException
				originalSend.call((store as any).client, command);
			}

			return originalSend.call((store as any).client, command);
		});

		await store.set("test:key1", "value1");
		(store as any).client.send = originalSend;
		await t.expect(store.get("test:key1")).resolves.toBe("value1");
	},
);

test.it(
	"should throw error when not ResourceInUseException on create table",
	async (t) => {
		const store = new KeyvDynamo({
			endpoint: dynamoURL,
			tableName: randomUUID(),
		});

		const originalSend = (store as any).client.send;
		(store as any).client.send = test.vi.fn().mockImplementation((command) => {
			// Force error on UpdateTimeToLiveCommand
			if (command.constructor.name === "UpdateTimeToLiveCommand") {
				return originalSend.call(
					(store as any).client,
					new UpdateTimeToLiveCommand({
						...command,
						TableName: "failTimeToLive",
					}),
				);
			}

			return originalSend.call((store as any).client, command);
		});

		await t
			.expect(store.set("test:key1", "value1"))
			.rejects.toThrow(ResourceNotFoundException);
		(store as any).client.send = originalSend;
	},
);

test.it("should wait for table when it exists but is not ACTIVE", async (t) => {
	const tableName = randomUUID();

	// First create a store and table
	const store = new KeyvDynamo({
		endpoint: dynamoURL,
		tableName,
	});
	await store.set("test:key1", "value1");

	// Now test ensureTable directly with a mocked CREATING status
	let describeCallCount = 0;
	const originalSend = (store as any).client.send;
	(store as any).client.send = test.vi
		.fn()
		.mockImplementation(async (command) => {
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

test.it("should verify exposed client property", async (t) => {
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

test.it(
	"should handle ResourceInUseException and wait for table",
	{ timeout: 10000 },
	async (t) => {
		const tableName = randomUUID();
		const store = new KeyvDynamo({
			endpoint: dynamoURL,
			tableName,
		});

		// First create the table
		await store.set("test:key1", "value1");

		// Now create another store instance that will hit ResourceInUseException
		const store2 = new KeyvDynamo({
			endpoint: dynamoURL,
			tableName,
		});

		const originalSend = (store2 as any).client.send;
		let createTableCalled = false;
		(store2 as any).client.send = test.vi
			.fn()
			.mockImplementation(async (command) => {
				if (
					command.constructor.name === "CreateTableCommand" &&
					!createTableCalled
				) {
					createTableCalled = true;
					throw new ResourceInUseException({
						message: "Table already being created",
						$metadata: {},
					});
				}
				return originalSend.call((store2 as any).client, command);
			});

		// This should wait for the table to exist
		await store2.set("test:key2", "value2");
		t.expect(await store2.get("test:key2")).toBe("value2");
		(store2 as any).client.send = originalSend;
	},
);

test.describe("createKeyv", () => {
	test.it("should create Keyv instance with default options", (t) => {
		const keyv = createKeyv();
		t.expect(keyv).toBeDefined();
		t.expect(keyv.store).toBeInstanceOf(KeyvDynamo);
		t.expect(keyv.namespace).toBeUndefined();
		t.expect((keyv.store as KeyvDynamo).namespace).toBeUndefined();
		t.expect(keyv.useKeyPrefix).toBe(false);
	});

	test.it("should create Keyv instance with string endpoint", (t) => {
		const keyv = createKeyv(dynamoURL);
		t.expect(keyv).toBeDefined();
		t.expect(keyv.store).toBeInstanceOf(KeyvDynamo);
		t.expect(keyv.namespace).toBeUndefined();
		t.expect((keyv.store as KeyvDynamo).namespace).toBeUndefined();
		t.expect(keyv.useKeyPrefix).toBe(false);
		t.expect((keyv.store as KeyvDynamo).opts.endpoint).toBe(dynamoURL);
	});

	test.it("should create Keyv instance with custom namespace", (t) => {
		const namespace = "test-namespace";
		const keyv = createKeyv({ endpoint: dynamoURL, namespace });
		t.expect(keyv).toBeDefined();
		t.expect(keyv.store).toBeInstanceOf(KeyvDynamo);
		t.expect(keyv.namespace).toBe(namespace);
		t.expect((keyv.store as KeyvDynamo).namespace).toBe(namespace);
		t.expect(keyv.useKeyPrefix).toBe(false);
		t.expect((keyv.store as KeyvDynamo).opts.endpoint).toBe(dynamoURL);
	});

	test.it("should create Keyv instance with custom table name", (t) => {
		const tableName = "custom-table";
		const keyv = createKeyv({ endpoint: dynamoURL, tableName });
		t.expect(keyv).toBeDefined();
		t.expect(keyv.store).toBeInstanceOf(KeyvDynamo);
		t.expect(keyv.namespace).toBeUndefined();
		t.expect((keyv.store as KeyvDynamo).namespace).toBeUndefined();
		t.expect(keyv.useKeyPrefix).toBe(false);
		t.expect((keyv.store as KeyvDynamo).opts.tableName).toBe(tableName);
	});

	test.it(
		"should create Keyv instance with both namespace and table name",
		(t) => {
			const namespace = "test-namespace-2";
			const tableName = "custom-table-2";
			const keyv = createKeyv({ endpoint: dynamoURL, namespace, tableName });
			t.expect(keyv).toBeDefined();
			t.expect(keyv.store).toBeInstanceOf(KeyvDynamo);
			t.expect(keyv.namespace).toBe(namespace);
			t.expect((keyv.store as KeyvDynamo).namespace).toBe(namespace);
			t.expect(keyv.useKeyPrefix).toBe(false);
			t.expect((keyv.store as KeyvDynamo).opts.tableName).toBe(tableName);
		},
	);

	test.it(
		"should create functional Keyv instance that can store and retrieve values",
		async (t) => {
			const keyv = createKeyv({ endpoint: dynamoURL });
			const key = `test-key-${randomUUID()}`;
			const value = "test-value";

			await keyv.set(key, value);
			const retrieved = await keyv.get(key);
			t.expect(retrieved).toBe(value);

			await keyv.delete(key);
			const deletedValue = await keyv.get(key);
			t.expect(deletedValue).toBeUndefined();
		},
	);

	test.it(
		"should create functional Keyv instance with namespace that can store and retrieve values",
		async (t) => {
			const namespace = "test-ns";
			const keyv = createKeyv({ endpoint: dynamoURL, namespace });
			const key = `test-key-${randomUUID()}`;
			const value = "test-value-with-namespace";

			await keyv.set(key, value);
			const retrieved = await keyv.get(key);
			t.expect(retrieved).toBe(value);

			// Create another Keyv instance with same namespace to verify it can access the same data
			const keyv2 = createKeyv({ endpoint: dynamoURL, namespace });
			const retrieved2 = await keyv2.get(key);
			t.expect(retrieved2).toBe(value);

			await keyv.delete(key);
			const deletedValue = await keyv.get(key);
			t.expect(deletedValue).toBeUndefined();
		},
	);

	test.it("should handle various data types with createKeyv", async (t) => {
		const keyv = createKeyv({ endpoint: dynamoURL });

		// Test with string
		const stringKey = `string-${randomUUID()}`;
		const stringValue = `random-string-${randomUUID()}`;
		await keyv.set(stringKey, stringValue);
		t.expect(await keyv.get(stringKey)).toBe(stringValue);

		// Test with number
		const numberKey = `number-${randomUUID()}`;
		const numberValue = Math.random() * 1000;
		await keyv.set(numberKey, numberValue);
		t.expect(await keyv.get(numberKey)).toBe(numberValue);

		// Test with boolean
		const boolKey = `bool-${randomUUID()}`;
		const boolValue = Math.random() > 0.5;
		await keyv.set(boolKey, boolValue);
		t.expect(await keyv.get(boolKey)).toBe(boolValue);

		// Test with object
		const objectKey = `object-${randomUUID()}`;
		const objectValue = {
			id: randomUUID(),
			name: `test-${randomUUID()}`,
			count: Math.floor(Math.random() * 100),
			active: Math.random() > 0.5,
			nested: {
				field1: `nested-${randomUUID()}`,
				field2: Math.random() * 50,
			},
			array: [randomUUID(), randomUUID(), randomUUID()],
		};
		await keyv.set(objectKey, objectValue);
		t.expect(await keyv.get(objectKey)).toEqual(objectValue);

		// Test with array
		const arrayKey = `array-${randomUUID()}`;
		const arrayValue = [
			randomUUID(),
			Math.random() * 100,
			Math.random() > 0.5,
			{ id: randomUUID() },
			[1, 2, 3],
		];
		await keyv.set(arrayKey, arrayValue);
		t.expect(await keyv.get(arrayKey)).toEqual(arrayValue);

		// Test with Date object
		const dateKey = `date-${randomUUID()}`;
		const dateValue = new Date();
		await keyv.set(dateKey, dateValue);
		const retrievedDate = await keyv.get(dateKey);
		t.expect(retrievedDate).toBe(dateValue.toISOString());

		// Clean up
		await keyv.delete(stringKey);
		await keyv.delete(numberKey);
		await keyv.delete(boolKey);
		await keyv.delete(objectKey);
		await keyv.delete(arrayKey);
		await keyv.delete(dateKey);
	});
});
