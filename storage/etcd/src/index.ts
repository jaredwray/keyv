import { EventEmitter } from "node:events";
import { Etcd3, type Lease } from "etcd3";
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
export class KeyvEtcd<Value = any> extends EventEmitter {
	public opts: KeyvEtcdOptions;
	public client: Etcd3;
	public lease?: Lease;
	public namespace?: string;

	constructor(url?: KeyvEtcdOptions | string, options?: KeyvEtcdOptions) {
		super();

		url ??= {};

		if (typeof url === "string") {
			url = { url };
		}

		if (url.uri) {
			url = { url: url.uri, ...url };
		}

		this.opts = {
			url: "127.0.0.1:2379",
			...url,
			...options,
			dialect: "etcd",
		};
		/* c8 ignore next -- @preserve */
		if (this.opts.url) {
			this.opts.url = this.opts.url?.replace(/^etcd:\/\//, "");
		} else {
			/* c8 ignore next -- @preserve */
			this.opts.url = "127.0.0.1:2379";
		}

		this.client = new Etcd3({
			hosts: this.opts.url,
		});

		// Https://github.com/microsoft/etcd3/issues/105
		this.client.getRoles().catch((error) => this.emit("error", error));

		if (typeof this.opts.ttl === "number") {
			// biome-ignore lint/style/noNonNullAssertion: allowed
			this.lease = this.client.lease(this.opts.ttl! / 1000, {
				autoKeepAlive: false,
			});
		}
	}

	async get(key: string): GetOutput<Value> {
		return this.client.get(key) as unknown as GetOutput<Value>;
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

		if (this.opts.ttl) {
			client = "lease";
		}

		// @ts-expect-error - Value needs to be number, string or buffer
		await this[client]?.put(key).value(value);
	}

	async delete(key: string): DeleteOutput {
		if (typeof key !== "string") {
			return false;
		}

		return this.client
			.delete()
			.key(key)
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
		const promise = this.namespace
			? this.client.delete().prefix(this.namespace)
			: this.client.delete().all();
		return promise.then(() => undefined);
	}

	async *iterator(namespace?: string) {
		const iterator = await this.client
			.getAll()
			.prefix(namespace ? `${namespace}:` : "")
			.keys();

		for await (const key of iterator) {
			const value = await this.get(key);
			yield [key, value];
		}
	}

	async has(key: string): HasOutput {
		return this.client.get(key).exists();
	}

	async disconnect() {
		this.client.close();
	}
}

export default KeyvEtcd;
