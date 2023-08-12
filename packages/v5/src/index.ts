import { triggerAsyncId } from "async_hooks";

/* eslint-disable @typescript-eslint/ban-types */
export type StorageAdapterType = {
	get<T>(key: string): Promise<T | undefined>;
	getMany?<T>(keys: string[]): Promise<Array<T | undefined>>;
	set(key: string, value: string): Promise<void>;
	delete(key: string): Promise<boolean>;
	deleteMany?(keys: string[]): Promise<boolean[]>;
	clear(): Promise<void>;
	disconnect?(): Promise<void>;
};

export type StorageAdapterOrMapType = StorageAdapterType | Map<any, any>;

export type CompressionAdapterType = {
	compress(data: string): Promise<string>;
	decompress(data: string): Promise<string>;
};

export type KeyvOptionsType = {
	namespace?: string;
	ttl?: number | undefined;
	primaryStore?: StorageAdapterOrMapType;
	compression?: CompressionAdapterType | undefined;
	secondaryStore?: StorageAdapterOrMapType | undefined;
	offlineMode?: boolean;
	serialize?: Function;
	deserialize?: Function;
	// Legacy
	store?: StorageAdapterOrMapType;
	adapter?: StorageAdapterOrMapType;
};

export type HookFunction = (...args: any[]) => void;

export enum KeyvHooks {
	PRE_SET = 'preSet',
	POST_SET = 'postSet',
	PRE_SET_MANY = 'preSetMany',
	POST_SET_MANY = 'postSetMany',
	PRE_GET = 'preGet',
	POST_GET = 'postGet',
	PRE_GET_MANY = 'preGetMany',
	POST_GET_MANY = 'postGetMany',
	PRE_DELETE = 'preDelete',
	POST_DELETE = 'postDelete',
	PRE_CLEAR = 'preClear',
	POST_CLEAR = 'postClear',
}

export default class Keyv extends EventTarget {
	private readonly _options: KeyvOptionsType = {
		namespace: 'keyv',
		ttl: undefined,
		primaryStore: new Map(),
		secondaryStore: undefined,
		compression: undefined,
	};

	private readonly _hooks = new Map<string, HookFunction>();

	// Supported constructor overloads (in order):
	// new Keyv()
	// new Keyv({ KeyvOptionsType... });
	// new Keyv(new KeyvRedis('redis://user:pass@localhost:6379'));
	// new Keyv(new KeyvRedis('redis://user:pass@localhost:6379'), { KeyvOptionsType... });
	constructor(args1?: StorageAdapterOrMapType | KeyvOptionsType, options?: KeyvOptionsType) {
		super();

		// New Keyv({ KeyvOptionsType... });
		if (args1 !== undefined && this.isValidKeyvOptionsType(args1)) {
			this._options = {...this._options, ...args1};
		}

		// New Keyv(new KeyvRedis());
		// new Keyv(new KeyvRedis(), { KeyvOptionsType... });
		if (this.isValidStorageAdapterOrMapType(args1)) {
			this._options.primaryStore = args1;

			if (this.isValidKeyvOptionsType(options)) {
				this._options = {...this._options, ...options};
			}
		}
	}

	public get namespace(): string | undefined {
		return this._options.namespace;
	}

	public set namespace(value: string) {
		this._options.namespace = value;
	}

	public get ttl(): number | undefined {
		return this._options.ttl;
	}

	public set ttl(value: number) {
		this._options.ttl = value;
	}

	public get primaryStore(): StorageAdapterOrMapType | undefined {
		return this._options.primaryStore;
	}

	public set primaryStore(value: StorageAdapterOrMapType) {
		this._options.primaryStore = value;
	}

	// Legacy reference of store
	public get store(): StorageAdapterOrMapType | undefined {
		return this._options.primaryStore;
	}

	public set store(value: StorageAdapterOrMapType) {
		this._options.primaryStore = value;
	}

	public get secondaryStore(): StorageAdapterOrMapType | undefined {
		return this._options.secondaryStore;
	}

	public set secondaryStore(value: StorageAdapterOrMapType) {
		this._options.secondaryStore = value;
	}

	public get compression(): CompressionAdapterType | undefined {
		return this._options.compression;
	}

	public set compression(value: CompressionAdapterType) {
		this._options.compression = value;
	}

	public setHook(name: string, fn: HookFunction): void {
		if (this.isValidHookName(name)) {
			this._hooks.set(name, fn);
		}
	}

	public deleteHook(name: string): void {
		this._hooks.delete(name);
	}

	public triggerHook(name: string, ...args: any[]): void {
		const hook = this._hooks.get(name);
		if (hook) {
			hook(...args);
		}
	}

	public async get<T>(key: string | string[]): Promise<T> {
		return undefined as T;
	}

	public async set(key: string | string[], value: any, ttl?: number): Promise<Boolean> {
		try {
		
			this.triggerHook(KeyvHooks.PRE_SET, key, value, ttl);

			await this.primaryStore.set(key, value, ttl);

			this.triggerHook(KeyvHooks.POST_SET, key, value, ttl);
		} catch (error) {
			return false;
		}

		return true;
	}

	public async delete(key: string | string[]): Promise<boolean> {
		return false;
	}

	public async clear(): Promise<void> {
		return undefined;
	}

	public async disconnect(): Promise<void> {
		return undefined;
	}

	// Legacy support for Event Emitter
	public on(event: string, listener: (...args: any[]) => void): void {
		this.addEventListener(event, listener);
	}

	private serializeData(data: any): string {
		return '';
	}

	private deserializeData(data: string): any {
		return undefined;
	}

	private normalize(string_: string): string {
		return string_.toLowerCase().split(/\s+/).join('');
	}

	private isValidHookName(name: string): boolean {
		const normalizedName = this.normalize(name);
		return Object.values(KeyvHooks).some(value => this.normalize(value) === normalizedName);
	}

	private isValidStorageMap(store: StorageAdapterOrMapType): store is Map<any, any> {
		return store instanceof Map;
	}

	private isValidStorageAdapter(store: StorageAdapterOrMapType): store is StorageAdapterType {
		return typeof store === 'object' && typeof store.get === 'function';
	}

	private isValidStorageAdapterOrMapType(store: any): store is StorageAdapterOrMapType {
		return this.isValidStorageAdapter(store) || this.isValidStorageMap(store);
	}

	private isValidCompressionAdapterType(compression: any): compression is CompressionAdapterType {
		if (typeof compression !== 'object' || compression === null) {
			return false;
		}

		if (typeof compression.compress !== 'function') {
			return false;
		}

		if (typeof compression.decompress !== 'function') {
			return false;
		}

		return true;
	}

	private isValidKeyvOptionsType(arg: any): arg is KeyvOptionsType {
		if (typeof arg !== 'object' || arg === null) {
			return false;
		}

		if ('namespace' in arg && typeof arg.namespace !== 'string') {
			return false;
		}

		if ('ttl' in arg && typeof arg.ttl !== 'number') {
			return false;
		}

		if ('primaryStorage' in arg && !this.isValidStorageAdapterOrMapType(arg.primaryStorage)) {
			return false;
		}

		if ('compression' in arg && !this.isValidCompressionAdapterType(arg.compression)) {
			return false;
		}

		if ('secondaryStorage' in arg && !this.isValidStorageAdapterOrMapType(arg.secondaryStorage)) {
			return false;
		}

		if ('serialize' in arg && typeof arg.serialize !== 'function') {
			return false;
		}

		if ('deserialize' in arg && typeof arg.deserialize !== 'function') {
			return false;
		}

		if ('store' in arg && !this.isValidStorageAdapterOrMapType(arg.store)) {
			return false;
		}

		return true;
	}
}
