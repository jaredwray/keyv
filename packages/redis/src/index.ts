import EventEmitter from 'events';
import {createClient, type RedisClientType, type RedisClientOptions} from 'redis';
import {type KeyvStoreAdapter} from 'keyv';

export default class KeyvRedis extends EventEmitter {
	// eslint-disable-next-line @typescript-eslint/class-literal-property-style
	private readonly _defaultUri = 'redis://localhost:6379';
	private _client: RedisClientType = createClient({url: this._defaultUri}) as RedisClientType;

	constructor(argument1?: RedisClientOptions | RedisClientType) {
		super();

		if (argument1) {
			if ((argument1 as RedisClientType).connect !== undefined) {
				this._client = argument1 as RedisClientType;
			} else if (argument1 instanceof Object) {
				this._client = createClient(argument1 as RedisClientOptions) as RedisClientType;
			}
		}

		/* c8 ignore next 3 */
		this._client.on('error', error => {
			this.emit('error', error);
		});
	}

	public get client(): RedisClientType {
		return this._client;
	}

	public set client(value: RedisClientType) {
		this._client = value;
	}

	public async getClient(): Promise<RedisClientType> {
		if (!this._client.isOpen) {
			await this._client.connect();
		}

		return this._client;
	}

	public async set(key: string, value: string, ttl?: number): Promise<void> {
		const client = await this.getClient();
		if (ttl) {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			await client.set(key, value, {PX: ttl});
		} else {
			await client.set(key, value);
		}
	}

	public async get(key: string): Promise<string | undefined> {
		const client = await this.getClient();
		const value = await client.get(key);
		if (value === null) {
			return undefined;
		}

		return value;
	}

	public async delete(key: string): Promise<boolean> {
		const client = await this.getClient();
		const result = await client.del(key);
		return result === 1;
	}

	public async disconnect(): Promise<void> {
		await this._client.quit();
	}
}

export {type StoredData} from 'keyv';
export {type RedisClientOptions, type RedisClientType} from 'redis';
