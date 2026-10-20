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
	fileHandles,
	fsOps,
	hasCode,
	KeyedMutex,
	mapLimit,
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
/** Temporary files older than this are left over from a crash and are removed at load. */
const STALE_TEMPORARY_MS = 15 * 60 * 1000;
const NAMESPACE_DIRECTORY = /^(?:_|n-[0-9a-f]{64})$/;
const SHARD_DIRECTORY = /^[0-9a-f]{2}$/;
const ENTRY_FILE = /^[0-9a-f]{64}\.kv$/;

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
		if (await this.checkMarker()) {
			// A new store. In an existing one the directories are already there, and writes and
			// clears make any that went missing.
			await fsOps.mkdir(this.dataDirectory, { recursive: true });
			await fsOps.mkdir(this.temporaryDirectory, { recursive: true });
			await fsOps.mkdir(this.trashDirectory, { recursive: true });
		}

		this.inBackground(this.purge());
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
			await fsOps.mkdir(this.trashDirectory, { recursive: true });
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

	protected async sweep(): Promise<void> {
		for (const namespace of await readdirOrEmpty(this.dataDirectory)) {
			if (!NAMESPACE_DIRECTORY.test(namespace)) {
				continue;
			}

			const directory = path.join(this.dataDirectory, namespace);
			for (const shard of await readdirOrEmpty(directory)) {
				if (!SHARD_DIRECTORY.test(shard)) {
					continue;
				}

				const shardDirectory = path.join(directory, shard);
				const names = (await readdirOrEmpty(shardDirectory)).filter((name) =>
					ENTRY_FILE.test(name),
				);
				await mapLimit(names, CONCURRENCY, async (name) => {
					const file = path.join(shardDirectory, name);
					if (isExpiredEntry(await readFirstLine(file))) {
						const release = await this._gate.shared();
						try {
							await this.removeIfExpired(file);
						} finally {
							release();
						}
					}
				});
			}
		}
	}

	public async flush(): Promise<void> {
		// Every write is on disk when it resolves.
	}

	protected async closeResources(): Promise<void> {
		await this._background;
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
					await fsOps.mkdir(shard, { recursive: true });
					this._shards.add(shard);
				}

				try {
					await renameWithRetry(temporary, file);
				} catch (error) {
					// A clear() moved the namespace directory away since the shard was made.
					if (!hasCode(error, "ENOENT")) {
						throw error;
					}

					await fsOps.mkdir(shard, { recursive: true });
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
		const write = () => fileHandles.run(() => fsOps.writeFile(temporary, content, { flag: "wx" }));
		try {
			await write();
		} catch (error) {
			if (!hasCode(error, "ENOENT")) {
				throw error;
			}

			await fsOps.mkdir(this.temporaryDirectory, { recursive: true });
			await write();
		}

		return temporary;
	}

	/**
	 * Deletes a key's entry.
	 * @returns Whether a live entry was deleted.
	 */
	private async remove(ns: Namespace, key: string): Promise<boolean> {
		const { file } = this.locate(ns, key);
		return this._mutex.run(file, async () => {
			const line = await readFirstLine(file);
			if (line === undefined) {
				return false;
			}

			const header = parseEntryHeader(line);
			await unlinkIfExists(file);
			return (
				header !== undefined &&
				header.key === key &&
				header.namespace === ns &&
				!isExpired(header.expires, Date.now())
			);
		});
	}

	/**
	 * Deletes a key's expired entry. A failure is reported rather than thrown: the read that
	 * found the entry already has its answer, and the next sweep tries again. It holds the gate
	 * shared, so a clear() never runs while the entry is moved aside.
	 */
	private async cleanUp(file: string, reports: Reports): Promise<void> {
		const release = await this._gate.shared();
		try {
			await this.removeIfExpired(file);
		} catch (error) {
			reports.push(error as Error);
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
	 * An entry left in `tmp/` by a crash is put back by {@link DirectoryStrategy.purge}.
	 */
	private async removeIfExpired(file: string): Promise<void> {
		await this._mutex.run(file, async () => {
			if (!isExpiredEntry(await readFirstLine(file))) {
				return;
			}

			const parked = path.join(this.temporaryDirectory, `${process.pid}-${randomHex(8)}.expired`);
			if (!(await this.park(file, parked))) {
				return;
			}

			let expired = false;
			try {
				expired = isExpiredEntry(await readFirstLine(parked));
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
				await fsOps.mkdir(this.temporaryDirectory, { recursive: true });
			}
		}
	}

	/**
	 * Puts a moved-aside entry back at its path, unless a newer write took the path meanwhile
	 * (EEXIST) or the namespace was cleared (ENOENT). On a file system without hard links (FAT,
	 * some network shares) it is moved back instead.
	 */
	private async restore(parked: string, file: string): Promise<void> {
		try {
			await fsOps.link(parked, file);
		} catch (error) {
			if (!hasCode(error, "EEXIST", "ENOENT", "ENOTDIR")) {
				await renameWithRetry(parked, file);
				return;
			}
		}

		await unlinkIfExists(parked);
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
		let text: string;
		try {
			text = await fileHandles.run(() => fsOps.readFile(file, "utf8"));
		} catch (error) {
			if (hasCode(error, "ENOENT", "ENOTDIR")) {
				return undefined;
			}

			throw error;
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
			await atomicWriteFile(marker, [encodeStoreHeader("directory")]);
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
	 * Removes what an earlier run left behind: temporary files from interrupted writes, and
	 * cleared namespaces that were not fully removed. Errors are ignored; the next load tries
	 * again.
	 */
	private async purge(): Promise<void> {
		const now = Date.now();
		for (const name of await readdirOrEmpty(this.temporaryDirectory)) {
			const file = path.join(this.temporaryDirectory, name);
			const stats = await fsOps.stat(file).catch(() => undefined);
			if (stats === undefined || now - stats.mtimeMs <= STALE_TEMPORARY_MS) {
				continue;
			}

			if (name.endsWith(".expired")) {
				// An entry being checked for expiry when a process crashed. If it can't be put back or
				// removed now, it stays for the next load.
				await this.recover(file).catch(() => {});
			} else {
				await fsOps.unlink(file).catch(() => {});
			}
		}

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
		const header = parseEntryHeader((await readFirstLine(parked)) ?? "");
		if (header === undefined || isExpired(header.expires, Date.now())) {
			await unlinkIfExists(parked);
			return;
		}

		const { file } = this.locate(header.namespace, header.key);
		await this._mutex.run(file, () => this.restore(parked, file));
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
 * Whether an entry file's header line says it has expired. A missing or damaged entry has not:
 * there is nothing to delete.
 * @param line - The header line, or `undefined` when the file doesn't exist.
 */
function isExpiredEntry(line: string | undefined): boolean {
	const header = parseEntryHeader(line ?? "");
	return header !== undefined && isExpired(header.expires, Date.now());
}
