import { hostname } from "node:os";
import path from "node:path";
import {
	decodeValue,
	type Entry,
	type EntryHeader,
	encodeEntry,
	encodeEntryFile,
	encodeStoreHeader,
	FORMAT_VERSION,
	hashName,
	isExpired,
	type Namespace,
	parseEntryHeader,
	parseStoreHeader,
} from "../codec.js";
import { KeyvFsCorruptionError, KeyvFsFormatError } from "../errors.js";
import {
	atomicWriteFile,
	decodeUtf8,
	fileHandles,
	fsOps,
	hasCode,
	KeyedMutex,
	mapLimit,
	PRIVATE_DIRECTORY_MODE,
	PRIVATE_FILE_MODE,
	RwGate,
	randomHex,
	readdirOrEmpty,
	readFirstLine,
	renameWithRetry,
	unlinkIfExists,
} from "../io.js";
import { type Reports, Strategy, type WriteEntry } from "./strategy.js";

/** File operations run at once by a batch or a sweep. */
const CONCURRENCY = 16;
/** Temporary files older than this are left over from a crash and are removed. */
const STALE_TEMPORARY_MS = 15 * 60 * 1000;
const NAMESPACE_DIRECTORY = /^(?:_|n-[0-9a-f]{64})$/;
const SHARD_DIRECTORY = /^[0-9a-f]{2}$/;
const ENTRY_FILE = /^[0-9a-f]{64}\.kv$/;
/** A lock file that can't be read after this long is from a stopped process: see inspectLock(). */
const STALE_LOCK_MS = 60 * 1000;
/** Tries to take a lock before the store gives up. */
const LOCK_ATTEMPTS = 3;
/** An entry being deleted: `<pid>-<time moved, ms>-<random>.deleting`. */
const DELETING_FILE = /^\d+-(\d+)-[0-9a-f]+\.deleting$/;
/** Create a directory for the owner only. */
const PRIVATE = { recursive: true, mode: PRIVATE_DIRECTORY_MODE } as const;

/** Where a key's entry lives. */
type Location = { shard: string; file: string };

/** A parsed entry file. */
type StoredEntry = { header: EntryHeader; payload: string };

/**
 * The `"directory"` strategy: one file per key, nothing in memory.
 *
 * ```
 * <path>/keyv-fs.json                      marker with the format version
 * <path>/data/_/<aa>/<sha256(key)>.kv      entries without a namespace
 * <path>/data/n-<sha256(ns)>/<aa>/<…>.kv   entries in namespace `ns`
 * <path>/tmp/                              files being written
 * <path>/trash/                            cleared namespaces being removed
 * ```
 *
 * An entry file is a JSON header line (key, namespace, expiry, value kind) followed by the
 * value. A write goes to `tmp/` and is renamed into place, so readers see the old entry or the
 * new one. Names are SHA-256 hex, so they are safe on every file system whatever the key.
 */
export class DirectoryStrategy extends Strategy {
	private readonly _mutex = new KeyedMutex();
	private readonly _gate = new RwGate();
	private readonly _shards = new Set<string>();
	private readonly _cleanUps = new Set<Promise<void>>();
	private _closing = false;
	/** Whether the file system has no hard links, so cleanup needs the lock (see takeLock()). */
	private _noHardLinks = false;
	/** The lock file and the record written to it, when this backend took it (see takeLock()). */
	private _lock: { file: string; record: string } | undefined;
	private _background: Promise<void> = Promise.resolve();

	private get dataDirectory(): string {
		return path.join(this.path, "data");
	}

	private get temporaryDirectory(): string {
		return path.join(this.path, "tmp");
	}

	private get trashDirectory(): string {
		return path.join(this.path, "trash");
	}

	protected async read(): Promise<void> {
		const created = await this.checkMarker();
		// Again after the first use of the path: a link put in place since the check before the
		// load would send all later operations elsewhere. From here on, the directories that were
		// missing are this user's, so no other user can change them.
		this.checkPath();
		if (created) {
			// A new store. In an existing one the directories are already there, and writes and
			// clears make any that went missing.
			await fsOps.mkdir(this.dataDirectory, PRIVATE);
			await fsOps.mkdir(this.temporaryDirectory, PRIVATE);
			await fsOps.mkdir(this.trashDirectory, PRIVATE);
		}

		this._noHardLinks = !(await this.hasHardLinks());
		if (this._noHardLinks) {
			await this.takeLock();
		}

		// Before the first operation, so it sees any entry this puts back.
		await this.purge();
	}

	public async get(ns: Namespace, key: string, reports: Reports): Promise<unknown> {
		const stored = await this.readEntry(ns, key, reports);
		if (stored === undefined) {
			return undefined;
		}

		if (isExpired(stored.header.expires, Date.now())) {
			await this.cleanUp(this.locate(ns, key).file, reports);
			return undefined;
		}

		return this.decode(stored, reports);
	}

	public async getMany(ns: Namespace, keys: string[], reports: Reports): Promise<unknown[]> {
		return mapLimit(keys, CONCURRENCY, (key) => this.get(ns, key, reports));
	}

	public async has(ns: Namespace, key: string, reports: Reports): Promise<boolean> {
		const { file } = this.locate(ns, key);
		const header = await this.readHeader(file, ns, key, reports);
		if (header === undefined) {
			return false;
		}

		if (isExpired(header.expires, Date.now())) {
			await this.cleanUp(file, reports);
			return false;
		}

		return true;
	}

	public async hasMany(ns: Namespace, keys: string[], reports: Reports): Promise<boolean[]> {
		return mapLimit(keys, CONCURRENCY, (key) => this.has(ns, key, reports));
	}

	public set(ns: Namespace, entry: WriteEntry): Promise<void> {
		return this.setMany(ns, [entry]);
	}

	public async setMany(ns: Namespace, entries: WriteEntry[]): Promise<void> {
		// Encode everything first, so a value that can't be stored changes nothing. Then take a
		// place in line before the first await, so a clear() called later runs after these writes.
		const encoded = entries.map(({ key, value, expires }) => ({
			key,
			entry: encodeEntry(value, expires),
		}));
		const release = await this._gate.shared();
		try {
			await mapLimit(encoded, CONCURRENCY, ({ key, entry }) => this.write(ns, key, entry));
		} finally {
			release();
		}
	}

	public async delete(ns: Namespace, key: string): Promise<boolean> {
		const [deleted] = await this.deleteMany(ns, [key]);
		return deleted;
	}

	public async deleteMany(ns: Namespace, keys: string[]): Promise<boolean[]> {
		const release = await this._gate.shared();
		try {
			return await mapLimit(keys, CONCURRENCY, (key) => this.remove(ns, key));
		} finally {
			release();
		}
	}

	public async clear(ns: Namespace): Promise<void> {
		const source = this.namespaceDirectory(ns);
		const release = await this._gate.exclusive();
		let moved: string | undefined;
		try {
			await fsOps.mkdir(this.trashDirectory, PRIVATE);
			const target = path.join(
				this.trashDirectory,
				`${path.basename(source)}-${Date.now()}-${randomHex(4)}`,
			);
			try {
				await renameWithRetry(source, target);
				moved = target;
			} catch (error) {
				if (!hasCode(error, "ENOENT")) {
					throw error;
				}
			}

			for (const shard of this._shards) {
				if (path.dirname(shard) === source) {
					this._shards.delete(shard);
				}
			}
		} finally {
			release();
		}

		if (moved !== undefined) {
			const trash = moved;
			this.inBackground(fsOps.rm(trash, { recursive: true, force: true }));
		}
	}

	public async *entries(ns: Namespace, reports: Reports): AsyncGenerator<[string, unknown]> {
		const directory = this.namespaceDirectory(ns);
		for (const shard of await readdirOrEmpty(directory)) {
			if (!SHARD_DIRECTORY.test(shard)) {
				continue;
			}

			const shardDirectory = path.join(directory, shard);
			for (const name of await readdirOrEmpty(shardDirectory)) {
				if (!ENTRY_FILE.test(name)) {
					continue;
				}

				const file = path.join(shardDirectory, name);
				const stored = await this.readFile(file, reports);
				if (stored === undefined || !this.belongsHere(stored.header, ns, name, file, reports)) {
					continue;
				}

				if (isExpired(stored.header.expires, Date.now())) {
					await this.cleanUp(file, reports);
					continue;
				}

				const value = this.decode(stored, reports);
				if (value !== undefined || stored.header.kind === "u") {
					yield [stored.header.key, value];
				}
			}
		}
	}

	/**
	 * Removes expired entries in every namespace. A damaged entry is kept, and goes to `reports`.
	 * A directory or entry that can't be read doesn't stop the rest: the sweep goes on, then
	 * rejects with the first error.
	 */
	protected async sweep(reports: Reports): Promise<void> {
		if (this._noHardLinks && !(await this.holdsLock())) {
			// The process that held the lock can be stopped now: take over its cleanup.
			await this.takeLock();
		}

		await this.purge();
		const errors: unknown[] = [];
		const list = (directory: string) =>
			readdirOrEmpty(directory).catch((error: unknown) => {
				errors.push(error);
				return [];
			});
		for (const namespace of await readdirOrEmpty(this.dataDirectory)) {
			if (!NAMESPACE_DIRECTORY.test(namespace)) {
				continue;
			}

			const directory = path.join(this.dataDirectory, namespace);
			for (const shard of await list(directory)) {
				if (!SHARD_DIRECTORY.test(shard)) {
					continue;
				}

				const shardDirectory = path.join(directory, shard);
				const names = (await list(shardDirectory)).filter((name) => ENTRY_FILE.test(name));
				await mapLimit(names, CONCURRENCY, async (name) => {
					const file = path.join(shardDirectory, name);
					try {
						const line = await readFirstLine(file);
						if (line === undefined) {
							return;
						}

						const header = parseEntryHeader(line);
						if (
							header === undefined ||
							`${hashName(header.key)}.kv` !== name ||
							this.namespaceDirectory(header.namespace) !== directory
						) {
							reports.push(this.corruption(file, "its header is not valid"));
						} else if (isExpired(header.expires, Date.now())) {
							await this.withGate(() => this.removeIfExpired(file, reports));
						}
					} catch (error) {
						errors.push(error);
					}
				});
			}
		}

		if (errors.length > 0) {
			throw errors[0];
		}
	}

	public async flush(): Promise<void> {
		// Every write is on disk when it resolves.
	}

	protected async closeResources(): Promise<void> {
		// A read still running may be about to remove an expired entry. One that has started is
		// finished first; one that hasn't is skipped, and a later sweep removes the entry.
		this._closing = true;
		await Promise.all(this._cleanUps);
		await this._background;
		// Only a lock that still holds this backend's record. Another process can hold it now.
		if (this._lock !== undefined && (await this.holdsLock())) {
			await unlinkIfExists(this._lock.file);
		}

		this._lock = undefined;
	}

	/**
	 * Writes a key's entry: to a temporary file first, then renamed into place.
	 */
	private async write(ns: Namespace, key: string, entry: Entry): Promise<void> {
		const { shard, file } = this.locate(ns, key);
		await this._mutex.run(file, async () => {
			if (isExpired(entry.expires, Date.now())) {
				// Writing an expired entry deletes the key.
				await unlinkIfExists(file);
				return;
			}

			const temporary = await this.writeTemporary(encodeEntryFile(ns, key, entry));
			try {
				if (!this._shards.has(shard)) {
					await fsOps.mkdir(shard, PRIVATE);
					this._shards.add(shard);
				}

				try {
					await renameWithRetry(temporary, file);
				} catch (error) {
					// A clear() moved the namespace directory away since the shard was made.
					if (!hasCode(error, "ENOENT")) {
						throw error;
					}

					await fsOps.mkdir(shard, PRIVATE);
					await renameWithRetry(temporary, file);
				}
			} catch (error) {
				await fsOps.unlink(temporary).catch(() => {});
				throw error;
			}
		});
	}

	private async writeTemporary(content: string): Promise<string> {
		const temporary = path.join(this.temporaryDirectory, `${process.pid}-${randomHex(8)}.tmp`);
		const write = () =>
			fileHandles.run(() =>
				fsOps.writeFile(temporary, content, { flag: "wx", mode: PRIVATE_FILE_MODE }),
			);
		try {
			await write();
		} catch (error) {
			if (!hasCode(error, "ENOENT")) {
				throw error;
			}

			await fsOps.mkdir(this.temporaryDirectory, PRIVATE);
			await write();
		}

		return temporary;
	}

	/**
	 * Deletes a key's entry. The entry is moved into `tmp/` first, and read and deleted there. So
	 * the entry that this reads is the entry that it deletes: a write from another process that
	 * comes after the move is kept.
	 * @returns Whether a live entry was deleted.
	 */
	private async remove(ns: Namespace, key: string): Promise<boolean> {
		const { file } = this.locate(ns, key);
		return this._mutex.run(file, async () => {
			const parked = path.join(
				this.temporaryDirectory,
				`${process.pid}-${Date.now()}-${randomHex(8)}.deleting`,
			);
			if (!(await this.park(file, parked))) {
				return false;
			}

			try {
				const header = await readHeaderLine(parked);
				return (
					header !== undefined &&
					header.key === key &&
					header.namespace === ns &&
					!isExpired(header.expires, Date.now())
				);
			} finally {
				await unlinkIfExists(parked);
			}
		});
	}

	/**
	 * Deletes an expired entry a read found. A failure is reported rather than thrown: the read
	 * already has its answer, and the next sweep tries again. Closing waits for cleanups that
	 * have started.
	 */
	private cleanUp(file: string, reports: Reports): Promise<void> {
		if (this._closing) {
			return Promise.resolve();
		}

		const cleaning = this.withGate(() => this.removeIfExpired(file, reports)).catch(
			(error: unknown) => {
				reports.push(error as Error);
			},
		);
		this._cleanUps.add(cleaning);
		void cleaning.then(() => this._cleanUps.delete(cleaning));
		return cleaning;
	}

	/**
	 * Runs work that may move an entry aside while holding the gate shared, so a clear() never
	 * runs in the middle of it.
	 */
	private async withGate(work: () => Promise<void>): Promise<void> {
		const release = await this._gate.shared();
		try {
			await work();
		} finally {
			release();
		}
	}

	/**
	 * Deletes a key's entry if it is still expired, without ever deleting a newer write.
	 *
	 * The check runs under the key's lock, so no write from this process can land in between.
	 * Another process can, though: it may replace the entry between the check and the delete. So
	 * the entry is first moved into `tmp/`, where nothing else looks, and checked there. An
	 * expired entry is deleted. Anything else is put back: a newer write is linked back into
	 * place (unless an even newer one already took it), and so is an entry whose check failed.
	 * An entry left in `tmp/` by a crash is put back by {@link DirectoryStrategy.purge}, at the
	 * next load or sweep of any process. Recovering an entry that a running process is still
	 * checking is safe too: whichever of them puts it back or removes it first wins, and the
	 * other finds it gone. A damaged entry is kept, and goes to `reports`.
	 */
	private async removeIfExpired(file: string, reports: Reports): Promise<void> {
		await this._mutex.run(file, async () => {
			// Without hard links, only the lock holder can put a newer write back (see restore()),
			// so only it moves entries aside. Reads in other processes still hide expired entries.
			if (this._noHardLinks && !(await this.holdsLock())) {
				return;
			}

			const line = await readFirstLine(file);
			const header = parseEntryHeader(line ?? "");
			if (line !== undefined && header === undefined) {
				reports.push(this.corruption(file, "its header is not valid"));
			}

			if (header === undefined || !isExpired(header.expires, Date.now())) {
				return;
			}

			const parked = path.join(this.temporaryDirectory, `${process.pid}-${randomHex(8)}.expired`);
			if (!(await this.park(file, parked))) {
				return;
			}

			let expired = false;
			try {
				const header = await readHeaderLine(parked);
				expired = header !== undefined && isExpired(header.expires, Date.now());
			} finally {
				if (expired) {
					await unlinkIfExists(parked);
				} else {
					await this.restore(parked, file);
				}
			}
		});
	}

	/**
	 * Moves an entry into `tmp/`, making `tmp/` again if it went missing.
	 * @returns Whether the entry was there to move.
	 */
	private async park(file: string, parked: string): Promise<boolean> {
		for (let attempt = 1; ; attempt++) {
			try {
				await renameWithRetry(file, parked);
				return true;
			} catch (error) {
				if (!hasCode(error, "ENOENT", "ENOTDIR")) {
					throw error;
				}

				if (attempt > 1) {
					return false;
				}

				// Either the entry is gone or tmp/ is: make tmp/ and try once more.
				await fsOps.mkdir(this.temporaryDirectory, PRIVATE);
			}
		}
	}

	/**
	 * Puts a moved-aside entry back at its path, unless a newer write took the path meanwhile
	 * (EEXIST) or the namespace was cleared (ENOENT).
	 *
	 * On a file system without hard links (FAT, some network shares), the entry is moved back
	 * instead, if no newer write took the path. A move replaces a write that comes between the
	 * check and the move, so only the process that holds the lock (see lock()) moves an entry
	 * back, and it checks the lock first. Any other process leaves the entry in `tmp/`, and the
	 * holder puts it back at its next load or sweep.
	 * @throws The error from `link`, when the entry can't be put back now.
	 */
	private async restore(parked: string, file: string): Promise<void> {
		try {
			await fsOps.link(parked, file);
		} catch (error) {
			if (!hasCode(error, "EEXIST", "ENOENT", "ENOTDIR")) {
				if (!(await this.holdsLock())) {
					throw error;
				}

				if (!(await exists(file))) {
					try {
						await renameWithRetry(parked, file);
						return;
					} catch (renameError) {
						if (!hasCode(renameError, "ENOENT", "ENOTDIR")) {
							throw renameError;
						}
					}
				}
			}
		}

		await unlinkIfExists(parked);
	}

	/**
	 * Whether this backend holds the lock: the lock file holds the record that it wrote. A full
	 * record of a running process is never stale, so no other process can take the lock away while
	 * it works. Only a claim that moves the lock in the moment after it was written, or a person
	 * who deletes the file, can.
	 */
	private async holdsLock(): Promise<boolean> {
		if (this._lock === undefined) {
			return false;
		}

		const record = await fsOps.readFile(this._lock.file, "utf8").catch(() => undefined);
		return record === this._lock.record;
	}

	private async readEntry(
		ns: Namespace,
		key: string,
		reports: Reports,
	): Promise<StoredEntry | undefined> {
		const { file } = this.locate(ns, key);
		const stored = await this.readFile(file, reports);
		if (stored === undefined) {
			return undefined;
		}

		if (stored.header.key !== key || stored.header.namespace !== ns) {
			reports.push(this.corruption(file, "it belongs to a different key"));
			return undefined;
		}

		return stored;
	}

	private async readFile(file: string, reports: Reports): Promise<StoredEntry | undefined> {
		let bytes: Buffer;
		try {
			bytes = await fileHandles.run(() => fsOps.readFile(file));
		} catch (error) {
			if (hasCode(error, "ENOENT", "ENOTDIR")) {
				return undefined;
			}

			throw error;
		}

		const text = decodeUtf8(bytes);
		if (text === undefined) {
			reports.push(this.corruption(file, "it is not valid UTF-8"));
			return undefined;
		}

		const newline = text.indexOf("\n");
		const header = newline === -1 ? undefined : parseEntryHeader(text.slice(0, newline));
		if (header === undefined) {
			reports.push(this.corruption(file, "its header is not valid"));
			return undefined;
		}

		return { header, payload: text.slice(newline + 1) };
	}

	private async readHeader(
		file: string,
		ns: Namespace,
		key: string,
		reports: Reports,
	): Promise<EntryHeader | undefined> {
		const line = await readFirstLine(file);
		if (line === undefined) {
			return undefined;
		}

		const header = parseEntryHeader(line);
		if (header === undefined || header.key !== key || header.namespace !== ns) {
			reports.push(this.corruption(file, "its header is not valid"));
			return undefined;
		}

		return header;
	}

	private decode(stored: StoredEntry, reports: Reports): unknown {
		try {
			return decodeValue(stored.header.kind, stored.payload);
		} catch {
			reports.push(
				this.corruption(
					this.locate(stored.header.namespace, stored.header.key).file,
					"its value is not valid",
				),
			);
			return undefined;
		}
	}

	/**
	 * Whether an entry file found while iterating is where its header says it should be.
	 */
	private belongsHere(
		header: EntryHeader,
		ns: Namespace,
		name: string,
		file: string,
		reports: Reports,
	): boolean {
		if (header.namespace === ns && `${hashName(header.key)}.kv` === name) {
			return true;
		}

		reports.push(this.corruption(file, "it belongs to a different key"));
		return false;
	}

	private corruption(file: string, reason: string): KeyvFsCorruptionError {
		return new KeyvFsCorruptionError(
			file,
			`@keyv/fs: the entry ${file} is damaged (${reason}). It is treated as missing; the next write of its key replaces it.`,
		);
	}

	private namespaceDirectory(ns: Namespace): string {
		return path.join(this.dataDirectory, ns === undefined ? "_" : `n-${hashName(ns)}`);
	}

	private locate(ns: Namespace, key: string): Location {
		const hash = hashName(key);
		const shard = path.join(this.namespaceDirectory(ns), hash.slice(0, 2));
		return { shard, file: path.join(shard, `${hash}.kv`) };
	}

	/**
	 * Checks the marker file that identifies the directory as a store, creating it (and the
	 * directory) for a new store.
	 * @returns Whether the marker was created.
	 * @throws {KeyvFsFormatError} If the marker belongs to something else or a newer version.
	 */
	private async checkMarker(): Promise<boolean> {
		const marker = path.join(this.path, "keyv-fs.json");
		let text: string | undefined;
		try {
			text = await fsOps.readFile(marker, "utf8");
		} catch (error) {
			if (!hasCode(error, "ENOENT")) {
				throw error;
			}
		}

		// Written atomically, so no one ever reads half a marker. Processes creating it at the same
		// moment write the same bytes. An empty marker can only be left by an older write that
		// was cut short, so it is written again.
		if (text === undefined || text.trim() === "") {
			await atomicWriteFile(marker, [encodeStoreHeader("directory")], undefined, () =>
				this.checkPath(),
			);
			return true;
		}

		const header = parseStoreHeader(text.trim());
		if (header === undefined || header.kind !== "directory") {
			throw new KeyvFsFormatError(
				marker,
				`@keyv/fs: ${marker} is not a @keyv/fs directory marker, so ${this.path} was left untouched.`,
			);
		}

		if (header.version > FORMAT_VERSION) {
			throw new KeyvFsFormatError(
				marker,
				`@keyv/fs: ${this.path} was written by a newer version of @keyv/fs (format version ${header.version}). Upgrade @keyv/fs to read it.`,
			);
		}

		return false;
	}

	/**
	 * Whether the file system of the store can make hard links. Expiry cleanup uses a hard link to
	 * put an entry back without a risk to replace a newer write from another process.
	 */
	private async hasHardLinks(): Promise<boolean> {
		const probe = await this.writeTemporary("");
		const linked = `${probe}.link`;
		try {
			await fsOps.link(probe, linked);
			return true;
		} catch {
			return false;
		} finally {
			await fsOps.unlink(linked).catch(() => {});
			await fsOps.unlink(probe).catch(() => {});
		}
	}

	/**
	 * Tries to take the lock file of the store, `keyv-fs.lock`, for this process. Without hard
	 * links, only the process that holds the lock removes expired entries and puts entries back
	 * (see removeIfExpired() and restore()). Other processes use the store too, but leave that
	 * work to the holder. This process takes over a lock that a stopped process on this computer
	 * left, at load and at each sweep.
	 * @returns Whether this process holds the lock now.
	 */
	private async takeLock(): Promise<boolean> {
		const lock = path.join(this.path, "keyv-fs.lock");
		// The token makes the record unique, so this process can tell its own record from another.
		const record = JSON.stringify({ pid: process.pid, host: hostname(), token: randomHex(8) });
		for (let attempt = 1; attempt <= LOCK_ATTEMPTS; attempt++) {
			try {
				await fsOps.writeFile(lock, record, { flag: "wx", mode: PRIVATE_FILE_MODE });
				this._lock = { file: lock, record };
				// If this process stopped for a long time before it wrote the record, another process
				// can take over the lock. Then holdsLock() finds the record of that process.
				return await this.holdsLock();
			} catch (error) {
				if (!hasCode(error, "EEXIST")) {
					throw error;
				}
			}

			const found = await inspectLock(lock);
			if (found.state === "held") {
				return false;
			}

			if (found.state === "stale" && !(await this.claimStaleLock(lock, found.record))) {
				return false;
			}
		}

		return false;
	}

	/**
	 * Removes a lock that a stopped process left. The lock is first moved into `tmp/`, so only one
	 * process can claim it. Then its record is compared with the record that was read. If another
	 * process took the lock in between, this process does not take the lock. It does not put that
	 * lock back either: no rename can refuse to replace a lock that a third process makes
	 * meanwhile. The process whose lock was moved no longer holds the lock, so it stops its
	 * cleanup, and a process takes the free lock at its next sweep.
	 * @param lock - The lock file.
	 * @param record - The stale record that was read from it.
	 * @returns Whether the stale lock is gone, so this process can try to take the lock.
	 */
	private async claimStaleLock(lock: string, record: string): Promise<boolean> {
		const claimed = path.join(this.temporaryDirectory, `${process.pid}-${randomHex(8)}.lock`);
		try {
			await renameWithRetry(lock, claimed);
		} catch (error) {
			if (hasCode(error, "ENOENT")) {
				// Another process claimed it first.
				return true;
			}

			throw error;
		}

		if ((await fsOps.readFile(claimed, "utf8")) === record) {
			await unlinkIfExists(claimed);
			return true;
		}

		// The moved lock stays in tmp/; a later load or sweep removes it.
		return false;
	}

	/**
	 * Cleans up after interrupted work, by this process or another one: puts back entries that
	 * were being checked for expiry, removes temporary files from interrupted writes, and, in the
	 * background, removes cleared namespaces left in the trash. Runs at load and before each
	 * sweep. Errors are ignored; the next run tries again.
	 */
	private async purge(): Promise<void> {
		const now = Date.now();
		const names = await readdirOrEmpty(this.temporaryDirectory).catch(() => []);
		for (const name of names) {
			const file = path.join(this.temporaryDirectory, name);
			if (name.endsWith(".expired")) {
				// Whatever its age: its file time is when the entry was written, not when it was
				// moved here. If it can't be put back or removed now, it stays for the next run.
				await this.recover(file).catch(() => {});
				continue;
			}

			const deleting = DELETING_FILE.exec(name);
			if (deleting !== null) {
				// A delete that a process did not finish. Its name holds the time of the move, so a
				// delete that is still running is not touched.
				if (now - Number(deleting[1]) > STALE_TEMPORARY_MS) {
					await fsOps.unlink(file).catch(() => {});
				}

				continue;
			}

			// A write in progress elsewhere renames its file within moments.
			const stats = await fsOps.stat(file).catch(() => undefined);
			if (stats !== undefined && now - stats.mtimeMs > STALE_TEMPORARY_MS) {
				await fsOps.unlink(file).catch(() => {});
			}
		}

		this.inBackground(this.emptyTrash());
	}

	private async emptyTrash(): Promise<void> {
		for (const name of await readdirOrEmpty(this.trashDirectory)) {
			await fsOps
				.rm(path.join(this.trashDirectory, name), { recursive: true, force: true })
				.catch(() => {});
		}
	}

	/**
	 * Puts an entry left in `tmp/` back where it belongs, if it hasn't expired and its key has no
	 * newer entry. An expired or damaged one is removed.
	 */
	private async recover(parked: string): Promise<void> {
		const header = await readHeaderLine(parked);
		if (header === undefined || isExpired(header.expires, Date.now())) {
			await unlinkIfExists(parked);
			return;
		}

		const { file } = this.locate(header.namespace, header.key);
		await this.withGate(() => this._mutex.run(file, () => this.restore(parked, file)));
	}

	private inBackground(work: Promise<unknown>): void {
		const settled = work.then(
			() => {},
			() => {},
		);
		this._background = this._background.then(() => settled);
	}
}

/**
 * Reads the header of an entry file.
 * @param file - The entry file.
 * @returns The header, or `undefined` when the file is missing or its header is damaged.
 */
async function readHeaderLine(file: string): Promise<EntryHeader | undefined> {
	const line = await readFirstLine(file);
	return line === undefined ? undefined : parseEntryHeader(line);
}

/** The process that holds the lock file of a store. */
type LockOwner = { pid: number; host: string };

/** What a lock file shows: a holder, a lock that a stopped process left, or no lock. */
type LockState = { state: "held" } | { state: "stale"; record: string } | { state: "gone" };

/**
 * Examines a lock file that already exists.
 *
 * A record that can't be read is from a process that is still writing it, or from a process
 * that stopped while it wrote it. Only age tells them apart, so it is stale only after
 * {@link STALE_LOCK_MS}. A record that can be read is stale when its process is not running.
 * @param lock - The lock file.
 */
async function inspectLock(lock: string): Promise<LockState> {
	let record: string;
	let modified: number;
	try {
		record = await fsOps.readFile(lock, "utf8");
		modified = (await fsOps.stat(lock)).mtimeMs;
	} catch (error) {
		if (hasCode(error, "ENOENT")) {
			return { state: "gone" };
		}

		throw error;
	}

	const owner = parseLockOwner(record);
	if (owner === undefined) {
		return Date.now() - modified > STALE_LOCK_MS ? { state: "stale", record } : { state: "held" };
	}

	return isRunning(owner) ? { state: "held" } : { state: "stale", record };
}

/**
 * Reads the owner from the record of a lock file.
 * @param record - The text of the lock file.
 * @returns The owner, or `undefined` when the record is incomplete or damaged.
 */
function parseLockOwner(record: string): LockOwner | undefined {
	try {
		const owner = JSON.parse(record) as Partial<LockOwner> | null;
		if (typeof owner?.pid === "number" && typeof owner.host === "string") {
			return { pid: owner.pid, host: owner.host };
		}
	} catch {}

	return undefined;
}

/**
 * Whether the process that holds a lock still runs. A process on another computer can't be
 * checked, so it counts as running.
 * @param owner - The holder of the lock.
 */
function isRunning(owner: LockOwner): boolean {
	if (owner.host !== hostname()) {
		return true;
	}

	try {
		process.kill(owner.pid, 0);
		return true;
	} catch (error) {
		// EPERM: the process runs as another user.
		return !hasCode(error, "ESRCH");
	}
}

/**
 * Whether a file exists. A path through a missing directory doesn't.
 * @param file - The file.
 */
async function exists(file: string): Promise<boolean> {
	try {
		await fsOps.stat(file);
		return true;
	} catch (error) {
		if (hasCode(error, "ENOENT", "ENOTDIR")) {
			return false;
		}

		throw error;
	}
}
