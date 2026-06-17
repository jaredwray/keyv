import {
	CreateTableCommand,
	DescribeTableCommand,
	DynamoDB,
	type DynamoDBClientConfig,
	ResourceInUseException,
	ResourceNotFoundException,
	UpdateTimeToLiveCommand,
	waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import {
	type BatchGetCommandInput,
	type BatchWriteCommandInput,
	type DeleteCommandInput,
	DynamoDBDocument,
	type GetCommandInput,
	type PutCommandInput,
	type ScanCommandInput,
	type ScanCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import { Hookified } from "hookified";
import { Keyv, type KeyvEntry, type KeyvStorageAdapter, type KeyvStorageGetResult } from "keyv";

export class KeyvDynamo extends Hookified implements KeyvStorageAdapter {
	private _sixHoursInMilliseconds = 6 * 60 * 60 * 1000;
	private _namespace?: string;
	private _opts: Omit<KeyvDynamoOptions, "tableName"> & { tableName: string };
	private _client: DynamoDBDocument;
	private readonly _tableReady: Promise<void>;
	private _keyPrefixSeparator = ":";

	constructor(options: KeyvDynamoOptions | string) {
		super({ throwOnEmptyListeners: false });
		options ??= {};
		if (typeof options === "string") {
			options = { endpoint: options };
		}

		// `uri` is an alias for `endpoint`; `endpoint` wins when both are set.
		const { uri, ...rest } = options;
		if (uri !== undefined && rest.endpoint === undefined) {
			rest.endpoint = uri;
		}

		this._opts = {
			tableName: "keyv",
			...rest,
		};

		if (this._opts.namespace) {
			this._namespace = this._opts.namespace;
		}

		this._client = DynamoDBDocument.from(new DynamoDB(this._opts));

		this._tableReady = this.ensureTable(this._opts.tableName).catch((error: unknown) => {
			this.emit("error", error);
		});
	}

	/**
	 * Gets the default TTL fallback in milliseconds (6 hours).
	 */
	public get sixHoursInMilliseconds(): number {
		return this._sixHoursInMilliseconds;
	}

	/**
	 * Sets the default TTL fallback in milliseconds.
	 */
	public set sixHoursInMilliseconds(value: number) {
		this._sixHoursInMilliseconds = value;
	}

	/**
	 * Gets the namespace used to prefix keys.
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Sets the namespace used to prefix keys.
	 */
	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Gets the underlying DynamoDB Document client instance.
	 */
	public get client(): DynamoDBDocument {
		return this._client;
	}

	/**
	 * Sets the underlying DynamoDB Document client instance.
	 */
	public set client(value: DynamoDBDocument) {
		this._client = value;
	}

	/**
	 * Gets the DynamoDB table name.
	 */
	public get tableName(): string {
		return this._opts.tableName;
	}

	/**
	 * Gets the DynamoDB endpoint URL, if configured.
	 */
	public get endpoint(): string | undefined {
		return this._opts.endpoint as string | undefined;
	}

	/**
	 * Gets the separator between the namespace and key.
	 * @default ':'
	 */
	public get keyPrefixSeparator(): string {
		return this._keyPrefixSeparator;
	}

	/**
	 * Sets the separator between the namespace and key.
	 */
	public set keyPrefixSeparator(value: string) {
		this._keyPrefixSeparator = value;
	}

	/**
	 * Creates a prefixed key by prepending the namespace and separator.
	 * @param key - The key to prefix
	 * @param namespace - The namespace to prepend. If not provided, the key is returned as-is.
	 * @returns The prefixed key (e.g., `'namespace:key'`), or the original key if no namespace is given.
	 */
	public createKeyPrefix(key: string, namespace?: string): string {
		if (namespace) {
			return `${namespace}${this._keyPrefixSeparator}${key}`;
		}

		return key;
	}

	/**
	 * Removes the namespace prefix from a key.
	 * @param key - The key to strip the prefix from
	 * @param namespace - The namespace prefix to remove. If not provided, the key is returned as-is.
	 * @returns The key without the namespace prefix.
	 */
	public removeKeyPrefix(key: string, namespace?: string): string {
		if (namespace) {
			return key.replace(`${namespace}${this._keyPrefixSeparator}`, "");
		}

		return key;
	}

	/**
	 * Formats a key by prepending the namespace if one is set. Avoids double-prefixing
	 * by checking if the key already starts with the namespace prefix.
	 * @param key - The key to format
	 * @returns The formatted key with namespace prefix, or the original key if no namespace is set.
	 */
	public formatKey(key: string): string {
		if (!this._namespace) {
			return key;
		}

		const prefix = `${this._namespace}${this._keyPrefixSeparator}`;
		if (key.startsWith(prefix)) {
			return key;
		}

		return `${prefix}${key}`;
	}

	/**
	 * Stores a value in DynamoDB. Uses a 6-hour default TTL if no TTL is specified.
	 * @param key - The key to store
	 * @param value - The value to store
	 * @param ttl - Optional TTL in milliseconds
	 */
	public async set(key: string, value: unknown, ttl?: number): Promise<boolean> {
		try {
			await this._tableReady;

			const now = Date.now();
			const expiresAtMs = typeof ttl === "number" ? now + ttl : now + this._sixHoursInMilliseconds;
			const expiresAt = Math.ceil(expiresAtMs / 1000);

			const putInput: PutCommandInput = {
				TableName: this._opts.tableName,
				Item: {
					id: this.formatKey(key),
					value,
					expiresAt,
					expiresAtMs,
				},
			};

			await this._client.put(putInput);
			return true;
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
			return false;
		}
		/* v8 ignore stop -- @preserve */
	}

	private isExpired(item: Record<string, unknown>, now: number = Date.now()): boolean {
		if (typeof item.expiresAtMs === "number") {
			return item.expiresAtMs <= now;
		}
		if (typeof item.expiresAt === "number") {
			return (item.expiresAt - 1) * 1000 <= now;
		}
		return false;
	}

	/**
	 * Stores multiple values in DynamoDB.
	 * @param entries - An array of objects containing key, value, and optional ttl
	 */
	public async setMany<Value>(entries: KeyvEntry<Value>[]): Promise<boolean[] | undefined> {
		try {
			await this._tableReady;

			if (entries.length === 0) {
				return entries.map(() => true);
			}

			const now = Date.now();

			const putRequests = entries.map(({ key, value, ttl }) => {
				const expiresAtMs =
					typeof ttl === "number" ? now + ttl : now + this._sixHoursInMilliseconds;
				const expiresAt = Math.ceil(expiresAtMs / 1000);

				return {
					PutRequest: {
						Item: {
							id: this.formatKey(key),
							value,
							expiresAt,
							expiresAtMs,
						},
					},
				};
			});

			const results = new Array<boolean>(entries.length).fill(true);

			// Build a map from formatted key to original index for unprocessed item lookup
			const keyToIndex = new Map<string, number>();
			for (let idx = 0; idx < putRequests.length; idx++) {
				const id = putRequests[idx].PutRequest.Item.id as string;
				keyToIndex.set(id, idx);
			}

			// BatchWrite supports max 25 items per request
			const chunkSize = 25;
			for (let i = 0; i < putRequests.length; i += chunkSize) {
				const chunk = putRequests.slice(i, i + chunkSize);
				const batchWriteInput: BatchWriteCommandInput = {
					RequestItems: {
						[this._opts.tableName]: chunk,
					},
				};

				const response = await this._client.batchWrite(batchWriteInput);
				const unprocessed = response.UnprocessedItems?.[this._opts.tableName];
				if (unprocessed) {
					for (const item of unprocessed) {
						const id = item.PutRequest?.Item?.id as string | undefined;
						const index = id ? keyToIndex.get(id) : undefined;
						if (index !== undefined) {
							results[index] = false;
						}
					}
				}
			}

			return results;
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
			return entries.map(() => false);
		}
		/* v8 ignore stop -- @preserve */
	}

	/**
	 * Retrieves a value from DynamoDB.
	 * @param key - The key to retrieve
	 * @returns The stored value, or `undefined` if the key does not exist.
	 */
	public async get<Value>(key: string): Promise<KeyvStorageGetResult<Value>> {
		try {
			await this._tableReady;

			const getInput: GetCommandInput = {
				TableName: this._opts.tableName,
				Key: {
					id: this.formatKey(key),
				},
			};
			const { Item } = await this._client.get(getInput);
			if (!Item) {
				return undefined as KeyvStorageGetResult<Value>;
			}

			if (this.isExpired(Item)) {
				await this.delete(key);
				return undefined as KeyvStorageGetResult<Value>;
			}

			return Item.value as KeyvStorageGetResult<Value>;
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
			return undefined as KeyvStorageGetResult<Value>;
		}
		/* v8 ignore stop -- @preserve */
	}

	/**
	 * Retrieves multiple values from DynamoDB.
	 * @param keys - An array of keys to retrieve
	 * @returns An array of stored data corresponding to each key.
	 */
	public async getMany<Value>(
		keys: string[],
	): Promise<Array<KeyvStorageGetResult<Value | undefined>>> {
		try {
			await this._tableReady;

			const formattedKeys = keys.map((key) => this.formatKey(key));
			const allItems: Record<string, unknown>[] = [];

			// BatchGetItem supports max 100 keys per request
			const chunkSize = 100;
			for (let i = 0; i < formattedKeys.length; i += chunkSize) {
				const chunk = formattedKeys.slice(i, i + chunkSize);
				let unprocessedKeys: BatchGetCommandInput["RequestItems"] | undefined = {
					[this._opts.tableName]: {
						Keys: chunk.map((key) => ({ id: key })),
					},
				};

				while (unprocessedKeys && Object.keys(unprocessedKeys).length > 0) {
					const batchGetInput: BatchGetCommandInput = {
						RequestItems: unprocessedKeys,
					};
					const result = await this._client.batchGet(batchGetInput);
					const items = result.Responses?.[this._opts.tableName] ?? [];
					allItems.push(...items);
					unprocessedKeys =
						result.UnprocessedKeys && Object.keys(result.UnprocessedKeys).length > 0
							? result.UnprocessedKeys
							: undefined;
				}
			}

			const now = Date.now();
			const itemMap = new Map(allItems.map((item) => [item?.id, item]));
			const expiredKeys: string[] = [];
			const results = formattedKeys.map((key) => {
				const item = itemMap.get(key);
				if (!item) {
					return undefined as KeyvStorageGetResult<Value>;
				}

				if (this.isExpired(item, now)) {
					expiredKeys.push(key);
					return undefined as KeyvStorageGetResult<Value>;
				}

				return item.value as KeyvStorageGetResult<Value>;
			});

			// Delete expired entries
			if (expiredKeys.length > 0) {
				await this.deleteMany(expiredKeys);
			}

			return results;
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
			return keys.map(() => undefined as KeyvStorageGetResult<Value>);
		}
		/* v8 ignore stop -- @preserve */
	}

	/**
	 * Deletes a key from DynamoDB.
	 * @param key - The key to delete
	 * @returns `true` if the key was deleted, `false` otherwise.
	 */
	public async delete(key: string) {
		try {
			await this._tableReady;

			const deleteInput: DeleteCommandInput = {
				TableName: this._opts.tableName,
				Key: {
					id: this.formatKey(key),
				},
				ReturnValues: "ALL_OLD",
			};

			const { Attributes } = await this._client.delete(deleteInput);
			return Boolean(Attributes);
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
			return false;
		}
		/* v8 ignore stop -- @preserve */
	}

	/**
	 * Deletes multiple keys from DynamoDB.
	 * @param keys - An array of keys to delete
	 * @returns An array of booleans indicating whether each key was successfully deleted.
	 */
	public async deleteMany(keys: string[]): Promise<boolean[]> {
		try {
			await this._tableReady;

			if (keys.length === 0) {
				return [];
			}

			const results = await Promise.all(keys.map(async (key) => this.delete(key)));

			return results;
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
			return keys.map(() => false);
		}
		/* v8 ignore stop -- @preserve */
	}

	/**
	 * Clears data from DynamoDB. If a namespace is set, only keys with
	 * the namespace prefix are deleted. Otherwise, all keys are deleted.
	 */
	public async clear() {
		try {
			await this._tableReady;

			const scanResult = await this._client.scan({
				TableName: this._opts.tableName,
			});

			const keys = this.extractKey(scanResult);

			await this.deleteMany(keys);
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
		}
		/* v8 ignore stop -- @preserve */
	}

	/**
	 * Checks whether a key exists in DynamoDB.
	 * @param key - The key to check
	 * @returns `true` if the key exists, `false` otherwise.
	 */
	public async has(key: string): Promise<boolean> {
		try {
			await this._tableReady;

			const getInput: GetCommandInput = {
				TableName: this._opts.tableName,
				Key: {
					id: this.formatKey(key),
				},
			};
			const { Item } = await this._client.get(getInput);
			if (!Item) {
				return false;
			}

			if (this.isExpired(Item)) {
				await this.delete(key);
				return false;
			}

			return Item.value !== undefined;
			/* v8 ignore start -- @preserve */
		} catch {
			return false;
		}
		/* v8 ignore stop -- @preserve */
	}

	/**
	 * Checks whether multiple keys exist in DynamoDB.
	 * @param keys - An array of keys to check
	 * @returns An array of booleans indicating whether each key exists.
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		try {
			await this._tableReady;

			const formattedKeys = keys.map((key) => this.formatKey(key));
			const allItems: Record<string, unknown>[] = [];

			// BatchGetItem supports max 100 keys per request
			const chunkSize = 100;
			for (let i = 0; i < formattedKeys.length; i += chunkSize) {
				const chunk = formattedKeys.slice(i, i + chunkSize);
				let unprocessedKeys: BatchGetCommandInput["RequestItems"] | undefined = {
					[this._opts.tableName]: {
						Keys: chunk.map((key) => ({ id: key })),
					},
				};

				while (unprocessedKeys && Object.keys(unprocessedKeys).length > 0) {
					const batchGetInput: BatchGetCommandInput = {
						RequestItems: unprocessedKeys,
					};
					const result = await this._client.batchGet(batchGetInput);
					const items = result.Responses?.[this._opts.tableName] ?? [];
					allItems.push(...items);
					unprocessedKeys =
						result.UnprocessedKeys && Object.keys(result.UnprocessedKeys).length > 0
							? result.UnprocessedKeys
							: undefined;
				}
			}

			const now = Date.now();
			const itemMap = new Map(allItems.map((item) => [item?.id, item]));
			const expiredKeys: string[] = [];
			const results = formattedKeys.map((key) => {
				const item = itemMap.get(key);
				if (!item || item.value === undefined) {
					return false;
				}

				if (this.isExpired(item, now)) {
					expiredKeys.push(key);
					return false;
				}

				return true;
			});

			if (expiredKeys.length > 0) {
				await this.deleteMany(expiredKeys);
			}

			return results;
			/* v8 ignore start -- @preserve */
		} catch {
			return keys.map(() => false);
		}
		/* v8 ignore stop -- @preserve */
	}

	/**
	 * Disconnects from the DynamoDB client. This is a no-op for DynamoDB
	 * since it uses HTTP requests and does not maintain a persistent connection.
	 */
	public async disconnect(): Promise<void> {
		// DynamoDB uses HTTP requests, no persistent connection to close.
	}

	/**
	 * Iterates over all key-value pairs in the store matching the configured namespace.
	 * Keys are returned without the namespace prefix. Does not require a namespace to be
	 * passed; it uses the namespace configured on the adapter.
	 * @yields `[key, value]` pairs as an async generator.
	 */
	public async *iterator<Value>(): AsyncGenerator<
		Array<string | Awaited<Value> | undefined>,
		void
	> {
		await this._tableReady;

		const prefix = this._namespace ? `${this._namespace}${this._keyPrefixSeparator}` : "";
		let lastEvaluatedKey: Record<string, unknown> | undefined;

		do {
			const scanParams: ScanCommandInput = {
				TableName: this._opts.tableName,
				ExclusiveStartKey: lastEvaluatedKey,
			};

			if (prefix) {
				scanParams.FilterExpression = "begins_with(id, :prefix)";
				scanParams.ExpressionAttributeValues = { ":prefix": prefix };
			}

			const scanResult = await this._client.scan(scanParams);

			lastEvaluatedKey = scanResult.LastEvaluatedKey as Record<string, unknown> | undefined;

			const now = Date.now();
			for (const item of scanResult.Items ?? []) {
				/* v8 ignore next 3 -- @preserve */
				if (this.isExpired(item, now)) {
					await this.delete(item.id as string);
					continue;
				}

				yield [
					this.removeKeyPrefix(item.id as string, this._namespace),
					item.value as Awaited<Value>,
				];
			}
		} while (lastEvaluatedKey);
	}

	/**
	 * Extracts keys from a DynamoDB scan result, filtering by namespace.
	 * @param output - The scan command output
	 * @param keyProperty - The property name for the key field (default: 'id')
	 * @returns An array of matching keys.
	 */
	public extractKey(output: ScanCommandOutput, keyProperty = "id"): string[] {
		const prefix = this._namespace ? `${this._namespace}${this._keyPrefixSeparator}` : "";
		return (output.Items ?? [])
			.map((item) => item[keyProperty])
			.filter((key) => key.startsWith(prefix));
	}

	/**
	 * Ensures the DynamoDB table exists and is active.
	 * @param tableName - The table name to check or create
	 */
	public async ensureTable(tableName: string): Promise<void> {
		try {
			const response = await this._client.send(new DescribeTableCommand({ TableName: tableName }));
			// Table exists but may be in CREATING status - wait if needed
			if (response.Table?.TableStatus !== "ACTIVE") {
				await waitUntilTableExists(
					{ client: this._client, maxWaitTime: 60 },
					{ TableName: tableName },
				);
			}
		} catch (error) {
			if (
				error instanceof ResourceNotFoundException ||
				(error as Error).name === "ResourceNotFoundException"
			) {
				await this.createTable(tableName);
			} else {
				throw error;
			}
		}
	}

	/**
	 * Creates a new DynamoDB table with TTL support.
	 * @param tableName - The table name to create
	 */
	public async createTable(tableName: string): Promise<void> {
		try {
			// Check if the table already exists before attempting to create it
			const response = await this._client.send(new DescribeTableCommand({ TableName: tableName }));

			/* v8 ignore start -- @preserve */
			// Table already exists - wait for it to become active if needed
			if (response.Table?.TableStatus !== "ACTIVE") {
				await waitUntilTableExists(
					{ client: this._client, maxWaitTime: 60 },
					{ TableName: tableName },
				);
			}

			return;
		} catch (error) {
			// Table does not exist, proceed to create it
			if (
				!(error instanceof ResourceNotFoundException) &&
				(error as Error).name !== "ResourceNotFoundException"
			) {
				throw error;
			}
			/* v8 ignore stop */
		}

		try {
			await this._client.send(
				new CreateTableCommand({
					TableName: tableName,
					KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
					AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
					BillingMode: "PAY_PER_REQUEST",
				}),
			);

			await waitUntilTableExists(
				{ client: this._client, maxWaitTime: 60 },
				{ TableName: tableName },
			);

			try {
				await this._client.send(
					new UpdateTimeToLiveCommand({
						TableName: tableName,
						TimeToLiveSpecification: {
							AttributeName: "expiresAt",
							Enabled: true,
						},
					}),
				);
			} catch {
				// TTL may already be enabled by a concurrent creator - safe to ignore
			}
		} catch (error) {
			/* v8 ignore next -- @preserve */
			if (
				error instanceof ResourceInUseException ||
				(error as Error).name === "ResourceInUseException"
			) {
				await waitUntilTableExists(
					{ client: this._client, maxWaitTime: 60 },
					{ TableName: tableName },
				);

				// Ensure TTL is enabled even when we lost the table creation race
				try {
					await this._client.send(
						new UpdateTimeToLiveCommand({
							TableName: tableName,
							TimeToLiveSpecification: {
								AttributeName: "expiresAt",
								Enabled: true,
							},
						}),
					);
				} catch {
					// TTL may already be enabled - safe to ignore
				}
			} else {
				throw error;
			}
		}
	}
}

export default KeyvDynamo;
export type KeyvDynamoOptions = {
	namespace?: string;
	tableName?: string;
	/** Alias for `endpoint`. `endpoint` takes precedence when both are set. */
	uri?: string;
} & DynamoDBClientConfig;

/**
 * Creates a Keyv instance with the DynamoDB adapter.
 * @param options - Options for the adapter including DynamoDB client configuration and table settings.
 * @returns A Keyv instance with the DynamoDB adapter
 */
export function createKeyv(options?: KeyvDynamoOptions | string): Keyv {
	const adapter = new KeyvDynamo(options ?? {});

	if (typeof options === "object" && options?.namespace) {
		adapter.namespace = options.namespace;
		const keyv = new Keyv(adapter, {
			namespace: options.namespace,
		});

		return keyv;
	}

	const keyv = new Keyv(adapter);
	keyv.namespace = undefined; // Ensure no namespace is set
	return keyv;
}

export { Keyv } from "keyv";
