const JSON_HEADERS = { "content-type": "application/json" };

export type EtcdClientOptions = {
	url: string;
};

export type RangeRequest = {
	key: string;
	rangeEnd?: string;
	keysOnly?: boolean;
	limit?: number;
};

export type RangeResponse = {
	kvs?: Array<{ key: string; value: string }>;
	count?: string;
};

export type PutRequest = {
	key: string;
	value: string;
	lease?: string;
};

export type DeleteRangeRequest = {
	key: string;
	rangeEnd?: string;
};

export type DeleteRangeResponse = {
	deleted: string;
};

export type LeaseGrantResponse = {
	ID: string;
	TTL: string;
};

export function b64encode(input: string): string {
	return Buffer.from(input, "utf8").toString("base64");
}

export function b64decode(input: string): string {
	return Buffer.from(input, "base64").toString("utf8");
}

// Returns the next key after `prefix` in lexicographic byte order, suitable as
// `range_end` for a prefix scan. An empty prefix or all-0xFF prefix produces
// "\x00", which paired with key="\x00" is etcd's idiom for "scan everything".
export function prefixEnd(prefix: string): string {
	if (prefix === "") {
		return "\x00";
	}
	const buf = Buffer.from(prefix, "utf8");
	for (let i = buf.length - 1; i >= 0; i--) {
		if ((buf[i] ?? 0) < 0xff) {
			const out = Buffer.from(buf.subarray(0, i + 1));
			out[i] = (buf[i] ?? 0) + 1;
			return out.toString("utf8");
		}
	}
	return "\x00";
}

export function parseEtcdUrl(input: string): string {
	if (input.startsWith("http://") || input.startsWith("https://")) {
		return input;
	}
	if (input.startsWith("etcd://")) {
		return `http://${input.slice("etcd://".length)}`;
	}
	return `http://${input}`;
}

export class EtcdClient {
	private readonly _baseUrl: string;
	private _closed = false;

	constructor(options: EtcdClientOptions) {
		this._baseUrl = parseEtcdUrl(options.url).replace(/\/+$/, "");
	}

	get closed(): boolean {
		return this._closed;
	}

	close(): void {
		this._closed = true;
	}

	async request<T>(path: string, body: unknown): Promise<T> {
		if (this._closed) {
			throw new Error("etcd client is closed");
		}

		const response = await fetch(`${this._baseUrl}${path}`, {
			method: "POST",
			headers: JSON_HEADERS,
			body: JSON.stringify(body ?? {}),
		});

		const text = await response.text();
		let parsed: unknown;
		if (text) {
			try {
				parsed = JSON.parse(text);
			} catch {
				parsed = undefined;
			}
		}

		if (!response.ok) {
			const errMessage =
				(typeof parsed === "object" &&
					parsed !== null &&
					"error" in parsed &&
					typeof (parsed as { error: unknown }).error === "string" &&
					(parsed as { error: string }).error) ||
				`etcd request failed: ${response.status} ${response.statusText}`;
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
		if (typeof req.limit === "number") {
			body.limit = req.limit;
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
	private _id?: string;
	private _grantPromise?: Promise<string>;

	constructor(
		private readonly client: EtcdClient,
		private readonly ttlSeconds: number,
	) {}

	get id(): string | undefined {
		return this._id;
	}

	async grant(): Promise<string> {
		if (this._id !== undefined) {
			return this._id;
		}
		if (!this._grantPromise) {
			this._grantPromise = (async () => {
				const result = await this.client.leaseGrant(this.ttlSeconds);
				this._id = result.ID;
				return result.ID;
			})();
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
