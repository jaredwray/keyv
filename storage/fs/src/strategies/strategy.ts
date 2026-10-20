import type { Namespace } from "../codec.js";

/**
 * An entry to write: the key, the value Keyv passed, and its absolute expiry.
 */
export type WriteEntry = { key: string; value: unknown; expires?: number };

/**
 * Errors found during an operation that did not fail it, such as a damaged directory entry that
 * was treated as missing. The adapter emits them once the operation is done.
 */
export type Reports = Error[];

/**
 * Called with an error from work that runs after its operation returned, such as an expiry
 * sweep.
 */
export type BackgroundReporter = (error: unknown) => void;

/**
 * The storage behind every {@link KeyvFs} on one path. Instances on the same path share it through
 * the registry. It loads lazily: every operation awaits {@link Strategy.load} first.
 */
export abstract class Strategy {
	/** The store file or directory. */
	public readonly path: string;
	/** Milliseconds between expiry sweeps. */
	protected readonly expiredCheckDelay: number;
	/** When entries were last swept for expiry. Set at load, so the first write doesn't sweep. */
	protected lastSweep = 0;
	private _loading: Promise<void> | undefined;
	private _loaded = false;
	private _notice: Error | undefined;
	private _sweeping: Promise<void> | undefined;
	private readonly _previousClose: Promise<void> | undefined;

	/**
	 * @param path - The store file or directory.
	 * @param expiredCheckDelay - Milliseconds between expiry sweeps.
	 * @param previousClose - The close of an earlier backend on this path, which loading waits for.
	 */
	constructor(path: string, expiredCheckDelay: number, previousClose?: Promise<void>) {
		this.path = path;
		this.expiredCheckDelay = expiredCheckDelay;
		this._previousClose = previousClose;
	}

	/** Whether the store has been loaded. */
	public get loaded(): boolean {
		return this._loaded;
	}

	/**
	 * Loads the store once. Concurrent calls share one load. A failed load is not remembered, so
	 * the next call tries again. Damaged data does not fail the load: it is set aside, and the
	 * error is kept for {@link Strategy.takeNotice}.
	 */
	public load(): Promise<void> {
		if (this._loaded) {
			return Promise.resolve();
		}

		this._loading ??= this.loadOnce().then(
			() => {
				this._loaded = true;
				this.lastSweep = Date.now();
			},
			(error: unknown) => {
				this._loading = undefined;
				throw error;
			},
		);
		return this._loading;
	}

	/**
	 * Takes the error left by loading damaged data, if any. Each error is returned once.
	 */
	public takeNotice(): Error | undefined {
		const notice = this._notice;
		this._notice = undefined;
		return notice;
	}

	/**
	 * Saves pending writes and releases resources. The close of an earlier backend on the path
	 * and a load in progress are awaited first.
	 */
	public async close(): Promise<void> {
		// Closes on one path run in order, so a backend that never loaded can't let a later one
		// open the file while an earlier one is still saving to it.
		await this._previousClose?.catch(() => {});
		await this._loading?.catch(() => {});
		if (this._loaded) {
			// A running sweep may be waiting for a save; save now instead of after writeDelay.
			await this.flush().catch(() => {});
		}

		await this._sweeping;
		if (this._loaded) {
			await this.flush();
		}

		await this.closeResources();
	}

	/**
	 * Removes expired entries now.
	 */
	public async clearExpired(): Promise<void> {
		this.lastSweep = Date.now();
		await this.sweep();
	}

	/**
	 * Starts an expiry sweep in the background when `expiredCheckDelay` has passed since the last
	 * one and none is running. Called after writes. The sweep never rejects: its error goes to
	 * `report`.
	 * @param report - Receives an error from the sweep.
	 */
	public sweepIfDue(report: BackgroundReporter): void {
		if (this._sweeping || Date.now() - this.lastSweep < this.expiredCheckDelay) {
			return;
		}

		this._sweeping = this.clearExpired()
			.catch((error: unknown) => {
				try {
					report(error);
				} catch {}
			})
			.finally(() => {
				this._sweeping = undefined;
			});
	}

	/**
	 * Keeps an error from loading for the next operation to report.
	 * @param notice - The error.
	 */
	protected setNotice(notice: Error): void {
		this._notice = notice;
	}

	private async loadOnce(): Promise<void> {
		await this._previousClose?.catch(() => {});
		await this.read();
	}

	/** Reads the store from disk. Called once per successful load. */
	protected abstract read(): Promise<void>;

	/** Removes expired entries. */
	protected abstract sweep(): Promise<void>;

	/** Resolves once every write made so far is on disk. */
	public abstract flush(): Promise<void>;

	/** Releases resources after the final flush. */
	protected abstract closeResources(): Promise<void>;

	public abstract get(ns: Namespace, key: string, reports: Reports): Promise<unknown>;
	public abstract getMany(ns: Namespace, keys: string[], reports: Reports): Promise<unknown[]>;
	public abstract has(ns: Namespace, key: string, reports: Reports): Promise<boolean>;
	public abstract hasMany(ns: Namespace, keys: string[], reports: Reports): Promise<boolean[]>;
	public abstract set(ns: Namespace, entry: WriteEntry): Promise<void>;
	public abstract setMany(ns: Namespace, entries: WriteEntry[]): Promise<void>;
	public abstract delete(ns: Namespace, key: string, reports: Reports): Promise<boolean>;
	public abstract deleteMany(ns: Namespace, keys: string[], reports: Reports): Promise<boolean[]>;
	public abstract clear(ns: Namespace): Promise<void>;
	public abstract entries(ns: Namespace, reports: Reports): AsyncGenerator<[string, unknown]>;
}
