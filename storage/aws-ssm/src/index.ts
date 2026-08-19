import {
	DeleteParameterCommand,
	DeleteParametersCommand,
	GetParameterCommand,
	GetParametersByPathCommand,
	GetParametersCommand,
	type Parameter,
	ParameterNotFound,
	type ParameterTier,
	type ParameterType,
	PutParameterCommand,
	type SSMClient,
} from "@aws-sdk/client-ssm";
import { Hookified } from "hookified";
import {
	jsonSerializer,
	Keyv,
	type KeyvAny,
	type KeyvStorageEntry,
	type KeyvStorageGetResult,
	keyvStorageCapability,
} from "keyv";

/** Maximum number of parameter names accepted per `GetParameters`/`DeleteParameters` call. */
const maxBatchSize = 10;

/**
 * Configuration options for the KeyvAwsSsm adapter.
 */
export type KeyvAwsSsmOptions = {
	/**
	 * The AWS SDK v3 `SSMClient` instance used for all Parameter Store operations.
	 * Required — the adapter never creates or owns a client itself, since Parameter
	 * Store access typically needs application-managed credentials/configuration
	 * (IAM roles, profiles, STS, etc.). The adapter never calls `.destroy()` on it.
	 */
	client: SSMClient;
	/**
	 * Path-style prefix prepended to every parameter name. Normalized to always
	 * start and end with `/`. Also acts as a safety boundary: `clear()` and
	 * `iterator()` only ever read or delete parameters under this hierarchy.
	 * @default '/keyv/'
	 */
	keyPrefix?: string;
	/** Optional namespace for key isolation, inserted between `keyPrefix` and the key. */
	namespace?: string;
	/**
	 * Separator between the namespace and key segments. SSM parameter names only
	 * allow letters, numbers, `.`, `-`, `_`, and `/` (no `:`), so this defaults to
	 * `/` rather than the `:` used by most other Keyv adapters.
	 * @default '/'
	 */
	keyPrefixSeparator?: string;
	/**
	 * The SSM parameter type used when writing values. Use `SecureString` (with
	 * `keyId`) to encrypt values at rest via KMS.
	 * @default 'String'
	 */
	type?: ParameterType;
	/**
	 * The SSM parameter tier used when writing values. `Standard` parameters are
	 * limited to 4 KB values; `Advanced` and `IntelligentTiering` allow up to 8 KB.
	 * @default 'Standard'
	 */
	tier?: ParameterTier;
	/** The KMS key ID, alias, or ARN used to encrypt values when `type` is `SecureString`. */
	keyId?: string;
};

/**
 * Splits an array into chunks of at most `size` items.
 * @param items - The array to split
 * @param size - The maximum size of each chunk
 * @returns An array of chunks.
 */
function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}

	return chunks;
}

/**
 * Checks whether an error is (or looks like) a named AWS SDK exception, matching
 * both `instanceof` checks and duck-typed `{ name }` errors (e.g. across SDK versions).
 * @param error - The error to inspect
 * @param name - The exception name to match (e.g. `'ParameterNotFound'`)
 * @returns `true` if the error matches the given name.
 */
function isAwsErrorNamed(error: unknown, name: string): boolean {
	return error instanceof Error && error.name === name;
}

/**
 * AWS SSM (Systems Manager Parameter Store) storage adapter for Keyv.
 *
 * Parameter Store has no native, millisecond-precise per-parameter expiry, so
 * values are stored as a JSON envelope (`{ v, e }`) and expiry is enforced
 * client-side on every read, with lazy deletion of expired parameters — the
 * same technique used by `@keyv/etcd`.
 *
 * @example
 * ```typescript
 * import { SSMClient } from '@aws-sdk/client-ssm';
 * import Keyv from 'keyv';
 * import KeyvAwsSsm from '@keyv/aws-ssm';
 *
 * const client = new SSMClient({ region: 'us-east-1' });
 * const store = new KeyvAwsSsm({ client });
 * const keyv = new Keyv({ store });
 * ```
 */
export class KeyvAwsSsm<GenericValue = KeyvAny> extends Hookified {
	/** Declares the v6 absolute-`expires` storage contract via `capabilities.expires`. */
	public get capabilities() {
		return keyvStorageCapability(this);
	}

	private _client: SSMClient;
	private _namespace?: string;
	private _keyPrefix = "/keyv/";
	private _keyPrefixSeparator = "/";
	private _type: ParameterType = "String";
	private _tier: ParameterTier = "Standard";
	private _keyId?: string;

	/**
	 * Creates a new KeyvAwsSsm adapter.
	 * @param options - A {@link KeyvAwsSsmOptions} object. `options.client` is required —
	 * an error is thrown if it is missing.
	 */
	constructor(options: KeyvAwsSsmOptions) {
		super({ throwOnEmptyListeners: false });

		if (!options?.client) {
			throw new Error("KeyvAwsSsm requires an SSMClient instance via `options.client`.");
		}

		this._client = options.client;

		if (options.namespace) {
			this._namespace = options.namespace;
		}

		if (options.keyPrefixSeparator) {
			this._keyPrefixSeparator = options.keyPrefixSeparator;
		}

		if (options.keyPrefix) {
			this._keyPrefix = this.normalizeKeyPrefix(options.keyPrefix);
		}

		if (options.type) {
			this._type = options.type;
		}

		if (options.tier) {
			this._tier = options.tier;
		}

		this._keyId = options.keyId;
	}

	/**
	 * Gets the underlying SSM client instance.
	 * @returns The `SSMClient` used for all operations.
	 */
	public get client(): SSMClient {
		return this._client;
	}

	/**
	 * Sets the underlying SSM client instance.
	 * @param value - The `SSMClient` to use for all operations.
	 */
	public set client(value: SSMClient) {
		this._client = value;
	}

	/**
	 * Gets the namespace used to prefix keys.
	 * @default undefined
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
	 * Gets the path-style prefix prepended to every parameter name.
	 * @default '/keyv/'
	 */
	public get keyPrefix(): string {
		return this._keyPrefix;
	}

	/**
	 * Sets the path-style prefix prepended to every parameter name. Normalized to
	 * always start and end with `/`, collapsing repeated slashes.
	 */
	public set keyPrefix(value: string) {
		this._keyPrefix = this.normalizeKeyPrefix(value);
	}

	/**
	 * Gets the separator between the namespace and key segments.
	 * @default '/'
	 */
	public get keyPrefixSeparator(): string {
		return this._keyPrefixSeparator;
	}

	/**
	 * Sets the separator between the namespace and key segments.
	 */
	public set keyPrefixSeparator(value: string) {
		this._keyPrefixSeparator = value;
	}

	/**
	 * Gets the SSM parameter type used when writing values.
	 * @default 'String'
	 */
	public get type(): ParameterType {
		return this._type;
	}

	/**
	 * Sets the SSM parameter type used when writing values.
	 */
	public set type(value: ParameterType) {
		this._type = value;
	}

	/**
	 * Gets the SSM parameter tier used when writing values.
	 * @default 'Standard'
	 */
	public get tier(): ParameterTier {
		return this._tier;
	}

	/**
	 * Sets the SSM parameter tier used when writing values.
	 */
	public set tier(value: ParameterTier) {
		this._tier = value;
	}

	/**
	 * Gets the KMS key ID, alias, or ARN used to encrypt values when `type` is `SecureString`.
	 */
	public get keyId(): string | undefined {
		return this._keyId;
	}

	/**
	 * Sets the KMS key ID, alias, or ARN used to encrypt values when `type` is `SecureString`.
	 */
	public set keyId(value: string | undefined) {
		this._keyId = value;
	}

	/**
	 * Creates a prefixed key by prepending the namespace and separator.
	 * @param key - The key to prefix
	 * @param namespace - The namespace to prepend. If not provided, the key is returned as-is.
	 * @returns The prefixed key (e.g., `'namespace/key'`), or the original key if no namespace is given.
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
	 * Formats a key into its fully qualified SSM parameter name: `keyPrefix` + namespace
	 * (if set) + key. Avoids double-prefixing if the key already starts with `keyPrefix`.
	 * @param key - The key to format
	 * @returns The fully qualified SSM parameter name (e.g. `'/keyv/ns/key'`).
	 */
	public formatKey(key: string): string {
		if (key.startsWith(this._keyPrefix)) {
			return key;
		}

		const withNamespace = this.createKeyPrefix(key, this._namespace);
		return `${this._keyPrefix}${withNamespace}`.replace(/\/{2,}/g, "/");
	}

	/**
	 * Retrieves a value from SSM Parameter Store.
	 * @param key - The key to retrieve
	 * @returns The stored value, or `undefined` if the key does not exist or has expired.
	 */
	public async get(key: string): Promise<KeyvStorageGetResult<GenericValue>> {
		try {
			const { Parameter } = await this._client.send(
				new GetParameterCommand({ Name: this.formatKey(key), WithDecryption: true }),
			);

			if (Parameter?.Value === undefined) {
				return undefined as KeyvStorageGetResult<GenericValue>;
			}

			const { value, expired } = this.unwrapValue<GenericValue>(Parameter.Value);
			if (expired) {
				await this.delete(key);
				return undefined as KeyvStorageGetResult<GenericValue>;
			}

			return value as KeyvStorageGetResult<GenericValue>;
		} catch (error) {
			if (error instanceof ParameterNotFound || isAwsErrorNamed(error, "ParameterNotFound")) {
				return undefined as KeyvStorageGetResult<GenericValue>;
			}

			this.emit("error", error);
			return undefined as KeyvStorageGetResult<GenericValue>;
		}
	}

	/**
	 * Retrieves multiple values from SSM Parameter Store, batched into groups of
	 * {@link maxBatchSize} names per `GetParameters` call (an AWS-enforced limit).
	 * @param keys - An array of keys to retrieve
	 * @returns An array of stored data corresponding to each key, with `undefined` for
	 * keys that are missing or expired.
	 */
	public async getMany(keys: string[]): Promise<Array<KeyvStorageGetResult<GenericValue>>> {
		if (keys.length === 0) {
			return [];
		}

		try {
			const formattedKeys = keys.map((key) => this.formatKey(key));
			const valueMap = await this.fetchParameterValues(formattedKeys);

			const expiredKeys: string[] = [];
			const results = formattedKeys.map((name, index) => {
				const raw = valueMap.get(name);
				if (raw === undefined) {
					return undefined as KeyvStorageGetResult<GenericValue>;
				}

				const { value, expired } = this.unwrapValue<GenericValue>(raw);
				if (expired) {
					expiredKeys.push(keys[index]);
					return undefined as KeyvStorageGetResult<GenericValue>;
				}

				return value as KeyvStorageGetResult<GenericValue>;
			});

			if (expiredKeys.length > 0) {
				await this.deleteMany(expiredKeys);
			}

			return results;
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
			return keys.map(() => undefined as KeyvStorageGetResult<GenericValue>);
		}
		/* v8 ignore stop -- @preserve */
	}

	/**
	 * Stores a value in SSM Parameter Store, wrapped with its absolute `expires` so
	 * reads can enforce expiry precisely (Parameter Store has no native per-key TTL).
	 * @param key - The key to store
	 * @param value - The value to store
	 * @param expires - Absolute expiry as Unix ms since epoch, or `undefined` for no expiry.
	 * @returns `true` if the value was stored, `false` if the write failed.
	 */
	public async set(key: string, value: KeyvAny, expires?: number): Promise<boolean> {
		try {
			await this._client.send(
				new PutParameterCommand({
					Name: this.formatKey(key),
					Value: this.wrapValue(value, expires),
					Type: this._type,
					Tier: this._tier,
					KeyId: this._type === "SecureString" ? this._keyId : undefined,
					Overwrite: true,
				}),
			);
			return true;
		} catch (error) {
			this.emit("error", error);
			return false;
		}
	}

	/**
	 * Stores multiple values in SSM Parameter Store. AWS has no batch `PutParameter`
	 * API, so entries are written with individual, parallel `PutParameter` calls.
	 * @template Value - The type of the values being stored.
	 * @param entries - An array of `{ key, value, expires? }` entries, where `expires` is an
	 * absolute Unix ms timestamp (or `undefined` for no expiry).
	 * @returns An array of booleans, one per entry, indicating which writes succeeded.
	 */
	public async setMany<Value>(entries: KeyvStorageEntry<Value>[]): Promise<boolean[] | undefined> {
		const results = await Promise.allSettled(
			entries.map(async ({ key, value, expires }) => this.set(key, value, expires)),
		);

		return results.map((result) => {
			/* v8 ignore next 3 -- @preserve set() catches internally, so this branch is defensive */
			if (result.status === "rejected") {
				this.emit("error", result.reason);
				return false;
			}

			return result.value;
		});
	}

	/**
	 * Deletes a key from SSM Parameter Store.
	 * @param key - The key to delete
	 * @returns `true` if the key was deleted, `false` if it did not exist or the delete failed.
	 */
	public async delete(key: string): Promise<boolean> {
		try {
			await this._client.send(new DeleteParameterCommand({ Name: this.formatKey(key) }));
			return true;
		} catch (error) {
			if (error instanceof ParameterNotFound || isAwsErrorNamed(error, "ParameterNotFound")) {
				return false;
			}

			this.emit("error", error);
			return false;
		}
	}

	/**
	 * Deletes multiple keys from SSM Parameter Store, batched into groups of
	 * {@link maxBatchSize} names per `DeleteParameters` call (an AWS-enforced limit).
	 * @param keys - An array of keys to delete
	 * @returns An array of booleans indicating whether each key was successfully deleted.
	 */
	public async deleteMany(keys: string[]): Promise<boolean[]> {
		if (keys.length === 0) {
			return [];
		}

		try {
			const formattedKeys = keys.map((key) => this.formatKey(key));
			const deleted = new Set<string>();

			for (const batch of chunk(formattedKeys, maxBatchSize)) {
				const { DeletedParameters } = await this._client.send(
					new DeleteParametersCommand({ Names: batch }),
				);

				/* v8 ignore next 3 -- @preserve defensive: AWS always returns DeletedParameters on success */
				for (const name of DeletedParameters ?? []) {
					deleted.add(name);
				}
			}

			return formattedKeys.map((name) => deleted.has(name));
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
			return keys.map(() => false);
		}
		/* v8 ignore stop -- @preserve */
	}

	/**
	 * Clears data from SSM Parameter Store. If a namespace is set, only parameters
	 * under `keyPrefix + namespace` are deleted. Otherwise, all parameters under
	 * `keyPrefix` are deleted (never anything outside of it).
	 * @returns A promise that resolves once the matching parameters have been deleted.
	 */
	public async clear(): Promise<void> {
		try {
			const names = await this.listParameterNames();

			for (const batch of chunk(names, maxBatchSize)) {
				await this._client.send(new DeleteParametersCommand({ Names: batch }));
			}
		} catch (error) {
			this.emit("error", error);
		}
	}

	/**
	 * Checks whether a key exists in SSM Parameter Store.
	 * @param key - The key to check
	 * @returns `true` if the key exists (and has not expired), `false` otherwise.
	 */
	public async has(key: string): Promise<boolean> {
		try {
			const { Parameter } = await this._client.send(
				new GetParameterCommand({ Name: this.formatKey(key), WithDecryption: true }),
			);

			if (Parameter?.Value === undefined) {
				return false;
			}

			const { expired } = this.unwrapValue(Parameter.Value);
			if (expired) {
				await this.delete(key);
				return false;
			}

			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Checks whether multiple keys exist in SSM Parameter Store, batched into groups
	 * of {@link maxBatchSize} names per `GetParameters` call (an AWS-enforced limit).
	 * @param keys - An array of keys to check
	 * @returns An array of booleans indicating whether each key exists.
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		if (keys.length === 0) {
			return [];
		}

		try {
			const formattedKeys = keys.map((key) => this.formatKey(key));
			const valueMap = await this.fetchParameterValues(formattedKeys);

			const expiredKeys: string[] = [];
			const results = formattedKeys.map((name, index) => {
				const raw = valueMap.get(name);
				if (raw === undefined) {
					return false;
				}

				const { expired } = this.unwrapValue(raw);
				if (expired) {
					expiredKeys.push(keys[index]);
					return false;
				}

				return true;
			});

			if (expiredKeys.length > 0) {
				await this.deleteMany(expiredKeys);
			}

			return results;
		} catch {
			return keys.map(() => false);
		}
	}

	/**
	 * Disconnects from SSM. This is a no-op: the `SSMClient` is caller-provided and
	 * may be shared/reused elsewhere in the consumer's application, so the adapter
	 * never closes or destroys it.
	 * @returns A promise that resolves immediately.
	 */
	public async disconnect(): Promise<void> {
		// The client is caller-owned; never destroy a resource we don't own.
	}

	/**
	 * Returns an async iterator over all `[key, value]` pairs under the configured
	 * `keyPrefix` (and `namespace`, if set). Keys are returned without the prefix.
	 * Expired entries are skipped and deleted.
	 * @yields `[key, value]` pairs as an async generator.
	 */
	public async *iterator(): AsyncGenerator<[string, GenericValue], void, unknown> {
		try {
			for await (const parameter of this.paginateByPath(true)) {
				/* v8 ignore next 3 -- @preserve defensive: AWS always returns Name+Value together */
				if (parameter.Name === undefined || parameter.Value === undefined) {
					continue;
				}

				const { value, expired } = this.unwrapValue<GenericValue>(parameter.Value);
				if (expired) {
					await this._client.send(new DeleteParameterCommand({ Name: parameter.Name }));
					continue;
				}

				yield [this.stripKeyPrefix(parameter.Name), value as GenericValue];
			}
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
		}
		/* v8 ignore stop -- @preserve */
	}

	/**
	 * Lists every fully-qualified parameter name under the configured `keyPrefix`
	 * (and `namespace`, if set), paginating through `GetParametersByPath`.
	 * @returns An array of fully-qualified SSM parameter names.
	 */
	private async listParameterNames(): Promise<string[]> {
		const names: string[] = [];
		for await (const parameter of this.paginateByPath(false)) {
			/* v8 ignore next 3 -- @preserve defensive: AWS always returns Name for listed parameters */
			if (parameter.Name !== undefined) {
				names.push(parameter.Name);
			}
		}

		return names;
	}

	/**
	 * Paginates through `GetParametersByPathCommand` for the configured `keyPrefix`
	 * (and `namespace`, if set), yielding each `Parameter` across all pages. Manual
	 * `NextToken` looping is used (instead of the SDK's `paginateGetParametersByPath`
	 * helper) so any object implementing `.send()` works as a client — the helper
	 * requires a real `instanceof SSMClient`, which would reject test doubles and
	 * some wrapped/proxied clients.
	 * @param withDecryption - Whether to decrypt `SecureString` values.
	 * @yields Each `Parameter` under the configured path, across all pages.
	 */
	private async *paginateByPath(withDecryption: boolean): AsyncGenerator<Parameter, void, unknown> {
		let nextToken: string | undefined;

		do {
			const response = await this._client.send(
				new GetParametersByPathCommand({
					Path: this.basePath(),
					Recursive: true,
					WithDecryption: withDecryption,
					NextToken: nextToken,
				}),
			);

			/* v8 ignore next 3 -- @preserve defensive: AWS always returns Parameters on success */
			for (const parameter of response.Parameters ?? []) {
				yield parameter;
			}

			nextToken = response.NextToken;
		} while (nextToken);
	}

	/**
	 * Fetches raw parameter values for a set of fully-qualified names, batched into
	 * groups of {@link maxBatchSize} per `GetParameters` call.
	 * @param names - The fully-qualified SSM parameter names to fetch.
	 * @returns A map of parameter name to its raw (still-wrapped) string value.
	 */
	private async fetchParameterValues(names: string[]): Promise<Map<string, string>> {
		const valueMap = new Map<string, string>();

		for (const batch of chunk(names, maxBatchSize)) {
			const { Parameters } = await this._client.send(
				new GetParametersCommand({ Names: batch, WithDecryption: true }),
			);

			/* v8 ignore next 3 -- @preserve defensive: AWS always returns Name+Value together */
			for (const parameter of Parameters ?? []) {
				if (parameter.Name !== undefined && parameter.Value !== undefined) {
					valueMap.set(parameter.Name, parameter.Value);
				}
			}
		}

		return valueMap;
	}

	/**
	 * Builds the SSM hierarchy path scoped to the configured `keyPrefix` and, if set,
	 * `namespace`. Used by `clear()` and `iterator()` to list parameters via
	 * `GetParametersByPath`.
	 * @returns The path to list, e.g. `'/keyv/'` or `'/keyv/ns'`.
	 */
	private basePath(): string {
		const path = this._namespace ? `${this._keyPrefix}${this._namespace}` : this._keyPrefix;
		return path.replace(/\/{2,}/g, "/");
	}

	/**
	 * Strips the `keyPrefix` and namespace from a fully qualified SSM parameter
	 * name, returning the original Keyv key.
	 * @param name - The fully qualified SSM parameter name.
	 * @returns The original Keyv key.
	 */
	private stripKeyPrefix(name: string): string {
		/* v8 ignore next 3 -- @preserve defensive: names always come from a GetParametersByPath
		   query scoped to keyPrefix, so they always start with it */
		const withoutPrefix = name.startsWith(this._keyPrefix)
			? name.slice(this._keyPrefix.length)
			: name;
		return this.removeKeyPrefix(withoutPrefix, this._namespace);
	}

	/**
	 * Normalizes a path-style prefix so it always starts and ends with `/`, and
	 * collapses repeated slashes.
	 * @param value - The prefix to normalize.
	 * @returns The normalized prefix.
	 */
	private normalizeKeyPrefix(value: string): string {
		let prefix = value.trim();
		if (!prefix.startsWith("/")) {
			prefix = `/${prefix}`;
		}

		if (!prefix.endsWith("/")) {
			prefix = `${prefix}/`;
		}

		return prefix.replace(/\/{2,}/g, "/");
	}

	/**
	 * Wraps an (already-encoded) value with its absolute `expires` so reads can apply
	 * a precise expiry check, since Parameter Store has no reliable native per-key TTL.
	 * The expiry comes from the `expires` parameter — the encoded value is never parsed.
	 * @param value - The encoded value to store.
	 * @param expires - Absolute expiry as Unix ms since epoch, or `undefined` for no expiry.
	 * @returns A Keyv-serialized envelope string `{ v, e }`.
	 */
	private wrapValue(value: unknown, expires?: number): string {
		return jsonSerializer.stringify({ v: value, e: typeof expires === "number" ? expires : null });
	}

	/**
	 * Unwraps a stored value, reporting whether it has expired. Values not written in
	 * the `{ v, e }` envelope (e.g. written directly via the AWS console/CLI) are
	 * returned as-is and treated as never expiring.
	 * @param raw - The raw value read back from SSM.
	 * @returns The unwrapped `value` and an `expired` flag.
	 */
	private unwrapValue<T>(raw: unknown): { value: T | undefined; expired: boolean } {
		/* v8 ignore next 3 -- @preserve defensive: SSM always returns a string Value when present */
		if (raw === null || raw === undefined) {
			return { value: undefined, expired: false };
		}

		try {
			const parsed = jsonSerializer.parse<unknown>(raw as string);
			if (parsed === null || typeof parsed !== "object") {
				return { value: raw as T, expired: false };
			}

			const envelope = parsed as { v: T; e: number | null };
			if (envelope.v === undefined) {
				// Not our envelope format — return as-is.
				return { value: raw as T, expired: false };
			}

			if (envelope.e !== null && Date.now() > envelope.e) {
				return { value: undefined, expired: true };
			}

			return { value: envelope.v, expired: false };
		} catch {
			// Not valid JSON — return as-is.
			return { value: raw as T, expired: false };
		}
	}
}

export default KeyvAwsSsm;

/**
 * Creates a Keyv instance pre-configured with the KeyvAwsSsm storage adapter.
 * @param options - A {@link KeyvAwsSsmOptions} object. `options.client` is required.
 * @returns A Keyv instance using the KeyvAwsSsm adapter.
 *
 * @example
 * ```typescript
 * import { SSMClient } from '@aws-sdk/client-ssm';
 * import { createKeyv } from '@keyv/aws-ssm';
 *
 * const keyv = createKeyv({ client: new SSMClient({ region: 'us-east-1' }) });
 * await keyv.set('foo', 'bar');
 * ```
 */
export function createKeyv(options: KeyvAwsSsmOptions): Keyv {
	const adapter = new KeyvAwsSsm(options);

	if (options.namespace) {
		adapter.namespace = options.namespace;
		return new Keyv(adapter, { namespace: options.namespace });
	}

	const keyv = new Keyv(adapter);
	keyv.namespace = undefined; // Ensure no namespace is set
	return keyv;
}

export { Keyv } from "keyv";
