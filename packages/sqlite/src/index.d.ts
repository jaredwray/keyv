import EventEmitter from 'node:events';

export = KeyvSqlite;
declare class KeyvSqlite extends EventEmitter {
	readonly ttlSupport: boolean;
	opts: any;
	db: any;
	constructor(options: any);
	get(key: any): any;
	getMany(keys: any): any[];
	set(key: any, value: any): any;
	delete(key: any): boolean;
	deleteMany(keys: any): boolean;
	clear(): any;
	iterator(namespace: any): AsyncGenerator<any, void, any>;
	has(key: any): boolean;
}
// # sourceMappingURL=index.d.ts.map
