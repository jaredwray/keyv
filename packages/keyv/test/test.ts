import * as test from 'vitest';
import keyvTestSuite, {keyvIteratorTests} from '@keyv/test-suite';
import tk from 'timekeeper';
import KeyvSqlite from '@keyv/sqlite';
import KeyvMongo from '@keyv/mongo';
import KeyvBrotli from '@keyv/compress-brotli';
import KeyvGzip from '@keyv/compress-gzip';
import KeyvMemcache from '@keyv/memcache';
import Keyv from '../src';
import type {KeyvStoreAdapter, StoredDataNoRaw} from '../src';

const keyvMemcache = new KeyvMemcache('localhost:11211');

// eslint-disable-next-line no-promise-executor-return
const snooze = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const store = () => new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000});
keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test.it('Keyv is a class', t => {
	t.expect(typeof Keyv).toBe('function');
	// @ts-expect-error
	t.expect(() => Keyv()).toThrow(); // eslint-disable-line new-cap
	t.expect(() => new Keyv()).not.toThrow();
});

test.it('Keyv accepts storage adapters', async t => {
	const store = new Map();
	const keyv = new Keyv({store});
	t.expect(store.size).toBe(0);
	await keyv.set('foo', 'bar');
	t.expect(await keyv.get('foo')).toBe('bar');
	t.expect(await keyv.get('foo', {raw: true})).toEqual({value: 'bar', expires: null});
	t.expect(store.size).toBe(1);
});

test.it('Keyv passes ttl info to stores', async t => {
	t.expect.assertions(1);
	const store = new Map();
	const storeSet = store.set;
	// @ts-expect-error
	store.set = (key, value, ttl) => {
		t.expect(ttl).toBe(100);
		// @ts-expect-error
		storeSet.call(store, key, value, ttl);
	};

	const keyv = new Keyv({store});
	await keyv.set('foo', 'bar', 100);
});

test.it('Keyv respects default ttl option', async t => {
	const store = new Map();
	const keyv = new Keyv({store, ttl: 100});
	await keyv.set('foo', 'bar');
	t.expect(await keyv.get('foo')).toBe('bar');
	tk.freeze(Date.now() + 150);
	t.expect(await keyv.get('foo')).toBeUndefined();
	t.expect(store.size).toBe(0);
	tk.reset();
});

test.it('.set(key, val, ttl) overwrites default ttl option', async t => {
	const startTime = Date.now();
	tk.freeze(startTime);
	const keyv = new Keyv({ttl: 200});
	await keyv.set('foo', 'bar');
	await keyv.set('fizz', 'buzz', 100);
	await keyv.set('ping', 'pong', 300);
	t.expect(await keyv.get('foo')).toBe('bar');
	t.expect(await keyv.get('fizz')).toBe('buzz');
	t.expect(await keyv.get('ping')).toBe('pong');
	tk.freeze(startTime + 150);
	t.expect(await keyv.get('foo')).toBe('bar');
	t.expect(await keyv.get('fizz')).toBeUndefined();
	t.expect(await keyv.get('ping')).toBe('pong');
	tk.freeze(startTime + 250);
	t.expect(await keyv.get('foo')).toBeUndefined();
	t.expect(await keyv.get('ping')).toBe('pong');
	tk.freeze(startTime + 350);
	t.expect(await keyv.get('ping')).toBeUndefined();
	tk.reset();
});

test.it('.set(key, val, ttl) where ttl is "0" overwrites default ttl option and sets key to never expire', async t => {
	const startTime = Date.now();
	tk.freeze(startTime);
	const store = new Map();
	const keyv = new Keyv({store, ttl: 200});
	await keyv.set('foo', 'bar', 0);
	t.expect(await keyv.get('foo')).toBe('bar');
	tk.freeze(startTime + 250);
	t.expect(await keyv.get('foo')).toBe('bar');
	tk.reset();
});

test.it('.get(key, {raw: true}) returns the raw object instead of the value', async t => {
	const keyv = new Keyv();
	await keyv.set('foo', 'bar');
	const value = await keyv.get('foo');
	const rawObject = await keyv.get('foo', {raw: true});
	t.expect(value).toBe('bar');
	t.expect(rawObject!.value).toBe('bar');
});

test.it('Keyv uses custom serializer when provided instead of default', async t => {
	t.expect.assertions(3);
	const store = new Map();
	const serialize = (data: Record<string, unknown>) => {
		t.expect(true).toBeTruthy();
		return JSON.stringify(data);
	};

	const deserialize = (data: string) => {
		t.expect(true).toBeTruthy();
		return JSON.parse(data);
	};

	const keyv = new Keyv({store, serialize, deserialize});
	await keyv.set('foo', 'bar');
	t.expect(await keyv.get('foo')).toBe('bar');
});

test.it('Keyv supports async serializer/deserializer', async t => {
	t.expect.assertions(3);
	const serialize = (data: Record<string, unknown>) => {
		t.expect(true).toBeTruthy();
		return JSON.stringify(data);
	};

	const deserialize = (data: string) => {
		t.expect(true).toBeTruthy();
		return JSON.parse(data);
	};

	const keyv = new Keyv({serialize, deserialize});
	await keyv.set('foo', 'bar');
	t.expect(await keyv.get('foo')).toBe('bar');
});

test.it('Keyv should wait for the expired get', async t => {
	t.expect.assertions(4);
	const _store = new Map();
	const store = {
		get: async (key: string) => _store.get(key),
		set(key: string, value: any) {
			_store.set(key, value);
		},
		async delete(key: string) {
			await new Promise<void>(resolve => {
				setTimeout(() => {
					// Simulate database latency
					resolve();
				}, 20);
			});
			return _store.delete(key);
		},
	} as KeyvStoreAdapter;

	const keyv = new Keyv({store});

	// Round 1
	const v1 = await keyv.get('foo');
	t.expect(v1).toBeUndefined();

	await keyv.set('foo', 'bar', 1000);
	const v2 = await keyv.get('foo');
	t.expect(v2).toBe('bar');

	await new Promise<void>(resolve => {
		setTimeout(() => {
			// Wait for expired
			resolve();
		}, 1100);
	});

	// Round 2
	const v3 = await keyv.get('foo');
	t.expect(v3).toBeUndefined();

	await keyv.set('foo', 'bar', 1000);
	await new Promise<void>(resolve => {
		setTimeout(() => {
			// Simulate database latency
			resolve();
		}, 30);
	});
	const v4 = await keyv.get('foo');
	t.expect(v4).toBe('bar');
});

test.it('.delete([keys]) should delete multiple keys for storage adapter not supporting deleteMany', async t => {
	const keyv = new Keyv({store: new Map()});
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	t.expect(await keyv.delete(['foo', 'foo1', 'foo2'])).toBeTruthy();
	t.expect(await keyv.get('foo')).toBeUndefined();
	t.expect(await keyv.get('foo1')).toBeUndefined();
	t.expect(await keyv.get('foo2')).toBeUndefined();
});

test.it('.delete([keys]) with nonexistent keys resolves to false for storage adapter not supporting deleteMany', async t => {
	const keyv = new Keyv({store: new Map()});
	t.expect(await keyv.delete(['foo', 'foo1', 'foo2'])).toBe(false);
});

test.it('keyv.get([keys]) should return array values', async t => {
	const keyv = new Keyv({store: new Map()});
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	const values = await keyv.get<string>(['foo', 'foo1', 'foo2']) as string[];
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values[0]).toBe('bar');
	t.expect(values[1]).toBe('bar1');
	t.expect(values[2]).toBe('bar2');

	const rawValues = await keyv.get<string>(['foo', 'foo1', 'foo2'], {raw: true});
	t.expect(Array.isArray(rawValues)).toBeTruthy();
	t.expect(rawValues[0]).toEqual({value: 'bar', expires: null});
	t.expect(rawValues[1]).toEqual({value: 'bar1', expires: null});
	t.expect(rawValues[2]).toEqual({value: 'bar2', expires: null});
});

test.it('keyv.get([keys]) should return array value undefined when expires', async t => {
	const keyv = new Keyv({store: new Map()});
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1', 1);
	await keyv.set('foo2', 'bar2');
	await new Promise<void>(resolve => {
		setTimeout(() => {
			// Simulate database latency
			resolve();
		}, 30);
	});
	const values = await keyv.get<string>(['foo', 'foo1', 'foo2']);
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values[0]).toBe('bar');
	t.expect(values[1]).toBeUndefined();
	t.expect(values[2]).toBe('bar2');
});

test.it('keyv.get([keys]) should return array value undefined when expires sqlite', async t => {
	const keyv = new Keyv({store: store()});
	await keyv.clear();
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1', 1);
	await keyv.set('foo2', 'bar2');
	await new Promise<void>(resolve => {
		setTimeout(() => {
			resolve();
		}, 30);
	});
	const values = await keyv.get<string>(['foo', 'foo1', 'foo2']);
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values[0]).toBe('bar');
	t.expect(values[1]).toBeUndefined();
	t.expect(values[2]).toBe('bar2');
});

test.it('keyv.get([keys]) should return empty array when expires sqlite', async t => {
	const keyv = new Keyv({store: store()});
	await keyv.clear();
	await keyv.set('foo', 'bar', 1);
	await keyv.set('foo1', 'bar1', 1);
	await keyv.set('foo2', 'bar2', 1);
	await new Promise<void>(resolve => {
		setTimeout(() => {
			resolve();
		}, 30);
	});
	const values = await keyv.get(['foo', 'foo1', 'foo2']);
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values.length).toBe(3);
});

test.it('keyv.get([keys]) should return array raw values sqlite', async t => {
	const keyv = new Keyv({store: store()});
	await keyv.clear();
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	const values = await keyv.get<string>(['foo', 'foo1'], {raw: true}) as Array<StoredDataNoRaw<string>>;
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values[0]).toEqual({value: 'bar', expires: null});
	t.expect(values[1]).toEqual({value: 'bar1', expires: null});
});

test.it('keyv.get([keys]) should return array raw values undefined sqlite', async t => {
	const keyv = new Keyv({store: store()});
	await keyv.clear();
	const values = await keyv.get<string>(['foo', 'foo1'], {raw: true});
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values[0]).toBeUndefined();
	t.expect(values[1]).toBeUndefined();
});

test.it('keyv.get([keys]) should return array values with undefined', async t => {
	const keyv = new Keyv({store: new Map()});
	await keyv.set('foo', 'bar');
	await keyv.set('foo2', 'bar2');
	const values = await keyv.get<string>(['foo', 'foo1', 'foo2']);
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values[0]).toBe('bar');
	t.expect(values[1]).toBeUndefined();
	t.expect(values[2]).toBe('bar2');
});

test.it('keyv.get([keys]) should return array values with all undefined using storage adapter', async t => {
	const keyv = new Keyv({store: store()});
	const values = await keyv.get<string>(['foo', 'foo1', 'foo2']);
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values[0]).toBeUndefined();
	t.expect(values[1]).toBeUndefined();
	t.expect(values[2]).toBeUndefined();
});

test.it('keyv.get([keys]) should return undefined array for all no existent keys', async t => {
	const keyv = new Keyv({store: new Map()});
	const values = await keyv.get(['foo', 'foo1', 'foo2']);
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values).toEqual([undefined, undefined, undefined]);
});

test.it('pass compress options', async t => {
	// @ts-expect-error - compression options
	const keyv = new Keyv({store: new Map(), compression: new KeyvBrotli()});
	await keyv.set('foo', 'bar');
	t.expect(await keyv.get('foo')).toBe('bar');
});

test.it('compress/decompress with gzip', async t => {
	// @ts-expect-error - compression options
	const keyv = new Keyv({store: new Map(), compression: new KeyvGzip()});
	await keyv.set('foo', 'bar');
	t.expect(await keyv.get('foo')).toBe('bar');
});

test.it('iterator should exists with url', t => {
	const store = new Keyv({store: new KeyvMongo({url: 'mongodb://127.0.0.1:27017'})});
	t.expect(typeof store.iterator).toBe('function');
});

test.it(
	'keyv iterator() doesn\'t yield values from other namespaces with compression',
	async t => {
		const KeyvStore = new Map();
		// @ts-expect-error - compression options
		const keyv1 = new Keyv({store: KeyvStore, namespace: 'keyv1', compression: new KeyvGzip()});
		const map1 = new Map(
			Array.from({length: 5})
				.fill(0)
				.map((x, i) => [String(i), String(i + 10)]),
		);
		const toResolve = [];
		for (const [key, value] of map1) {
			toResolve.push(keyv1.set(key, value));
		}

		await Promise.all(toResolve);
		// @ts-expect-error - compression options
		const keyv2 = new Keyv({store: KeyvStore, namespace: 'keyv2', compression: new KeyvGzip()});
		const map2 = new Map(
			Array.from({length: 5})
				.fill(0)
				.map((x, i) => [String(i), String(i + 11)]),
		);
		toResolve.length = 0;
		for (const [key, value] of map2) {
			toResolve.push(keyv2.set(key, value));
		}

		await Promise.all(toResolve);

		t.expect.assertions(map2.size);
		// @ts-expect-error
		for await (const [key, value] of keyv2.iterator()) {
			const doesKeyExist = map2.has(key);
			const isValueSame = map2.get(key) === value;
			t.expect(doesKeyExist && isValueSame).toBeTruthy();
		}
	},
);

test.it(
	'keyv iterator() doesn\'t yield values from other namespaces',
	async t => {
		const KeyvStore = new Map();

		const keyv1 = new Keyv({store: KeyvStore, namespace: 'keyv1'});
		const map1 = new Map(
			Array.from({length: 5})
				.fill(0)
				.map((x, i) => [String(i), String(i + 10)]),
		);
		const toResolve = [];
		for (const [key, value] of map1) {
			toResolve.push(keyv1.set(key, value));
		}

		await Promise.all(toResolve);

		const keyv2 = new Keyv({store: KeyvStore, namespace: 'keyv2'});
		const map2 = new Map(
			Array.from({length: 5})
				.fill(0)
				.map((x, i) => [String(i), i + 11]),
		);
		toResolve.length = 0;
		for (const [key, value] of map2) {
			toResolve.push(keyv2.set(key, value));
		}

		await Promise.all(toResolve);

		t.expect.assertions(map2.size);
		// @ts-expect-error
		for await (const [key, value] of keyv2.iterator()) {
			const doesKeyExist = map2.has(key);
			const isValueSame = map2.get(key) === value;
			t.expect(doesKeyExist && isValueSame).toBeTruthy();
		}
	},
);

test.it(
	'keyv iterator() doesn\'t yield values from other namespaces with custom serializer/deserializer',
	async t => {
		const KeyvStore = new Map();

		const serialize = (data: Record<string, unknown>) => JSON.stringify(data);

		const deserialize = (data: string) => JSON.parse(data);

		const keyv1 = new Keyv({store: KeyvStore, serialize, deserialize, namespace: 'keyv1'});
		const map1 = new Map(
			Array.from({length: 5})
				.fill(0)
				.map((x, i) => [String(i), String(i + 10)]),
		);
		const toResolve = [];
		for (const [key, value] of map1) {
			toResolve.push(keyv1.set(key, value));
		}

		await Promise.all(toResolve);

		const keyv2 = new Keyv({store: KeyvStore, serialize, deserialize, namespace: 'keyv2'});
		const map2 = new Map(
			Array.from({length: 5})
				.fill(0)
				.map((x, i) => [String(i), i + 11]),
		);
		toResolve.length = 0;
		for (const [key, value] of map2) {
			toResolve.push(keyv2.set(key, value));
		}

		await Promise.all(toResolve);

		t.expect.assertions(map2.size);
		// @ts-expect-error
		for await (const [key, value] of keyv2.iterator()) {
			const doesKeyExist = map2.has(key);
			const isValueSame = map2.get(key) === value;
			t.expect(doesKeyExist && isValueSame).toBeTruthy();
		}
	},
);

test.it(
	'keyv iterator() doesn\'t yield values from other namespaces with custom serializer/deserializer and compression',
	async t => {
		const KeyvStore = new Map();

		const serialize = (data: Record<string, unknown>) => JSON.stringify(data);
		const deserialize = (data: string) => JSON.parse(data);
		// @ts-expect-error - compression options
		const keyv1 = new Keyv({store: KeyvStore, serialize, deserialize, namespace: 'keyv1', compression: new KeyvGzip()});
		const map1 = new Map(
			Array.from({length: 5})
				.fill(0)
				.map((x, i) => [String(i), String(i + 10)]),
		);
		const toResolve = [];
		for (const [key, value] of map1) {
			toResolve.push(keyv1.set(key, value));
		}

		await Promise.all(toResolve);

		const keyv2 = new Keyv({store: KeyvStore, serialize, deserialize, namespace: 'keyv2'});
		const map2 = new Map(
			Array.from({length: 5})
				.fill(0)
				.map((x, i) => [String(i), i + 11]),
		);
		toResolve.length = 0;
		for (const [key, value] of map2) {
			toResolve.push(keyv2.set(key, value));
		}

		await Promise.all(toResolve);

		t.expect.assertions(map2.size);
		// @ts-expect-error
		for await (const [key, value] of keyv2.iterator()) {
			const doesKeyExist = map2.has(key);
			const isValueSame = map2.get(key) === value;
			t.expect(doesKeyExist && isValueSame).toBeTruthy();
		}
	},
);

test.it('close connection successfully', async t => {
	const keyv = new Keyv({store: store()});
	await keyv.clear();
	t.expect(await keyv.get('foo')).toBeUndefined();
	await keyv.set('foo', 'bar');
	t.expect(await keyv.disconnect()).toBeUndefined();
});

test.it('close connection undefined', async t => {
	const store = new Map();
	const keyv = new Keyv({store});
	t.expect(await keyv.disconnect()).toBeUndefined();
});

test.it('get keys, one key expired', async t => {
	const keyv = new Keyv({store: keyvMemcache});
	await keyv.set('foo', 'bar', 10_000);
	await keyv.set('fizz', 'buzz', 100);
	await keyv.set('ping', 'pong', 10_000);
	await snooze(100);
	await keyv.get(['foo', 'fizz', 'ping']);
	t.expect(await keyv.get('fizz')).toBeUndefined();
	t.expect(await keyv.get('foo')).toBe('bar');
	t.expect(await keyv.get('ping')).toBe('pong');
});

test.it('emit clear event', async t => {
	const keyv = new Keyv();
	keyv.on('clear', () => {
		t.expect(true).toBeTruthy();
	});
	await keyv.clear();
});

test.it('emit disconnect event', async t => {
	const keyv = new Keyv();
	keyv.on('disconnect', () => {
		t.expect(true).toBeTruthy();
	});
	await keyv.disconnect();
});

test.it('Keyv has should return if adapter does not support has', async t => {
	const keyv = new Keyv();
	await keyv.set('foo', 'bar');
	t.expect(await keyv.has('foo')).toBe(true);
	t.expect(await keyv.has('fizz')).toBe(false);
});

test.it('Keyv has should return if Map and undefined expires', async t => {
	const keyv = new Keyv();
	await keyv.set('foo', 'bar');
	t.expect(await keyv.has('foo')).toBe(true);
	t.expect(await keyv.has('fizz')).toBe(false);
});

test.it('Keyv has should return if adapter does not support has on expired', async t => {
	const keyv = new Keyv({store: new Map()});
	keyv.opts.store.has = undefined;
	await keyv.set('foo', 'bar', 1000);
	t.expect(await keyv.has('foo')).toBe(true);
	await snooze(1100);
	t.expect(await keyv.has('foo')).toBe(false);
});

test.it('Keyv memcache has should return false on expired', async t => {
	const keyv = new Keyv({store: keyvMemcache});
	const keyName = 'memcache-expired';
	await keyv.set(keyName, 'bar', 1000);
	await snooze(1100);
	const value = await keyv.get(keyName);
	const exists = await keyv.has(keyName);
	t.expect(value).toBeUndefined();
	t.expect(exists).toBe(false);
});

test.it('Keyv has should return true or false on Map', async t => {
	const keyv = new Keyv({store: new Map()});
	await keyv.set('foo', 'bar', 1000);
	t.expect(await keyv.has('foo')).toBe(true);
	await snooze(1100);
	t.expect(await keyv.has('foo')).toBe(false);
});

test.it('Keyv opts.stats should set the stats manager', t => {
	const keyv = new Keyv({stats: true});
	t.expect(keyv.stats.enabled).toBe(true);
});

test.it('Keyv stats enabled should create counts', async t => {
	const keyv = new Keyv({stats: true});
	await keyv.set('foo', 'bar');
	await keyv.get('foo');
	await keyv.get('foo1');
	await keyv.delete('foo');
	t.expect(keyv.stats.hits).toBe(1);
	t.expect(keyv.stats.misses).toBe(1);
	t.expect(keyv.stats.deletes).toBe(1);
	t.expect(keyv.stats.sets).toBe(1);
});
