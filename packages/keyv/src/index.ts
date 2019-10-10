import EventEmitter from 'events';
import JSONB from 'json-buffer';

const adapters = {
	redis: '@keyv/redis',
	mongodb: '@keyv/mongo',
	mongo: '@keyv/mongo',
	sqlite: '@keyv/sqlite',
	postgresql: '@keyv/postgres',
	postgres: '@keyv/postgres',
	mysql: '@keyv/mysql'
};

const loadStore = <
	TVal,
	TAdapterOpts extends {
		adapter?: keyof typeof adapters;
		uri?: string;
	}
>(opts: TAdapterOpts): KeyvStore<TVal> => {
	const validAdapters = Object.keys(adapters);

	let adapter: void | keyof typeof adapters;

	if (opts.adapter) {
		adapter = opts.adapter;
	} else if (opts.uri) {
		const matches = /^[^:]+/.exec(opts.uri);
		if (matches === null) {
			throw new Error(`[keyv]: Could not infer adapter from uri "${opts.uri}"`);
		}

		adapter = matches[0] as keyof typeof adapters;
	}

	if (!adapter) {
		return new Map() as (Map<string, string> & { namespace: string });
	}

	if (validAdapters.includes(adapter)) {
		const Adapter = require(adapters[adapter]).default;
		return new Adapter(opts);
	}

	throw new Error(`[keyv]: Invalid adapter "${adapter}"`);
};

type MaybePromise<T> = T | Promise<T>;

export interface KeyvOptions<TVal, TSerialized = string> {
	namespace: string;
	store: KeyvStore<TVal, TSerialized>;
	adapter?: keyof typeof adapters;
	ttl?: number;
	serialize(x: KeyvStoreObject<TVal>): TSerialized;
	deserialize(x: TSerialized): KeyvStoreObject<TVal>;
}

export interface KeyvStore<TVal, TSerialized = string> {
	namespace: string;
	ttlSupport?: boolean;

	on?(event: 'error', cb: (err: Error) => void | never): void;

	get(key: string): MaybePromise<void | TSerialized | KeyvStoreObject<TVal>>;
	set(key: string, val: TSerialized, ttl?: number): MaybePromise<unknown>;
	delete(key: string): MaybePromise<boolean>;
	clear(): MaybePromise<void>;
}

export interface KeyvStoreObject<TVal> {
	expires: number | null;
	value: TVal;
}

export type KeyvStoreEvent = 'error';

export default class Keyv<TVal> extends EventEmitter {
	protected readonly opts: KeyvOptions<TVal>;

	constructor(uriOrOpts: string | Partial<KeyvOptions<TVal>>, _opts: Partial<KeyvOptions<TVal>> = {}) {
		super();

		const adapterOpts = ({
			namespace: 'keyv',
			serialize: JSONB.stringify,
			deserialize: JSONB.parse,
			...((typeof uriOrOpts === 'string') ? { uri: uriOrOpts } : uriOrOpts),
			..._opts
		});

		this.opts = {
			...adapterOpts,
			store: adapterOpts.store || loadStore(adapterOpts)
		};

		if (typeof this.opts.store.on === 'function') {
			this.opts.store.on('error', err => this.emit('error', err));
		}

		this.opts.store.namespace = this.opts.namespace;
	}

	public async get(key: string, opts?: { raw: true }): Promise<void | KeyvStoreObject<TVal>>
	public async get(key: string, opts?: { raw?: false }): Promise<void | TVal>
	public async get(key: string, opts?: { raw?: boolean }): Promise<void | TVal | KeyvStoreObject<TVal>> {
		key = this._getKeyPrefix(key);
		const { store } = this.opts;
		const maybeJSONStringData: void | string | KeyvStoreObject<TVal> = await store.get(key);
		const data = typeof maybeJSONStringData === 'string' ?
			this.opts.deserialize(maybeJSONStringData) :
			maybeJSONStringData;

		if (data === undefined) {
			return;
		}

		if (typeof data.expires === 'number' && Date.now() > data.expires) {
			this.delete(key);
			return undefined;
		}

		return (opts && opts.raw) ? data : data.value;
	}

	public async set(key: string, value: TVal, ttl = this.opts.ttl): Promise<boolean> {
		key = this._getKeyPrefix(key);

		if (ttl === 0) {
			ttl = undefined;
		}

		const { store } = this.opts;
		const expires = (typeof ttl === 'number') ? (Date.now() + ttl) : null;
		const storeObj = { value, expires };

		await store.set(key, this.opts.serialize(storeObj), ttl);

		return true;
	}

	public async delete(key: string): Promise<boolean> {
		key = this._getKeyPrefix(key);
		const { store } = this.opts;
		return store.delete(key);
	}

	public async clear(): Promise<void> {
		const { store } = this.opts;
		return store.clear();
	}

	private _getKeyPrefix(key: string): string {
		return `${this.opts.namespace}:${key}`;
	}
}
