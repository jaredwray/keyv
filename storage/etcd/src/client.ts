const JSON_HEADERS = { "content-type": "application/json" };

export type EtcdClientOptions = {
	url: string;
	/** Per-request timeout in milliseconds. Aborts the underlying fetch when exceeded. */
	timeout?: number;
};

export type RangeRequest = {
	key: string;
	rangeEnd?: string | Buffer;
	keysOnly?: boolean;
};

export type RangeResponse = {
	kvs?: Array<{ key: string; value: string }>;
};

export type PutRequest = {
	key: string;
	value: string;
	lease?: string;
};

export type DeleteRangeRequest = {
	key: string;
	rangeEnd?: string | Buffer;
};

export type DeleteRangeResponse = {
	deleted: string;
};

export type LeaseGrantResponse = {
	ID: string;
	TTL: string;
};

export function b64encode(input: string | Buffer): string {
	if (typeof input === "string") {
		return Buffer.from(input, "utf8").toString("base64");
	}
	return input.toString("base64");
}

export function b64decode(input: string): string {
	return Buffer.from(input, "base64").toString("utf8");
}

// Returns the next key after `prefix` in lexicographic byte order as raw
// bytes, suitable as `range_end` for a prefix scan. Returned as a Buffer so
// that incremented bytes (e.g., 0xBF → 0xC0) can produce sequences that are
// not valid UTF-8 — etcd treats keys as bytes, and round-tripping through
// UTF-8 here would corrupt those ranges. An empty prefix or an all-0xFF
// prefix returns the single byte 0x00, which paired with key=0x00 is etcd's
// idiom for "scan everything".
export function prefixEnd(prefix: string): Buffer {
	if (prefix === "") {
		return Buffer.from([0x00]);
	}
	const buf = Buffer.from(prefix, "utf8");
	for (let i = buf.length - 1; i >= 0; i--) {
		if ((buf[i] ?? 0) < 0xff) {
			const out = Buffer.from(buf.subarray(0, i + 1));
			out[i] = (buf[i] ?? 0) + 1;
			return out;
		}
	}
	/* v8 ignore next -- @preserve UTF-8 of any JS string cannot be all 0xFF */
	return Buffer.from([0x00]);
}

export function parseEtcdUrl(input: string): string {
	if (input.startsWith("http://") || input.startsWith("https://")) {
		return input;
	}
	return `http://${input}`;
}

export class EtcdClient {
	private readonly _baseUrl: string;
	private _closed = false;
	public timeout: number | undefined;

	constructor(options: EtcdClientOptions) {
		const url = parseEtcdUrl(options.url);
		let end = url.length;
		while (end > 0 && url.charCodeAt(end - 1) === 47) {
			end--;
		}
		this._baseUrl = end === url.length ? url : url.slice(0, end);
		this.timeout = options.timeout;
	}

	close(): void {
		this._closed = true;
	}

	async request<T>(path: string, body: unknown): Promise<T> {
		if (this._closed) {
			throw new Error("etcd client is closed");
		}

		const timeout = this.timeout;
		const signal = timeout !== undefined && timeout > 0 ? AbortSignal.timeout(timeout) : undefined;

		const response = await fetch(`${this._baseUrl}${path}`, {
			method: "POST",
			headers: JSON_HEADERS,
			body: JSON.stringify(body ?? {}),
			signal,
		});

		const text = await response.text();
		let parsed: unknown;
		if (text) {
			try {
				parsed = JSON.parse(text);
				/* v8 ignore start -- defensive: etcd's gateway always returns JSON */
			} catch {
				parsed = undefined;
			}
			/* v8 ignore stop */
		}

		if (!response.ok) {
			let errMessage = `etcd request failed: ${response.status} ${response.statusText}`;
			if (
				typeof parsed === "object" &&
				parsed !== null &&
				"error" in parsed &&
				typeof (parsed as { error: unknown }).error === "string"
			) {
				errMessage = (parsed as { error: string }).error;
			}
			throw new Error(errMessage);
		}

		return parsed as T;
	}

	async range(req: RangeRequest): Promise<RangeResponse> {
		const body: Record<string, unknown> = { key: b64encode(req.key) };
		if (req.rangeEnd !== undefined) {
			body.range_end = b64encode(req.rangeEnd);
		}
		if (req.keysOnly) {
			body.keys_only = true;
		}
		return this.request<RangeResponse>("/v3/kv/range", body);
	}

	async putRaw(req: PutRequest): Promise<void> {
		const body: Record<string, unknown> = {
			key: b64encode(req.key),
			value: b64encode(req.value),
		};
		if (req.lease !== undefined) {
			body.lease = req.lease;
		}
		await this.request("/v3/kv/put", body);
	}

	async deleteRangeRaw(req: DeleteRangeRequest): Promise<DeleteRangeResponse> {
		const body: Record<string, unknown> = { key: b64encode(req.key) };
		if (req.rangeEnd !== undefined) {
			body.range_end = b64encode(req.rangeEnd);
		}
		const result = await this.request<{ deleted?: string }>("/v3/kv/deleterange", body);
		return { deleted: result?.deleted ?? "0" };
	}

	// etcd lease IDs are 64-bit; the JSON gateway returns them as decimal
	// strings to avoid precision loss. Keep them as strings end-to-end.
	async leaseGrant(ttlSeconds: number): Promise<LeaseGrantResponse> {
		const body = { TTL: String(Math.max(Math.floor(ttlSeconds), 1)), ID: "0" };
		const result = await this.request<{ ID?: string; TTL?: string }>("/v3/lease/grant", body);
		return { ID: result?.ID ?? "0", TTL: result?.TTL ?? "0" };
	}

	async status(): Promise<unknown> {
		return this.request("/v3/maintenance/status", {});
	}

	async get(key: string): Promise<string | null> {
		const result = await this.range({ key });
		const value = result.kvs?.[0]?.value;
		if (value === undefined) {
			return null;
		}
		return b64decode(value);
	}

	put(key: string): EtcdPutBuilder {
		return new EtcdPutBuilder(this, key);
	}

	delete(): EtcdDeleteBuilder {
		return new EtcdDeleteBuilder(this);
	}

	getAll(): EtcdRangeBuilder {
		return new EtcdRangeBuilder(this);
	}

	lease(ttlSeconds: number, _options?: { autoKeepAlive?: boolean }): Lease {
		return new Lease(this, ttlSeconds);
	}
}

export class EtcdPutBuilder {
	constructor(
		private readonly client: EtcdClient,
		private readonly key: string,
		private readonly leaseId?: string,
	) {}

	async value(value: string): Promise<void> {
		await this.client.putRaw({ key: this.key, value, lease: this.leaseId });
	}
}

export class EtcdDeleteBuilder {
	constructor(private readonly client: EtcdClient) {}

	async key(key: string): Promise<DeleteRangeResponse> {
		return this.client.deleteRangeRaw({ key });
	}

	async prefix(prefix: string): Promise<DeleteRangeResponse> {
		return this.client.deleteRangeRaw({ key: prefix, rangeEnd: prefixEnd(prefix) });
	}

	async all(): Promise<DeleteRangeResponse> {
		return this.client.deleteRangeRaw({ key: "\x00", rangeEnd: "\x00" });
	}
}

export class EtcdRangeBuilder {
	private _prefix?: string;

	constructor(private readonly client: EtcdClient) {}

	prefix(prefix: string): this {
		this._prefix = prefix;
		return this;
	}

	async keys(): Promise<string[]> {
		const prefix = this._prefix ?? "";
		const key = prefix === "" ? "\x00" : prefix;
		const rangeEnd = prefixEnd(prefix);
		const result = await this.client.range({ key, rangeEnd, keysOnly: true });
		return (result.kvs ?? []).map((kv) => b64decode(kv.key));
	}
}

export class Lease {
	private _grantPromise?: Promise<string>;

	constructor(
		private readonly client: EtcdClient,
		private readonly ttlSeconds: number,
	) {}

	async grant(): Promise<string> {
		if (!this._grantPromise) {
			this._grantPromise = this.client.leaseGrant(this.ttlSeconds).then((r) => r.ID);
		}
		return this._grantPromise;
	}

	put(key: string): { value(value: string): Promise<void> } {
		const lease = this;
		return {
			async value(value: string): Promise<void> {
				const id = await lease.grant();
				await lease.client.putRaw({ key, value, lease: id });
			},
		};
	}
}
