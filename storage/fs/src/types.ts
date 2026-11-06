/**
 * How {@link KeyvFs} lays the store out on disk.
 * - `"file"` keeps the whole store in one file, loaded into memory. Writes rewrite the file.
 * - `"directory"` keeps one file per key under a directory, and nothing in memory.
 */
export type KeyvFsStrategy = "file" | "directory";

/**
 * Options for {@link KeyvFs}.
 */
export type KeyvFsOptions = {
	/**
	 * Where the store lives. With the `"file"` strategy this is the file (for example
	 * `./cache/keyv.jsonl`); with `"directory"` it is the directory (for example `./cache/keyv`).
	 * Parent directories are created on the first write.
	 */
	path: string;
	/**
	 * How the store is laid out on disk.
	 * @default "file"
	 */
	strategy?: KeyvFsStrategy;
	/**
	 * The namespace for this instance. Namespaces are stored apart from the key, so they never
	 * overlap, and `clear()` only removes the current namespace's entries.
	 */
	namespace?: string;
	/**
	 * `"file"` strategy only: how long, in milliseconds, to wait before saving so more writes can
	 * share one save. Writes made in the same tick always share a save. A write resolves once its
	 * data is in the file, so a higher value makes each awaited write slower.
	 * @default 0
	 */
	writeDelay?: number;
	/**
	 * The least time, in milliseconds, between sweeps that remove expired entries. A sweep runs
	 * after a write once this much time has passed since the store was loaded or last swept.
	 * Expired entries are never returned, whether or not a sweep has removed them.
	 * @default 86400000 (24 hours)
	 */
	expiredCheckDelay?: number;
};
