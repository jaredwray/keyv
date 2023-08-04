/* eslint-disable @typescript-eslint/ban-types */
import {EventEmitter} from 'eventemitter3';

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
	primaryStorage?: StorageAdapterOrMapType;
	compression?: CompressionAdapterType | undefined;
	secondaryStorage?: StorageAdapterOrMapType | undefined;
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

export default class Keyv extends EventEmitter {
	private readonly _options: KeyvOptionsType = {
		namespace: 'keyv',
		ttl: undefined,
		primaryStorage: new Map(),
		secondaryStorage: undefined,
		compression: undefined,
		offlineMode: false,
	};

	private readonly _hooks = new Map<string, HookFunction>();

	constructor(args1?: StorageAdapterOrMapType | string | KeyvOptionsType, options?: KeyvOptionsType) {
		super();

		if (typeof args1 === 'string') {
			console.warn('Keyv: The `uri` option is deprecated. Please use the StorageAdapter instance instead.');
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

	public get primaryStorage(): StorageAdapterOrMapType | undefined {
		return this._options.primaryStorage;
	}

	public set primaryStorage(value: StorageAdapterOrMapType) {
		this._options.primaryStorage = value;
	}

	// Legacy reference of store
	public get store(): StorageAdapterOrMapType | undefined {
		return this._options.primaryStorage;
	}

	public set store(value: StorageAdapterOrMapType) {
		this._options.primaryStorage = value;
	}

	public get secondaryStorage(): StorageAdapterOrMapType | undefined {
		return this._options.secondaryStorage;
	}

	public set secondaryStorage(value: StorageAdapterOrMapType) {
		this._options.secondaryStorage = value;
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

	public async get(key: string | string[]): Promise<any> {
		return undefined;
	}

	public async set(key: string | string[], value: any, ttl?: number): Promise<any> {
		return undefined;
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

	private serializeData(data: any): string {
		return '';
	}

	private deserializeData(data: string): any {
		return undefined;
	}

	private normalize(string_: string): string {
		return string_.toLowerCase().replace(/\s+/g, '');
	}

	private isValidHookName(name: string): boolean {
		const normalizedName = this.normalize(name);
		return Object.values(KeyvHooks).some(value => this.normalize(value) === normalizedName);
	}
}
