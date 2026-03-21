import { Etcd3, type Lease } from "etcd3";
import { Hookified } from "hookified";
import type { StoredData } from "keyv";
import type {
	ClearOutput,
	DeleteManyOutput,
	DeleteOutput,
	GetOutput,
	HasOutput,
	SetOutput,
} from "./types.js";

export type KeyvEtcdOptions = {
	url?: string;
	uri?: string;
	ttl?: number;
	busyTimeout?: number;
	dialect?: "etcd";
};

// biome-ignore lint/suspicious/noExplicitAny: any is allowed
export class KeyvEtcd<Value = any> extends Hookified {
	public client: Etcd3;
	public lease?: Lease;
	private _opts: KeyvEtcdOptions;
	private _namespace?: string;
	private _keyPrefixSeparator = ":";

	constructor(url?: KeyvEtcdOptions | string, options?: KeyvEtcdOptions) {
		super({ throwOnEmptyListeners: false });

		url ??= {};

		if (typeof url === "string") {
			url = { url };
		}

		if (url.uri) {
			url = { url: url.uri, ...url };
		}

		this._opts = {
			url: "127.0.0.1:2379",
			...url,
			...options,
			dialect: "etcd",
		};
		/* c8 ignore next -- @preserve */
		if (this._opts.url) {
			this._opts.url = this._opts.url?.replace(/^etcd:\/\//, "");
		} else {
			/* c8 ignore next -- @preserve */
			this._opts.url = "127.0.0.1:2379";
		}

		this.client = new Etcd3({
			hosts: this._opts.url,
		});

		// Https://github.com/microsoft/etcd3/issues/105
		this.client.getRoles().catch((error) => this.emit("error", error));

		if (typeof this._opts.ttl === "number") {
			// biome-ignore lint/style/noNonNullAssertion: allowed
			this.lease = this.client.lease(this._opts.ttl! / 1000, {
				autoKeepAlive: false,
			});
		}
	}

	get opts(): KeyvEtcdOptions {
		return {
			...this._opts,
			namespace: this._namespace,
		} as KeyvEtcdOptions;
	}

	get namespace(): string | undefined {
		return this._namespace;
	}

	set namespace(value: string | undefined) {
		this._namespace = value;
	}

	get keyPrefixSeparator(): string {
		return this._keyPrefixSeparator;
	}

	set keyPrefixSeparator(value: string) {
		this._keyPrefixSeparator = value;
	}

	createKeyPrefix(key: string, namespace?: string): string {
		if (namespace) {
			return `${namespace}${this._keyPrefixSeparator}${key}`;
		}

		return key;
	}

	removeKeyPrefix(key: string, namespace?: string): string {
		if (namespace) {
			return key.replace(`${namespace}${this._keyPrefixSeparator}`, "");
		}

		return key;
	}

	formatKey(key: string): string {
		if (!this._namespace) {
			return key;
		}

		const prefix = `${this._namespace}${this._keyPrefixSeparator}`;
		if (key.startsWith(prefix)) {
			return key;
		}

		return `${prefix}${key}`;
	}

	async get(key: string): GetOutput<Value> {
		return this.client.get(this.formatKey(key)) as unknown as GetOutput<Value>;
	}

	async getMany(keys: string[]): Promise<Array<StoredData<Value>>> {
		const promises = [];
		for (const key of keys) {
			promises.push(this.get(key));
		}

		return Promise.allSettled(promises).then((values) => {
			const data: Array<StoredData<Value>> = [];
			for (const value of values) {
				// @ts-expect-error - value is an object
				if (value.value === null) {
					data.push(undefined);
				} else {
					// @ts-expect-error - value is an object
					data.push(value.value as StoredData<Value>);
				}
			}

			return data;
		});
	}

	async set(key: string, value: Value): SetOutput {
		let client: "lease" | "client" = "client";

		if (this._opts.ttl) {
			client = "lease";
		}

		// @ts-expect-error - Value needs to be number, string or buffer
		await this[client]?.put(this.formatKey(key)).value(value);
	}

	async setMany(entries: Array<{ key: string; value: Value }>): Promise<void> {
		const promises = entries.map(async ({ key, value }) =>
			this.set(key, value),
		);
		const results = await Promise.allSettled(promises);
		for (const result of results) {
			if (result.status === "rejected") {
				this.emit("error", result.reason);
				throw result.reason as Error;
			}
		}
	}

	async delete(key: string): DeleteOutput {
		if (typeof key !== "string") {
			return false;
		}

		return this.client
			.delete()
			.key(this.formatKey(key))
			.then((key) => key.deleted !== "0");
	}

	async deleteMany(keys: string[]): DeleteManyOutput {
		const promises = [];
		for (const key of keys) {
			promises.push(this.delete(key));
		}

		return Promise.allSettled(promises).then((values) =>
			// @ts-expect-error - x is an object
			values.every((x) => x.value === true),
		);
	}

	async clear(): ClearOutput {
		const promise = this._namespace
			? this.client
					.delete()
					.prefix(`${this._namespace}${this._keyPrefixSeparator}`)
			: this.client.delete().all();
		return promise.then(() => undefined);
	}

	async *iterator(namespace?: string) {
		const prefix = namespace ? `${namespace}${this._keyPrefixSeparator}` : "";
		const iterator = await this.client.getAll().prefix(prefix).keys();

		for await (const key of iterator) {
			const value = (await this.client.get(key)) as unknown as Value;
			yield [key, value];
		}
	}

	async has(key: string): HasOutput {
		return this.client.get(this.formatKey(key)).exists();
	}

	async hasMany(keys: string[]): Promise<boolean[]> {
		const promises = keys.map(async (key) => this.has(key));
		const results = await Promise.allSettled(promises);
		return results.map((result) =>
			result.status === "fulfilled" ? result.value : false,
		);
	}

	async disconnect() {
		this.client.close();
	}
}

export default KeyvEtcd;
