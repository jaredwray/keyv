import EventEmitter from 'events';
import { promisify as pify } from 'util';
import redis from 'redis';
import { KeyvStore } from 'keyv';

interface Client {
	del(...keys: string[]): Promise<number>;
	get(key: string): Promise<string>;
	sadd(namespace: string, key: string): Promise<number>;
	srem(namespace: string, key: string): Promise<unknown>;
	smembers(namespace: string): Promise<string[]>;

	set(key: string, value: string): Promise<unknown>;
	set(key: string, value: string, mode: string, ttl: number): Promise<unknown>;
}

export interface KeyvRedisOptions extends redis.ClientOpts {
	uri?: string;
}

export default class KeyvRedis<TVal> extends EventEmitter implements KeyvStore<TVal> {
	public namespace!: string;
	public ttlSupport = true;

	private readonly _redis: Client;

	constructor(uriOrOpts: string | KeyvRedisOptions, _opts: KeyvRedisOptions) {
		super();

		const opts = {
			...((typeof uriOrOpts === 'string') ? { uri: uriOrOpts } : uriOrOpts),
			..._opts
		};
		if (opts.uri && typeof opts.url === 'undefined') {
			opts.url = opts.uri;
		}

		const client = redis.createClient(opts);

		const methods: Array<keyof Client> = ['get', 'set', 'sadd', 'del', 'srem', 'smembers'];

		this._redis = methods.reduce((obj, method) => {
			const fn: any = client[method]; // eslint-disable-line @typescript-eslint/no-explicit-any
			obj[method] = pify(fn.bind(client));
			return obj;
		}, {} as Client);

		client.on('error', err => this.emit('error', err));
	}

	public async get(key: string): Promise<void | string> {
		const value = await this._redis.get(key);
		if (value === null) {
			return;
		}

		return value;
	}

	public async set(key: string, value: string, ttl?: number): Promise<void | number> {
		if (typeof value === 'undefined') {
			return;
		}

		if (typeof ttl === 'number') {
			await this._redis.set(key, value, 'PX', ttl);
		} else {
			await this._redis.set(key, value);
		}

		return this._redis.sadd(this._getNamespace(), key);
	}

	public async delete(key: string): Promise<boolean> {
		const items = await this._redis.del(key);
		await this._redis.srem(this._getNamespace(), key);
		return items > 0;
	}

	public async clear(): Promise<void> {
		const ns = this._getNamespace();
		const keys = await this._redis.smembers(ns);
		await this._redis.del(...keys.concat(ns));
	}

	private _getNamespace(): string {
		return `namespace:${this.namespace}`;
	}
}
