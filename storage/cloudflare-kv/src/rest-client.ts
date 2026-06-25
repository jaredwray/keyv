/**
 * Sidecar metadata stored alongside each KV value. Keyv serializes the value itself, so the adapter
 * keeps only the absolute expiry here (`e`, Unix ms) to enforce TTLs client-side without touching
 * the stored value.
 */
export type CloudflareKVMetadata = {
	/** Absolute expiry as a Unix timestamp in milliseconds. */
	e?: number;
};

/**
 * Minimal subset of the Cloudflare Workers
 * [`KVNamespace`](https://developers.cloudflare.com/kv/api/) binding interface used by this
 * adapter. The native Worker binding and the Miniflare local binding both satisfy this shape,
 * and {@link CloudflareKVRestClient} implements it on top of the Cloudflare REST API so the
 * adapter can talk to either without changing its code path.
 */
export type CloudflareKVNamespace = {
	/** Reads the string value for a key, or `null` if it does not exist. */
	get(key: string): Promise<string | null>;
	/** Reads the value and its metadata sidecar for a key. */
	getWithMetadata(key: string): Promise<CloudflareKVValueWithMetadata>;
	/** Writes a string value for a key, with optional native expiry and metadata. */
	put(key: string, value: string, options?: CloudflareKVPutOptions): Promise<void>;
	/** Deletes a key. Resolves whether or not the key existed. */
	delete(key: string): Promise<void>;
	/** Lists keys, optionally filtered by `prefix`, with cursor-based pagination. */
	list(options?: CloudflareKVListOptions): Promise<CloudflareKVListResult>;
};

/** Result of a `getWithMetadata` call. */
export type CloudflareKVValueWithMetadata = {
	/** The stored value, or `null` if the key does not exist. */
	value: string | null;
	/** The metadata sidecar, or `null` if none was stored. */
	metadata: CloudflareKVMetadata | null;
};

/** Native expiry and metadata options accepted by `KVNamespace.put`. */
export type CloudflareKVPutOptions = {
	/** Absolute expiry as a Unix timestamp in seconds. Must be at least 60s in the future. */
	expiration?: number;
	/** Relative expiry in seconds from now. Must be at least 60. */
	expirationTtl?: number;
	/** Arbitrary metadata stored alongside the value (the adapter uses it for client-side expiry). */
	metadata?: CloudflareKVMetadata;
};

/** Options accepted by `KVNamespace.list`. */
export type CloudflareKVListOptions = {
	/** Only return keys beginning with this prefix. */
	prefix?: string;
	/** Maximum number of keys to return per page (Cloudflare caps this at 1000). */
	limit?: number;
	/** Opaque pagination cursor returned by a previous `list` call. */
	cursor?: string;
};

/** Result of a `KVNamespace.list` call. */
export type CloudflareKVListResult = {
	/** The keys in this page. */
	keys: Array<{ name: string; expiration?: number; metadata?: CloudflareKVMetadata | null }>;
	/** `true` when there are no further pages. */
	list_complete: boolean;
	/** Cursor to pass to the next `list` call when `list_complete` is `false`. */
	cursor?: string;
};

/** Options for constructing a {@link CloudflareKVRestClient}. */
export type CloudflareKVRestClientOptions = {
	/** Cloudflare account ID that owns the KV namespace. */
	accountId: string;
	/** The KV namespace ID (not the binding name) to operate on. */
	namespaceId: string;
	/** A Cloudflare API token with `Workers KV Storage` read/write permission. */
	apiToken: string;
	/** Base REST URL. Defaults to `https://api.cloudflare.com/client/v4`. */
	url?: string;
};

const DEFAULT_BASE_URL = "https://api.cloudflare.com/client/v4";

/**
 * A {@link CloudflareKVNamespace} implementation backed by the Cloudflare REST API. This lets the
 * adapter run from any Node.js process (no Worker runtime required) using account credentials,
 * rather than an injected Worker binding.
 *
 * @see https://developers.cloudflare.com/api/resources/kv/
 */
export class CloudflareKVRestClient implements CloudflareKVNamespace {
	private readonly _accountId: string;
	private readonly _namespaceId: string;
	private readonly _apiToken: string;
	private readonly _baseUrl: string;

	constructor(options: CloudflareKVRestClientOptions) {
		if (!options.accountId || !options.namespaceId || !options.apiToken) {
			throw new Error(
				"CloudflareKVRestClient requires 'accountId', 'namespaceId', and 'apiToken'.",
			);
		}

		this._accountId = options.accountId;
		this._namespaceId = options.namespaceId;
		this._apiToken = options.apiToken;
		this._baseUrl = (options.url ?? DEFAULT_BASE_URL).replace(/\/$/, "");
	}

	/** The root URL for this namespace's REST resources. */
	private get namespaceUrl(): string {
		return `${this._baseUrl}/accounts/${this._accountId}/storage/kv/namespaces/${this._namespaceId}`;
	}

	private get authHeaders(): Record<string, string> {
		return { Authorization: `Bearer ${this._apiToken}` };
	}

	public async get(key: string): Promise<string | null> {
		const response = await fetch(`${this.namespaceUrl}/values/${encodeURIComponent(key)}`, {
			method: "GET",
			headers: this.authHeaders,
		});

		if (response.status === 404) {
			return null;
		}

		if (!response.ok) {
			throw new Error(`Cloudflare KV get failed: ${response.status} ${await response.text()}`);
		}

		return response.text();
	}

	public async getWithMetadata(key: string): Promise<CloudflareKVValueWithMetadata> {
		const value = await this.get(key);
		if (value === null) {
			return { value: null, metadata: null };
		}

		const response = await fetch(`${this.namespaceUrl}/metadata/${encodeURIComponent(key)}`, {
			method: "GET",
			headers: this.authHeaders,
		});

		if (response.status === 404) {
			return { value, metadata: null };
		}

		if (!response.ok) {
			throw new Error(
				`Cloudflare KV metadata get failed: ${response.status} ${await response.text()}`,
			);
		}

		const body = (await response.json()) as { result?: CloudflareKVMetadata | null };
		/* v8 ignore next -- @preserve defensive: a 200 metadata response always carries a result */
		return { value, metadata: body.result ?? null };
	}

	public async put(key: string, value: string, options?: CloudflareKVPutOptions): Promise<void> {
		const url = new URL(`${this.namespaceUrl}/values/${encodeURIComponent(key)}`);
		if (typeof options?.expiration === "number") {
			url.searchParams.set("expiration", String(options.expiration));
		}

		if (typeof options?.expirationTtl === "number") {
			url.searchParams.set("expiration_ttl", String(options.expirationTtl));
		}

		// Metadata must be sent as a multipart form; plain values use a text body.
		let body: BodyInit;
		const headers: Record<string, string> = { ...this.authHeaders };
		if (options?.metadata) {
			const form = new FormData();
			form.append("value", value);
			form.append("metadata", JSON.stringify(options.metadata));
			body = form;
		} else {
			body = value;
			headers["Content-Type"] = "text/plain";
		}

		const response = await fetch(url, { method: "PUT", headers, body });
		if (!response.ok) {
			throw new Error(`Cloudflare KV put failed: ${response.status} ${await response.text()}`);
		}
	}

	public async delete(key: string): Promise<void> {
		const response = await fetch(`${this.namespaceUrl}/values/${encodeURIComponent(key)}`, {
			method: "DELETE",
			headers: this.authHeaders,
		});

		// A 404 means the key was already gone, which is fine for a delete.
		if (!response.ok && response.status !== 404) {
			throw new Error(`Cloudflare KV delete failed: ${response.status} ${await response.text()}`);
		}
	}

	public async list(options?: CloudflareKVListOptions): Promise<CloudflareKVListResult> {
		const url = new URL(`${this.namespaceUrl}/keys`);
		if (options?.prefix) {
			url.searchParams.set("prefix", options.prefix);
		}

		if (typeof options?.limit === "number") {
			url.searchParams.set("limit", String(options.limit));
		}

		if (options?.cursor) {
			url.searchParams.set("cursor", options.cursor);
		}

		const response = await fetch(url, { method: "GET", headers: this.authHeaders });
		if (!response.ok) {
			throw new Error(`Cloudflare KV list failed: ${response.status} ${await response.text()}`);
		}

		const body = (await response.json()) as {
			result: Array<{ name: string; expiration?: number; metadata?: CloudflareKVMetadata | null }>;
			result_info?: { cursor?: string };
		};

		const cursor = body.result_info?.cursor;
		return {
			/* v8 ignore next -- @preserve defensive: a 200 list response always carries a result array */
			keys: body.result ?? [],
			// The REST API omits/empties the cursor when the listing is exhausted.
			list_complete: !cursor,
			cursor: cursor || undefined,
		};
	}
}
