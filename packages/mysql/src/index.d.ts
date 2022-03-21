import EventEmitter from 'node:events';

export = KeyvMysql;
declare class KeyvMysql extends EventEmitter {
	readonly ttlSupport: false;
	opts: any;
	query: (sqlString: any) => any;
	constructor(options?: string | KeyvSqlite.Options);
	get(key: any): any;
	getMany(keys: any): any;
	set(key: any, value: any): any;
	delete(key: any): any;
	deleteMany(key: any): any;
	clear(): any;
	iterator(namespace: any): AsyncGenerator<any, void, any>;
	has(key: any): any;
}
// # sourceMappingURL=index.d.ts.map
