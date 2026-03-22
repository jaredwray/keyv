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
	type ScanCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import { Hookified } from "hookified";
import { Keyv, type KeyvStoreAdapter, type StoredData } from "keyv";

export class KeyvDynamo extends Hookified implements KeyvStoreAdapter {
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

		this._opts = {
			tableName: "keyv",
			dialect: "dynamo",
			...options,
		};

		this._client = DynamoDBDocument.from(new DynamoDB(this._opts));

		this._tableReady = this.ensureTable(this._opts.tableName).catch(
			(error: unknown) => {
				this.emit("error", error);
			},
		);
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
	 * Gets the merged configuration options. Read-only.
	 */
	public get opts(): Omit<KeyvDynamoOptions, "tableName"> & {
		tableName: string;
	} {
		return this._opts;
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
	public async set(key: string, value: unknown, ttl?: number) {
		try {
			await this._tableReady;

			const sixHoursFromNowEpoch = Math.floor(
				(Date.now() + this._sixHoursInMilliseconds) / 1000,
			);

			const expiresAt =
				typeof ttl === "number"
					? Math.floor((Date.now() + (ttl + 1000)) / 1000)
					: sixHoursFromNowEpoch;

			const putInput: PutCommandInput = {
				TableName: this._opts.tableName,
				Item: {
					id: this.formatKey(key),
					value,
					expiresAt,
				},
			};

			await this._client.put(putInput);
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
		}
		/* v8 ignore stop -- @preserve */
	}

	/**
	 * Stores multiple values in DynamoDB.
	 * @param entries - An array of objects containing key, value, and optional ttl
	 */
	public async setMany(
		entries: Array<{ key: string; value: unknown; ttl?: number }>,
	): Promise<void> {
		try {
			await this._tableReady;

			if (entries.length === 0) {
				return;
			}

			const sixHoursFromNowEpoch = Math.floor(
				(Date.now() + this._sixHoursInMilliseconds) / 1000,
			);

			const putRequests = entries.map(({ key, value, ttl }) => {
				const expiresAt =
					typeof ttl === "number"
						? Math.floor((Date.now() + (ttl + 1000)) / 1000)
						: sixHoursFromNowEpoch;

				return {
					PutRequest: {
						Item: {
							id: this.formatKey(key),
							value,
							expiresAt,
						},
					},
				};
			});

			// BatchWrite supports max 25 items per request
			const chunkSize = 25;
			for (let i = 0; i < putRequests.length; i += chunkSize) {
				const chunk = putRequests.slice(i, i + chunkSize);
				const batchWriteInput: BatchWriteCommandInput = {
					RequestItems: {
						[this._opts.tableName]: chunk,
					},
				};

				await this._client.batchWrite(batchWriteInput);
			}
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
		}
		/* v8 ignore stop -- @preserve */
	}

	/**
	 * Retrieves a value from DynamoDB.
	 * @param key - The key to retrieve
	 * @returns The stored value, or `undefined` if the key does not exist.
	 */
	public async get<Value>(key: string): Promise<StoredData<Value>> {
		try {
			await this._tableReady;

			const getInput: GetCommandInput = {
				TableName: this._opts.tableName,
				Key: {
					id: this.formatKey(key),
				},
			};
			const { Item } = await this._client.get(getInput);
			return Item?.value as StoredData<Value>;
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
			return undefined as StoredData<Value>;
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
	): Promise<Array<StoredData<Value | undefined>>> {
		try {
			await this._tableReady;

			const formattedKeys = keys.map((key) => this.formatKey(key));
			const allItems: Record<string, unknown>[] = [];

			// BatchGetItem supports max 100 keys per request
			const chunkSize = 100;
			for (let i = 0; i < formattedKeys.length; i += chunkSize) {
				const chunk = formattedKeys.slice(i, i + chunkSize);
				let unprocessedKeys: BatchGetCommandInput["RequestItems"] | undefined =
					{
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
						result.UnprocessedKeys &&
						Object.keys(result.UnprocessedKeys).length > 0
							? result.UnprocessedKeys
							: undefined;
				}
			}

			return formattedKeys.map(
				(key) =>
					allItems.find((item) => item?.id === key)?.value as StoredData<Value>,
			);
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
			return keys.map(() => undefined as StoredData<Value>);
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
	 * @returns `true` if all keys were successfully deleted, `false` otherwise.
	 */
	public async deleteMany(keys: string[]) {
		try {
			await this._tableReady;

			if (keys.length === 0) {
				return false;
			}

			const formattedKeys = keys.map((key) => this.formatKey(key));

			const items = await this.getMany(keys);

			if (items.filter(Boolean).length === 0) {
				return false;
			}

			// BatchWriteItem supports max 25 items per request
			const chunkSize = 25;
			for (let i = 0; i < formattedKeys.length; i += chunkSize) {
				const chunk = formattedKeys.slice(i, i + chunkSize);
				let unprocessedItems:
					| BatchWriteCommandInput["RequestItems"]
					| undefined = {
					[this._opts.tableName]: chunk.map((key) => ({
						DeleteRequest: {
							Key: {
								id: key,
							},
						},
					})),
				};

				while (unprocessedItems && Object.keys(unprocessedItems).length > 0) {
					const batchDeleteInput: BatchWriteCommandInput = {
						RequestItems: unprocessedItems,
					};
					const response = await this._client.batchWrite(batchDeleteInput);
					unprocessedItems =
						response.UnprocessedItems &&
						Object.keys(response.UnprocessedItems).length > 0
							? response.UnprocessedItems
							: undefined;
				}
			}

			return true;
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
			return false;
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

			const nowInSeconds = Math.floor(Date.now() / 1000);
			if (
				typeof Item.expiresAt === "number" &&
				Item.expiresAt <= nowInSeconds
			) {
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
				let unprocessedKeys: BatchGetCommandInput["RequestItems"] | undefined =
					{
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
						result.UnprocessedKeys &&
						Object.keys(result.UnprocessedKeys).length > 0
							? result.UnprocessedKeys
							: undefined;
				}
			}

			const nowInSeconds = Math.floor(Date.now() / 1000);
			return formattedKeys.map((key) => {
				const item = allItems.find((item) => item?.id === key);
				if (!item || item.value === undefined) {
					return false;
				}

				if (
					typeof item.expiresAt === "number" &&
					item.expiresAt <= nowInSeconds
				) {
					return false;
				}

				return true;
			});
			/* v8 ignore start -- @preserve */
		} catch {
			return keys.map(() => false);
		}
		/* v8 ignore stop -- @preserve */
	}

	/**
	 * Extracts keys from a DynamoDB scan result, filtering by namespace.
	 * @param output - The scan command output
	 * @param keyProperty - The property name for the key field (default: 'id')
	 * @returns An array of matching keys.
	 */
	public extractKey(output: ScanCommandOutput, keyProperty = "id"): string[] {
		const prefix = this._namespace
			? `${this._namespace}${this._keyPrefixSeparator}`
			: "";
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
			const response = await this._client.send(
				new DescribeTableCommand({ TableName: tableName }),
			);
			// Table exists but may be in CREATING status - wait if needed
			if (response.Table?.TableStatus !== "ACTIVE") {
				await waitUntilTableExists(
					{ client: this._client, maxWaitTime: 60 },
					{ TableName: tableName },
				);
			}
		} catch (error) {
			if (error instanceof ResourceNotFoundException) {
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

			await this._client.send(
				new UpdateTimeToLiveCommand({
					TableName: tableName,
					TimeToLiveSpecification: {
						AttributeName: "expiresAt",
						Enabled: true,
					},
				}),
			);
		} catch (error) {
			/* v8 ignore next -- @preserve */
			if (error instanceof ResourceInUseException) {
				await waitUntilTableExists(
					{ client: this._client, maxWaitTime: 60 },
					{ TableName: tableName },
				);
			} else {
				throw error;
			}
		}
	}
}

export default KeyvDynamo;
export type KeyvDynamoOptions = {
	namespace?: string;
	dialect?: string;
	tableName?: string;
} & DynamoDBClientConfig;

/**
 * Creates a Keyv instance with the DynamoDB adapter. Sets useKeyPrefix to false
 * since the adapter handles its own key prefixing via namespace.
 * @param options - Options for the adapter including DynamoDB client configuration and table settings.
 * @returns A Keyv instance with the DynamoDB adapter
 */
export function createKeyv(options?: KeyvDynamoOptions | string): Keyv {
	const adapter = new KeyvDynamo(options ?? {});

	if (typeof options === "object" && options?.namespace) {
		adapter.namespace = options.namespace;
		const keyv = new Keyv(adapter, {
			namespace: options.namespace,
			useKeyPrefix: false,
		});

		return keyv;
	}

	const keyv = new Keyv(adapter, { useKeyPrefix: false });
	keyv.namespace = undefined; // Ensure no namespace is set
	return keyv;
}

export { Keyv } from "keyv";
