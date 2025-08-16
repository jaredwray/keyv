// biome-ignore-all lint/suspicious/noExplicitAny: this is a test file
import { randomUUID } from "node:crypto";
import process from "node:process";
import {
	ResourceNotFoundException,
	UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";
import keyvTestSuite from "@keyv/test-suite";
import Keyv from "keyv";
import * as test from "vitest";
import KeyvDynamo from "../src/index.js";

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
