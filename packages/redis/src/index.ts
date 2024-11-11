import EventEmitter from 'events';
import {createClient, type RedisClientType, type RedisClientOptions} from 'redis';
import {type KeyvStoreAdapter} from 'keyv';

export default class KeyvRedis extends EventEmitter {
	// eslint-disable-next-line @typescript-eslint/class-literal-property-style
	private readonly _defaultUri = 'redis://localhost:6379';
	private _client: RedisClientType = createClient({url: this._defaultUri}) as RedisClientType;

	constructor(argument1?: RedisClientOptions | RedisClientType) {
		super();

		if ((argument1 as RedisClientType).connect !== undefined) {
			this._client = argument1 as RedisClientType;
		} else if (argument1 instanceof Object) {
			this._client = createClient(argument1 as RedisClientOptions) as RedisClientType;
		}
	}

	public get defaultUri(): string {
		return this._defaultUri;
	}

	public get client(): RedisClientType {
		return this._client;
	}

	public set client(value: RedisClientType) {
		this._client = value;
	}
}

export {type StoredData} from 'keyv';
export {type RedisClientOptions, type RedisClientType} from 'redis';
