import EventEmitter from 'node:events';
import Keyv from 'keyv';
import type {Options, Options_} from './types';

type KeyvTieredIndex = 'local' | 'remote';

class KeyvTiered extends EventEmitter {
	opts: Options_;
	remote: Keyv;
	local: Keyv;
	iterationLimit?: string | number;

	constructor({remote = new Keyv(), local = new Keyv(), ...options}: Options) {
		super();
		this.opts = {
			validator: () => true,
			dialect: 'tiered',
			...options,
		};
		this.remote = remote;
		this.local = local;
	}

	async get(key: string): Promise<any> {
		const localResult: unknown = await this.local.get(key);

		if (localResult === undefined || !this.opts.validator(localResult, key)) {
			const remoteResult: unknown = await this.remote.get(key);

			if (remoteResult === localResult) {
				return remoteResult;
			}

			await this.local.set(key, remoteResult);

			return remoteResult;
		}

		return localResult;
	}

	async getMany(keys: string[]): Promise<unknown[]> {
		const promises = [];
		for (const key of keys) {
			promises.push(this.get(key));
		}

		const values = await Promise.all(promises);
		const data: unknown[] = [];
		for (const value of values) {
			data.push(value);
		}

		return data;
	}

	async set(key: string, value: any, ttl?: number) {
		const toSet: KeyvTieredIndex[] = ['local', 'remote'];
		return Promise.all(toSet.map(async store => this[store].set(key, value, ttl)),
		);
	}

	async clear(): Promise<undefined> {
		const toClear: KeyvTieredIndex[] = ['local'];
		if (!this.opts.localOnly) {
			toClear.push('remote');
		}

		await Promise.all(toClear
			.map(async store => this[store].clear()),
		);

		return undefined;
	}

	async delete(key: string): Promise<boolean> {
		const toDelete: KeyvTieredIndex[] = ['local'];
		if (!this.opts.localOnly) {
			toDelete.push('remote');
		}

		const deleted = await Promise.all(toDelete
			.map(async store => this[store].delete(key)),
		);

		return deleted.every(Boolean);
	}

	async deleteMany(keys: string[]): Promise<boolean> {
		const promises = [];
		for (const key of keys) {
			promises.push(this.delete(key));
		}

		const values = await Promise.all(promises);

		return values.every(Boolean);
	}

	async has(key: string): Promise<boolean> {
		const response = await this.local.has(key);

		if (!response || !this.opts.validator(response, key)) {
			return this.remote.has(key);
		}

		return response;
	}

	async * iterator(namespace?: string): AsyncGenerator<any, void, any> {
		this.remote.opts.iterationLimit = Number.parseInt(this.iterationLimit as string, 10) || 10;
		for await (const entries of this.remote.iterator!(namespace)) {
			yield entries;
		}
	}
}

export = KeyvTiered;
