import { Hookified } from "hookified";
import {
	Keyv,
	type KeyvStorageAdapter,
	type KeyvStorageEntry,
	type KeyvStorageGetResult,
	keyvStorageCapability,
} from "keyv";
import type { Namespace } from "./codec.js";
import { attach, detach, registryKey } from "./registry.js";
import { DirectoryStrategy } from "./strategies/directory.js";
import { FileStrategy } from "./strategies/file.js";
import type { Reports, Strategy } from "./strategies/strategy.js";
import type { KeyvFsOptions, KeyvFsStrategy } from "./types.js";

export { KeyvFsCorruptionError, KeyvFsFormatError } from "./errors.js";
export type { KeyvFsOptions, KeyvFsStrategy } from "./types.js";

/** keyv-file's default: 24 hours. */
const DEFAULT_EXPIRED_CHECK_DELAY = 24 * 60 * 60 * 1000;
/** The longest delay `setTimeout` accepts. */
const MAX_TIMER_DELAY = 2_147_483_647;

/**
 * A Keyv storage adapter that keeps data on the local file system.
 *
 * - The `"file"` strategy (the default) keeps the whole store in one file and in memory. Reads
 *   come from memory; writes rewrite the file atomically.
 * - The `"directory"` strategy keeps one file per key and nothing in memory.
 *
 * Every instance on the same path in a process shares one backend, so instances with different
 * namespaces can use one store.
 *
 * @example
 * ```typescript
 * import Keyv from "keyv";
 * import KeyvFs from "@keyv/fs";
 *
 * const keyv = new Keyv({ store: new KeyvFs("./cache/keyv.jsonl") });
 * await keyv.set("foo", "bar");
 * ```
 */
export class KeyvFs extends Hookified implements KeyvStorageAdapter {
	/** Declares the v6 absolute-`expires` storage contract via `capabilities.expires`. */
	public get capabilities() {
		return keyvStorageCapability(this);
	}

	private _namespace: string | undefined;
	private readonly _path: string;
	private readonly _strategy: KeyvFsStrategy;
	private readonly _writeDelay: number;
	private readonly _expiredCheckDelay: number;
	private readonly _registryKey: string;
	private readonly _backend: Strategy;
	private _disconnected = false;
	/** Operations called but still waiting for the store to load. */
	private readonly _handingOver = new Set<Promise<void>>();
	/** Writes called but not yet settled. */
	private readonly _inFlight = new Set<Promise<unknown>>();

	/**
	 * Creates a store. No file is touched until the first operation.
	 * @param path - The store path, or all the options.
	 * @param options - Options, when `path` is a string.
	 * @throws {TypeError} If an option is not valid.
	 * @throws {Error} If the path is already open in this process with a different strategy,
	 * `writeDelay`, or `expiredCheckDelay`.
	 */
	constructor(path: string | KeyvFsOptions, options?: Omit<KeyvFsOptions, "path">) {
		super({ throwOnEmptyListeners: false });
		const merged: Partial<KeyvFsOptions> =
			typeof path === "string" ? { ...options, path } : { ...path, ...options };

		if (typeof merged.path !== "string" || merged.path.length === 0) {
			throw new TypeError("@keyv/fs: `path` is required and must be a non-empty string.");
		}

		const strategy = merged.strategy ?? "file";
		if (strategy !== "file" && strategy !== "directory") {
			throw new TypeError('@keyv/fs: `strategy` must be "file" or "directory".');
		}

		this._strategy = strategy;
		this._writeDelay = validateDelay("writeDelay", merged.writeDelay, 0);
		this._expiredCheckDelay = validateDelay(
			"expiredCheckDelay",
			merged.expiredCheckDelay,
			DEFAULT_EXPIRED_CHECK_DELAY,
		);
		if (merged.namespace !== undefined && typeof merged.namespace !== "string") {
			throw new TypeError("@keyv/fs: `namespace` must be a string.");
		}

		this._namespace = merged.namespace;
		this._registryKey = registryKey(merged.path);
		this._path = this._registryKey;
		const fingerprint = JSON.stringify({
			strategy,
			writeDelay: this._writeDelay,
			expiredCheckDelay: this._expiredCheckDelay,
		});
		this._backend = attach(this._registryKey, fingerprint, (previousClose) =>
			strategy === "file"
				? new FileStrategy(this._path, this._writeDelay, this._expiredCheckDelay, previousClose)
				: new DirectoryStrategy(this._path, this._expiredCheckDelay, previousClose),
		);
	}

	/** The store's absolute path. */
	public get path(): string {
		return this._path;
	}

	/** How the store is laid out on disk. */
	public get strategy(): KeyvFsStrategy {
		return this._strategy;
	}

	/** Milliseconds a `"file"` store waits before saving, so more writes share a save. */
	public get writeDelay(): number {
		return this._writeDelay;
	}

	/** The least time, in milliseconds, between sweeps that remove expired entries. */
	public get expiredCheckDelay(): number {
		return this._expiredCheckDelay;
	}

	/** The namespace for this instance. `undefined` and `""` both mean no namespace. */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	public set namespace(namespace: string | undefined) {
		this._namespace = namespace;
	}

	/**
	 * Gets a value.
	 * @param key - The key.
	 * @returns The value, or `undefined` when the key is missing or expired.
	 */
	public async get<Value>(key: string): Promise<KeyvStorageGetResult<Value>> {
		return this.call(
			(backend, ns, reports) =>
				backend.get(ns, key, reports) as Promise<KeyvStorageGetResult<Value>>,
		);
	}

	/**
	 * Gets several values.
	 * @param keys - The keys.
	 * @returns The values in the order of `keys`, with `undefined` for missing or expired keys.
	 */
	public async getMany<Value>(
		keys: string[],
	): Promise<Array<KeyvStorageGetResult<Value | undefined>>> {
		return this.call(
			(backend, ns, reports) =>
				backend.getMany(ns, keys, reports) as Promise<
					Array<KeyvStorageGetResult<Value | undefined>>
				>,
		);
	}

	/**
	 * Stores a value. It resolves once the value is on disk.
	 * @param key - The key.
	 * @param value - The value: a string from Keyv's serializer, or any value Keyv's
	 * `jsonSerializer` can store when Keyv's serialization is off.
	 * @param expires - Absolute expiry in Unix ms, or `undefined` for none. An expiry that has
	 * already passed deletes the key.
	 * @returns `true`.
	 * @throws {TypeError} If the value can't be stored (a function, a symbol, or a circular value).
	 */
	public async set(key: string, value: unknown, expires?: number): Promise<boolean> {
		return this.call(async (backend, ns) => {
			await backend.set(ns, { key, value, expires });
			backend.sweepIfDue(this.reportInBackground);
			return true;
		}, true);
	}

	/**
	 * Stores several values. It resolves once they are all on disk.
	 * @param entries - The entries, each with an optional absolute `expires`.
	 * @returns `true` for each entry.
	 */
	public async setMany<Value>(entries: KeyvStorageEntry<Value>[]): Promise<boolean[]> {
		return this.call(async (backend, ns) => {
			await backend.setMany(ns, entries);
			backend.sweepIfDue(this.reportInBackground);
			return entries.map(() => true);
		}, true);
	}

	/**
	 * Deletes a key.
	 * @param key - The key.
	 * @returns Whether the key existed and had not expired.
	 */
	public async delete(key: string): Promise<boolean> {
		return this.call((backend, ns, reports) => backend.delete(ns, key, reports), true);
	}

	/**
	 * Deletes several keys.
	 * @param keys - The keys.
	 * @returns For each key, whether it existed and had not expired.
	 */
	public async deleteMany(keys: string[]): Promise<boolean[]> {
		return this.call((backend, ns, reports) => backend.deleteMany(ns, keys, reports), true);
	}

	/**
	 * Whether a key exists and has not expired.
	 * @param key - The key.
	 */
	public async has(key: string): Promise<boolean> {
		return this.call((backend, ns, reports) => backend.has(ns, key, reports));
	}

	/**
	 * Whether each key exists and has not expired.
	 * @param keys - The keys.
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		return this.call((backend, ns, reports) => backend.hasMany(ns, keys, reports));
	}

	/**
	 * Deletes every entry in the current namespace. With no namespace, it deletes only the
	 * entries that have no namespace.
	 */
	public async clear(): Promise<void> {
		return this.call((backend, ns) => backend.clear(ns), true);
	}

	/**
	 * Iterates over the current namespace's entries that have not expired.
	 * @returns An async generator of `[key, value]` pairs, with keys as they were set.
	 */
	public async *iterator<Value>(): AsyncGenerator<
		Array<string | Awaited<Value> | undefined>,
		void
	> {
		const ns = this.currentNamespace();
		const backend = await this.open();
		const reports: Reports = [];
		for await (const [key, value] of backend.entries(ns, reports)) {
			this.report(reports.splice(0));
			yield [key, value as Awaited<Value>];
		}

		this.report(reports);
	}

	/**
	 * Resolves once every write made so far through this instance is on disk. With
	 * `writeDelay`, it saves without waiting out the delay.
	 */
	public async flush(): Promise<void> {
		this.assertConnected();
		const errors = await this.settle();
		if (errors.length > 0) {
			throw errors[0];
		}
	}

	/**
	 * Removes expired entries from every namespace now, instead of waiting for the next sweep.
	 */
	public async clearExpired(): Promise<void> {
		this.assertConnected();
		if (this._backend.loaded) {
			await this._backend.clearExpired();
		}
	}

	/**
	 * Waits for this instance's operations, saves pending writes, and releases this instance.
	 * The last instance on a path closes the backend. Call it before the process exits so no
	 * write is lost. Later calls resolve; other methods reject.
	 */
	public async disconnect(): Promise<void> {
		if (this._disconnected) {
			return;
		}

		this._disconnected = true;
		const errors = await this.settle();
		// Released even when the flush failed, so the path can be opened again.
		try {
			await detach(this._registryKey, this._backend);
		} catch (error) {
			errors.push(error);
		}

		if (errors.length > 0) {
			throw errors[0];
		}
	}

	private currentNamespace(): Namespace {
		return this._namespace === "" ? undefined : this._namespace;
	}

	private assertConnected(): void {
		if (this._disconnected) {
			throw new Error(
				"@keyv/fs: this store was disconnected. Create a new KeyvFs to use the path again.",
			);
		}
	}

	/**
	 * Runs an operation on the backend once it has loaded, and emits what it reported. A write is
	 * tracked until it settles, so {@link KeyvFs.flush} and {@link KeyvFs.disconnect} cover writes
	 * already called. Operations reach the backend in call order: once the store has loaded, an
	 * operation starts synchronously, unless an earlier one is still waiting for the load.
	 * @param work - The operation. The backend applies changes synchronously, up to its first
	 * await, so a write is handed over as soon as `work` is called.
	 * @param write - Whether the operation changes data.
	 */
	private call<T>(
		work: (backend: Strategy, ns: Namespace, reports: Reports) => Promise<T>,
		write = false,
	): Promise<T> {
		let operation: Promise<T>;
		try {
			this.assertConnected();
			const ns = this.currentNamespace();
			operation =
				this._backend.loaded && this._handingOver.size === 0
					? this.perform(work, ns)
					: this.performAfterLoad(work, ns);
		} catch (error) {
			return Promise.reject(error);
		}

		if (write) {
			this._inFlight.add(operation);
			const forget = () => {
				this._inFlight.delete(operation);
			};
			operation.then(forget, forget);
		}

		return operation;
	}

	private async perform<T>(
		work: (backend: Strategy, ns: Namespace, reports: Reports) => Promise<T>,
		ns: Namespace,
	): Promise<T> {
		this.deliverNotice();
		const reports: Reports = [];
		const result = await work(this._backend, ns, reports);
		this.report(reports);
		return result;
	}

	private async performAfterLoad<T>(
		work: (backend: Strategy, ns: Namespace, reports: Reports) => Promise<T>,
		ns: Namespace,
	): Promise<T> {
		const handedOver = Promise.withResolvers<void>();
		this._handingOver.add(handedOver.promise);
		let pending: Promise<T>;
		try {
			await this.open();
			pending = this.perform(work, ns);
		} finally {
			handedOver.resolve();
			this._handingOver.delete(handedOver.promise);
		}

		return pending;
	}

	/**
	 * Waits until every operation already called has handed its work to the backend, saves,
	 * then waits for those operations to finish.
	 * @returns Errors from the save.
	 */
	private async settle(): Promise<unknown[]> {
		await Promise.allSettled([...this._handingOver]);
		const errors: unknown[] = [];
		try {
			await this._backend.flush();
		} catch (error) {
			errors.push(error);
		}

		await Promise.allSettled([...this._inFlight]);
		return errors;
	}

	/**
	 * Waits for the store to load, then reports any damaged data that loading set aside.
	 */
	private async open(): Promise<Strategy> {
		this.assertConnected();
		await this._backend.load();
		this.deliverNotice();
		return this._backend;
	}

	/**
	 * Emits the error left by loading damaged data, if any. It is taken before it is emitted, so
	 * it is delivered once even when emitting throws (Keyv rethrows an error that has no
	 * listener), and that one operation rejects.
	 */
	private deliverNotice(): void {
		const notice = this._backend.takeNotice();
		if (notice) {
			this.emit("error", notice);
		}
	}

	private report(reports: Reports): void {
		for (const error of reports) {
			this.emit("error", error);
		}
	}

	private readonly reportInBackground = (error: unknown): void => {
		try {
			this.emit("error", error);
		} catch {
			// Nothing is listening, and there is no caller to reject.
		}
	};
}

function validateDelay(name: string, value: unknown, fallback: number): number {
	if (value === undefined) {
		return fallback;
	}

	if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
		throw new TypeError(`@keyv/fs: \`${name}\` must be a number of milliseconds, 0 or more.`);
	}

	return name === "writeDelay" ? Math.min(value, MAX_TIMER_DELAY) : value;
}

/**
 * Creates a Keyv instance backed by {@link KeyvFs}.
 * @param path - The store path, or all the options.
 * @param options - Options, when `path` is a string.
 *
 * @example
 * ```typescript
 * const keyv = createKeyv("./cache/keyv.jsonl");
 * const users = createKeyv("./cache/users", { strategy: "directory", namespace: "users" });
 * ```
 */
export function createKeyv(
	path: string | KeyvFsOptions,
	options?: Omit<KeyvFsOptions, "path">,
): Keyv {
	return new Keyv({ store: new KeyvFs(path, options) });
}

export default KeyvFs;
