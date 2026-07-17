import { createHash } from "node:crypto";
import mysql, { type PoolOptions } from "mysql2";
import type { Pool as PromisePool } from "mysql2/promise";

type PoolEntry = {
	promisePool: PromisePool;
	references: number;
};

export type PoolLease = {
	connection: PromisePool;
	release: () => Promise<void>;
};

const pools = new Map<string, PoolEntry>();
const closingPools = new Set<Promise<void>>();
const objectIdentities = new WeakMap<object, number>();
const symbolIdentities = new Map<symbol, number>();
let nextIdentity = 0;

const getObjectIdentity = (value: object): number => {
	let identity = objectIdentities.get(value);
	if (identity === undefined) {
		identity = nextIdentity++;
		objectIdentities.set(value, identity);
	}

	return identity;
};

const getSymbolIdentity = (value: symbol): number => {
	let identity = symbolIdentities.get(value);
	if (identity === undefined) {
		identity = nextIdentity++;
		symbolIdentities.set(value, identity);
	}

	return identity;
};

/**
 * Serializes mysql2 pool options deterministically for use in the pool cache key.
 * Plain objects are sorted by key, while values whose behavior depends on object
 * identity (such as streams and callbacks) retain that identity in the result.
 */
const serializePoolOption = (value: unknown, ancestors = new Set<object>()): string => {
	if (value === null) {
		return "null";
	}

	switch (typeof value) {
		case "undefined": {
			return "undefined";
		}

		case "string": {
			return `string:${JSON.stringify(value)}`;
		}

		case "number": {
			if (Number.isNaN(value)) {
				return "number:NaN";
			}

			if (Object.is(value, -0)) {
				return "number:-0";
			}

			return `number:${value}`;
		}

		case "bigint": {
			return `bigint:${value}`;
		}

		case "boolean": {
			return `boolean:${value}`;
		}

		case "symbol": {
			return `symbol:${getSymbolIdentity(value)}`;
		}

		case "function": {
			return `function:${getObjectIdentity(value)}`;
		}

		default: {
			break;
		}
	}

	const objectValue = value as object;
	if (Buffer.isBuffer(objectValue)) {
		return `buffer:${objectValue.toString("base64")}`;
	}

	if (objectValue instanceof Date) {
		return `date:${objectValue.toISOString()}`;
	}

	if (ancestors.has(objectValue)) {
		return `circular:${getObjectIdentity(objectValue)}`;
	}

	if (Array.isArray(objectValue)) {
		ancestors.add(objectValue);
		const serialized = objectValue.map((item) => serializePoolOption(item, ancestors));
		ancestors.delete(objectValue);
		return `array:[${serialized.join(",")}]`;
	}

	const prototype = Object.getPrototypeOf(objectValue);
	if (prototype === Object.prototype || prototype === null) {
		ancestors.add(objectValue);
		const serialized = Object.keys(objectValue)
			.sort()
			.map(
				(key) =>
					`${JSON.stringify(key)}:${serializePoolOption((objectValue as Record<string, unknown>)[key], ancestors)}`,
			);
		ancestors.delete(objectValue);
		return `object:{${serialized.join(",")}}`;
	}

	return `object:${getObjectIdentity(objectValue)}`;
};

const getCacheKey = (options: PoolOptions): string =>
	createHash("sha256").update(serializePoolOption(options)).digest("hex");

const closePool = (entry: PoolEntry): Promise<void> => {
	const closing = entry.promisePool.end();
	closingPools.add(closing);
	void closing.then(
		() => closingPools.delete(closing),
		() => closingPools.delete(closing),
	);
	return closing;
};

export const parseConnectionString = (connectionString: string) => {
	// Handle # character as URL breaks when it is present
	connectionString = connectionString.replace(/#/g, "%23");
	// Create a new URL object
	const url = new URL(connectionString);

	// Create the poolOptions object
	const poolOptions = {
		user: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password) || undefined,
		host: url.hostname,
		port: url.port ? Number.parseInt(url.port, 10) : undefined,
		database: decodeURIComponent(url.pathname.slice(1)), // Remove the leading '/'
	};

	// Remove undefined properties
	for (const key of Object.keys(poolOptions)) {
		// @ts-expect-error - poolOptions
		if (poolOptions[key] === undefined) {
			//  @ts-expect-error
			delete poolOptions[key];
		}
	}

	return poolOptions;
};

/**
 * Acquires a reference-counted pool lease for the effective connection options.
 * Adapters with equivalent options share a pool; differing options never do.
 */
export const pool = (uri: string, options: PoolOptions = {}): PoolLease => {
	const connectObject = parseConnectionString(uri);
	const poolOptions = { ...connectObject, ...options };
	const cacheKey = getCacheKey(poolOptions);
	let entry = pools.get(cacheKey);

	if (!entry) {
		const mysqlPool = mysql.createPool(poolOptions);
		entry = {
			promisePool: mysqlPool.promise(),
			references: 0,
		};
		pools.set(cacheKey, entry);
	}

	entry.references++;
	let released = false;

	return {
		connection: entry.promisePool,
		release: async () => {
			if (released) {
				return;
			}

			released = true;
			const currentEntry = pools.get(cacheKey);
			if (currentEntry !== entry) {
				return;
			}

			entry.references--;
			if (entry.references === 0) {
				pools.delete(cacheKey);
				await closePool(entry);
			}
		},
	};
};

/** Closes all cached pools. Intended for test and process-level cleanup. */
export const endPool = async (): Promise<void> => {
	const entries = [...pools.values()];
	pools.clear();
	for (const entry of entries) {
		closePool(entry);
	}

	await Promise.all([...closingPools]);
};
