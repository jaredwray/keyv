import {
	ClusterScanCursor,
	Decoder,
	GlideClient,
	type GlideClientConfiguration,
	GlideClusterClient,
	type GlideString,
	TimeUnit,
} from "@valkey/valkey-glide";
import { Hookified } from "hookified";
import Keyv, {
	type KeyvAny,
	type KeyvStorageAdapter,
	type KeyvStorageCapability,
	type KeyvStorageEntry,
	type KeyvStorageGetResult,
	keyvStorageCapability,
} from "keyv";
import type {
	KeyvValkeyGlideClient,
	KeyvValkeyGlideConnect,
	KeyvValkeyGlideOptions,
} from "./types.js";

const adapterOptionKeys = new Set(["uri", "cluster", "useSets", "namespace"]);

/**
 * Valkey GLIDE storage adapter for Keyv. Supports standalone and cluster clients
 * via `@valkey/valkey-glide`. Multi-key commands (`mget`, `unlink`, `mset`) are
 * cluster-aware in GLIDE, including AZ affinity when `readFrom` / `clientAz` are set.
 *
 * Client creation is async, so the constructor is lazy: the first storage call
 * (or {@link getClient}) establishes the connection.
 */
export class KeyvValkeyGlide extends Hookified implements KeyvStorageAdapter {
	private _namespace?: string;
	private _useSets = false;
	private _cluster = false;
	private _client?: KeyvValkeyGlideClient;
	private _closed = false;
	private _connectPromise?: Promise<KeyvValkeyGlideClient>;
	private readonly _glideConfig: GlideClientConfiguration;

	/**
	 * Creates a new KeyvValkeyGlide adapter.
	 *
	 * @param {KeyvValkeyGlideConnect} [connect] - URI, options, or an existing GLIDE client.
	 * @param {KeyvValkeyGlideOptions} [options] - Adapter options merged over `connect`.
	 */
	constructor(connect?: KeyvValkeyGlideConnect, options?: KeyvValkeyGlideOptions) {
		super({ throwOnEmptyListeners: false });

		if (isGlideClient(connect)) {
			this._client = connect;
			this._cluster = connect instanceof GlideClusterClient;
			this._glideConfig = { addresses: [] };
			if (options?.useSets !== undefined) {
				this._useSets = options.useSets;
			}

			if (options?.namespace !== undefined) {
				this._namespace = options.namespace;
			}

			this.emit("connect", this._client);
			return;
		}

		const merged: KeyvValkeyGlideOptions = {
			...(typeof connect === "string" ? { uri: connect } : (connect ?? {})),
			...options,
		};

		if (merged.useSets !== undefined) {
			this._useSets = merged.useSets;
		}

		if (merged.namespace !== undefined) {
			this._namespace = merged.namespace;
		}

		this._cluster = merged.cluster === true;
		this._glideConfig = toGlideConfig(merged);
	}

	public get capabilities(): KeyvStorageCapability {
		return keyvStorageCapability(this);
	}

	public get namespace(): string | undefined {
		return this._namespace;
	}

	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	public get useSets(): boolean {
		return this._useSets;
	}

	public set useSets(value: boolean) {
		this._useSets = value;
	}

	/**
	 * The current GLIDE client. Throws if {@link getClient} has not run yet and no
	 * existing client was passed to the constructor.
	 */
	public get client(): KeyvValkeyGlideClient {
		if (!this._client) {
			throw new Error("Valkey GLIDE client is not connected. Call getClient() first.");
		}

		return this._client;
	}

	public set client(value: KeyvValkeyGlideClient) {
		this._connectPromise = undefined;
		this._closed = false;
		this._client = value;
		this._cluster = value instanceof GlideClusterClient;
		this.emit("connect", value);
	}

	/**
	 * Returns a connected GLIDE client, creating one from the constructor config if needed.
	 */
	public async getClient(): Promise<KeyvValkeyGlideClient> {
		if (this._client) {
			return this._client;
		}

		if (this._closed) {
			throw new Error("Valkey GLIDE client is disconnected");
		}

		if (this._connectPromise) {
			return this._connectPromise;
		}

		const attempt = this.createClient().finally(() => {
			if (this._connectPromise === attempt) {
				this._connectPromise = undefined;
			}
		});
		this._connectPromise = attempt;
		return attempt;
	}

	public async get<Value>(key: string): Promise<KeyvStorageGetResult<Value>> {
		const client = await this.getClient();
		const value = await client.get(this.getKeyName(key));
		return asString(value) as KeyvStorageGetResult<Value>;
	}

	public async getMany<Value>(
		keys: string[],
	): Promise<Array<KeyvStorageGetResult<Value | undefined>>> {
		if (keys.length === 0) {
			return [];
		}

		const client = await this.getClient();
		const resolvedKeys = keys.map((key) => this.getKeyName(key));
		const values = await client.mget(resolvedKeys);
		return values.map((value) => asString(value)) as Array<KeyvStorageGetResult<Value | undefined>>;
	}

	public async set(key: string, value: KeyvAny, expires?: number): Promise<boolean> {
		if (value === undefined) {
			return false;
		}

		try {
			const client = await this.getClient();
			const resolved = this.getKeyName(key);
			await client.set(resolved, toGlideValue(value), setOptions(expires));
			if (this._useSets) {
				await client.sadd(this.getSetKey(), [resolved]);
			}

			return true;
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
			return false;
		}
		/* v8 ignore stop -- @preserve */
	}

	public async setMany<Value>(entries: KeyvStorageEntry<Value>[]): Promise<boolean[] | undefined> {
		if (entries.length === 0) {
			return entries.map(() => true);
		}

		return Promise.all(
			entries.map(async ({ key, value, expires }) => this.set(key, value, expires)),
		);
	}

	public async delete(key: string): Promise<boolean> {
		const client = await this.getClient();
		const resolved = this.getKeyName(key);
		if (this._useSets) {
			const [unlinked] = await Promise.all([
				client.unlink([resolved]),
				client.srem(this.getSetKey(), [resolved]),
			]);
			return unlinked > 0;
		}

		const unlinked = await client.unlink([resolved]);
		return unlinked > 0;
	}

	public async deleteMany(keys: string[]): Promise<boolean[]> {
		if (keys.length === 0) {
			return [];
		}

		return Promise.all(keys.map(async (key) => this.delete(key)));
	}

	public async has(key: string): Promise<boolean> {
		const client = await this.getClient();
		const count = await client.exists([this.getKeyName(key)]);
		return count !== 0;
	}

	public async hasMany(keys: string[]): Promise<boolean[]> {
		if (keys.length === 0) {
			return [];
		}

		const values = await this.getMany(keys);
		return values.map((value) => value !== undefined);
	}

	public async clear(): Promise<void> {
		const client = await this.getClient();
		if (this._useSets) {
			const setKey = this.getSetKey();
			const keys = glideSetMembers(await client.smembers(setKey));
			if (keys.length > 0) {
				await Promise.all([client.unlink(keys), client.srem(setKey, keys)]);
			}

			if (this.namespace) {
				const legacySetKey = `namespace:${this.namespace}`;
				const legacyKeyType = await client.type(legacySetKey);
				if (legacyKeyType === "set") {
					const legacyKeys = glideSetMembers(await client.smembers(legacySetKey));
					if (legacyKeys.length > 0) {
						await Promise.all([client.unlink(legacyKeys), client.srem(legacySetKey, legacyKeys)]);
					}

					await client.unlink([legacySetKey]);
				}
			}

			return;
		}

		const prefix = this.getKeyPrefix();
		const pattern = prefix ? `${prefix}*` : "*";
		const keys = await this.listKeys(client, pattern);
		if (keys.length > 0) {
			await client.unlink(keys);
		}
	}

	public async *iterator<Value>(): AsyncGenerator<[string, Value | undefined], void, unknown> {
		const client = await this.getClient();
		const keyPrefix = this.getKeyPrefix();
		const prefix = keyPrefix ? `${keyPrefix}:` : "";
		const match = prefix ? `${prefix}*` : "*";
		const keys = await this.listKeys(client, match);
		if (keys.length === 0) {
			return;
		}

		const values = await client.mget(keys);
		for (const [index, storedKey] of keys.entries()) {
			const key = prefix ? storedKey.slice(prefix.length) : storedKey;
			const value = asString(values[index]) as Value | undefined;
			yield [key, value];
		}
	}

	public async disconnect(): Promise<void> {
		this._connectPromise = undefined;
		this._closed = true;
		if (!this._client) {
			return;
		}

		const client = this._client;
		client.close();
		this._client = undefined;
		this.emit("disconnect", client);
	}

	private async createClient(): Promise<KeyvValkeyGlideClient> {
		try {
			const client = this._cluster
				? await GlideClusterClient.createClient(this._glideConfig)
				: await GlideClient.createClient(this._glideConfig);
			this._client = client;
			this.emit("connect", client);
			return client;
		} catch (error) {
			this.emit("error", error);
			throw error;
		}
	}

	private getSetKey(): string {
		if (this.namespace) {
			return `sets:${this.namespace}`;
		}

		return "sets";
	}

	private getKeyPrefix(): string {
		if (this._useSets) {
			if (this.namespace) {
				return `sets:${this.namespace}`;
			}

			return "sets";
		}

		if (this.namespace) {
			return `namespace:${this.namespace}`;
		}

		return "";
	}

	private getKeyName(key: string): string {
		const prefix = this.getKeyPrefix();
		if (prefix) {
			return `${prefix}:${key}`;
		}

		return key;
	}

	private async listKeys(client: KeyvValkeyGlideClient, pattern: string): Promise<string[]> {
		if (client instanceof GlideClusterClient) {
			return this.scanClusterKeys(client, pattern);
		}

		return this.scanStandaloneKeys(client, pattern);
	}

	private async scanClusterKeys(client: GlideClusterClient, match: string): Promise<string[]> {
		let cursor = new ClusterScanCursor();
		const found: string[] = [];
		while (!cursor.isFinished()) {
			const [next, keys] = await client.scan(cursor, { match });
			cursor = next;
			for (const key of keys) {
				const asKey = asString(key);
				if (asKey) {
					found.push(asKey);
				}
			}
		}

		return found;
	}

	private async scanStandaloneKeys(client: GlideClient, match: string): Promise<string[]> {
		let cursor = "0";
		const found: string[] = [];
		do {
			const [next, keys] = await client.scan(cursor, { match });
			cursor = String(next);
			for (const key of keys) {
				const asKey = asString(key);
				if (asKey) {
					found.push(asKey);
				}
			}
		} while (cursor !== "0");

		return found;
	}
}

/**
 * Creates a Keyv instance backed by {@link KeyvValkeyGlide}.
 */
export function createKeyv(
	connect?: KeyvValkeyGlideConnect,
	options?: KeyvValkeyGlideOptions,
): Keyv {
	connect ??= "redis://localhost:6379";
	const adapter = new KeyvValkeyGlide(connect, options);
	return new Keyv({ store: adapter, namespace: adapter.namespace });
}

export default KeyvValkeyGlide;
export type {
	KeyvValkeyGlideClient,
	KeyvValkeyGlideConnect,
	KeyvValkeyGlideOptions,
} from "./types.js";

function isGlideClient(value: unknown): value is KeyvValkeyGlideClient {
	return value instanceof GlideClient || value instanceof GlideClusterClient;
}

function toGlideConfig(options: KeyvValkeyGlideOptions): GlideClientConfiguration {
	const rest: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(options)) {
		if (!adapterOptionKeys.has(key) && value !== undefined) {
			rest[key] = value;
		}
	}

	const fromUri = options.uri ? parseConnectionUri(options.uri) : undefined;
	const addresses = (rest.addresses as GlideClientConfiguration["addresses"] | undefined) ??
		fromUri?.addresses ?? [{ host: "localhost", port: 6379 }];

	return {
		...fromUri,
		...rest,
		addresses,
		defaultDecoder: (rest.defaultDecoder as Decoder | undefined) ?? Decoder.String,
	} as GlideClientConfiguration;
}

function parseConnectionUri(uri: string): Partial<GlideClientConfiguration> {
	const url = new URL(uri);
	const protocol = url.protocol.replace(":", "");
	const useTLS = protocol === "rediss" || protocol === "valkeys";
	const port = url.port ? Number(url.port) : 6379;
	const config: Partial<GlideClientConfiguration> = {
		addresses: [{ host: url.hostname || "localhost", port }],
		useTLS,
	};

	if (url.username || url.password) {
		config.credentials = {
			username: url.username ? decodeURIComponent(url.username) : undefined,
			password: decodeURIComponent(url.password),
		};
	}

	const database = url.pathname.replace(/^\//, "");
	if (database) {
		const databaseId = Number(database);
		if (Number.isFinite(databaseId)) {
			config.databaseId = databaseId;
		}
	}

	return config;
}

function setOptions(expires?: number) {
	if (typeof expires === "number") {
		return {
			expiry: { type: TimeUnit.UnixMilliseconds, count: Math.trunc(expires) },
		};
	}

	return undefined;
}

function toGlideValue(value: KeyvAny): string {
	if (typeof value === "string") {
		return value;
	}

	if (value instanceof Uint8Array) {
		return Buffer.from(value).toString();
	}

	return String(value);
}

function glideSetMembers(values: Iterable<GlideString>): string[] {
	const keys: string[] = [];
	for (const member of values) {
		const asKey = asString(member);
		if (asKey) {
			keys.push(asKey);
		}
	}

	return keys;
}

function asString(value: GlideString | null | undefined): string | undefined {
	if (value === null || value === undefined) {
		return undefined;
	}

	if (typeof value === "string") {
		return value;
	}

	return Buffer.from(value).toString();
}
