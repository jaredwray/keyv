import path from "node:path";
import {
	decodeValue,
	type Entry,
	encodeCheckpoint,
	encodeEntry,
	encodeFileRecord,
	encodeStoreHeader,
	FORMAT_VERSION,
	isExpired,
	type Namespace,
	parseFileRecord,
	parseStoreHeader,
} from "../codec.js";
import { KeyvFsCorruptionError, KeyvFsFormatError } from "../errors.js";
import { GroupCommit } from "../group-commit.js";
import {
	atomicWriteFile,
	fileMode,
	fsOps,
	hasCode,
	randomHex,
	readdirOrEmpty,
	readLines,
	renameWithRetry,
} from "../io.js";
import { Strategy, type WriteEntry } from "./strategy.js";

/** Why a store file could not be loaded as it is. */
type Damage = { line: number; reason: string };

/**
 * An entry with its record line cached. An entry is stored under one key and never changes, so
 * its line is encoded once instead of on every save.
 */
type FileEntry = Entry & { line?: string };

/**
 * The `"file"` strategy: the whole store in one file, loaded into memory.
 *
 * The file is a header line, one `set` record per entry, and a checkpoint line with the entry
 * count. Reads come from memory. A write changes memory, then waits for a save, which writes the
 * whole store to a temporary file and renames it over the store file. Writes made in the same
 * tick (or within `writeDelay`) share a save.
 */
export class FileStrategy extends Strategy {
	private _index = new Map<Namespace, Map<string, FileEntry>>();
	/** The permissions of the store file when it was loaded, kept by every save. */
	private _mode: number | undefined;
	private readonly _commit: GroupCommit;

	/**
	 * @param file - The store file.
	 * @param writeDelay - Milliseconds to wait before a save.
	 * @param expiredCheckDelay - Milliseconds between expiry sweeps.
	 * @param previousClose - The close of an earlier backend on this path.
	 */
	constructor(
		file: string,
		writeDelay: number,
		expiredCheckDelay: number,
		previousClose?: Promise<void>,
	) {
		super(file, expiredCheckDelay, previousClose);
		this._commit = new GroupCommit(() => this.persist(), writeDelay);
	}

	protected async read(): Promise<void> {
		await this.removeTemporaryFiles();
		this._index = new Map();
		this._mode = await fileMode(this.path);
		let damage: Damage | undefined;
		try {
			damage = await this.parse();
		} catch (error) {
			this._index = new Map();
			if (hasCode(error, "ENOENT")) {
				return;
			}

			throw error;
		}

		if (damage) {
			this._index = new Map();
			const quarantinePath = `${this.path}.corrupt-${timestamp()}-${randomHex(2)}`;
			await renameWithRetry(this.path, quarantinePath);
			this.setNotice(
				new KeyvFsCorruptionError(
					this.path,
					`@keyv/fs: ${this.path} is damaged (line ${damage.line}: ${damage.reason}). It was moved to ${quarantinePath} and the store started empty.`,
					quarantinePath,
				),
			);
		}
	}

	public async get(ns: Namespace, key: string): Promise<unknown> {
		const entry = this.live(ns, key);
		return entry === undefined ? undefined : decodeValue(entry.kind, entry.data);
	}

	public async getMany(ns: Namespace, keys: string[]): Promise<unknown[]> {
		return keys.map((key) => {
			const entry = this.live(ns, key);
			return entry === undefined ? undefined : decodeValue(entry.kind, entry.data);
		});
	}

	public async has(ns: Namespace, key: string): Promise<boolean> {
		return this.live(ns, key) !== undefined;
	}

	public async hasMany(ns: Namespace, keys: string[]): Promise<boolean[]> {
		return keys.map((key) => this.live(ns, key) !== undefined);
	}

	public async set(ns: Namespace, entry: WriteEntry): Promise<void> {
		await this.setMany(ns, [entry]);
	}

	public async setMany(ns: Namespace, entries: WriteEntry[]): Promise<void> {
		// Encode everything before touching memory, so a value that can't be stored changes nothing.
		const encoded = entries.map(({ key, value, expires }) => ({
			key,
			entry: encodeEntry(value, expires),
		}));
		const now = Date.now();
		let changed = false;
		for (const { key, entry } of encoded) {
			if (isExpired(entry.expires, now)) {
				// Writing an expired entry deletes the key. Only a live entry needs a save: an expired
				// record on disk is skipped when the file is loaded.
				changed = this.remove(ns, key, now) || changed;
			} else {
				this.namespaceMap(ns).set(key, entry);
				changed = true;
			}
		}

		if (changed) {
			await this._commit.wait(this._commit.next());
		}
	}

	public async delete(ns: Namespace, key: string): Promise<boolean> {
		const [deleted] = await this.deleteMany(ns, [key]);
		return deleted;
	}

	public async deleteMany(ns: Namespace, keys: string[]): Promise<boolean[]> {
		const now = Date.now();
		const results = keys.map((key) => this.remove(ns, key, now));
		if (results.includes(true)) {
			await this._commit.wait(this._commit.next());
		}

		return results;
	}

	public async clear(ns: Namespace): Promise<void> {
		const map = this._index.get(ns);
		if (map === undefined) {
			return;
		}

		this._index.delete(ns);
		if (map.size > 0) {
			await this._commit.wait(this._commit.next());
		}
	}

	public async *entries(ns: Namespace): AsyncGenerator<[string, unknown]> {
		const map = this._index.get(ns);
		if (map === undefined) {
			return;
		}

		// Iterate over a copy of the keys, and look each one up again, so entries deleted or
		// changed during iteration are skipped or seen as they are now.
		for (const key of [...map.keys()]) {
			const entry = this.live(ns, key);
			if (entry !== undefined) {
				yield [key, decodeValue(entry.kind, entry.data)];
			}
		}
	}

	protected async sweep(): Promise<void> {
		const now = Date.now();
		let removed = false;
		for (const [ns, map] of this._index) {
			for (const [key, entry] of map) {
				if (isExpired(entry.expires, now)) {
					map.delete(key);
					removed = true;
				}
			}

			if (map.size === 0) {
				this._index.delete(ns);
			}
		}

		if (removed) {
			await this._commit.wait(this._commit.next());
		}
	}

	public async flush(): Promise<void> {
		if (this.loaded) {
			await this._commit.flush();
		}
	}

	protected async closeResources(): Promise<void> {
		this._index = new Map();
	}

	/**
	 * The entry for a key when it exists and has not expired. An expired entry is dropped from
	 * memory; the file is left as it is, because expired records are skipped at load.
	 */
	private live(ns: Namespace, key: string): FileEntry | undefined {
		const map = this._index.get(ns);
		const entry = map?.get(key);
		if (entry === undefined) {
			return undefined;
		}

		if (isExpired(entry.expires, Date.now())) {
			map?.delete(key);
			return undefined;
		}

		return entry;
	}

	/**
	 * Removes a key from memory.
	 * @returns Whether a live entry was removed, which is when the file needs saving.
	 */
	private remove(ns: Namespace, key: string, now: number): boolean {
		const map = this._index.get(ns);
		const entry = map?.get(key);
		if (map === undefined || entry === undefined) {
			return false;
		}

		map.delete(key);
		return !isExpired(entry.expires, now);
	}

	private namespaceMap(ns: Namespace): Map<string, FileEntry> {
		let map = this._index.get(ns);
		if (map === undefined) {
			map = new Map();
			this._index.set(ns, map);
		}

		return map;
	}

	/**
	 * Writes the whole store. The snapshot is taken synchronously, before the first `await`, so
	 * the group commit knows exactly which changes the save includes.
	 */
	private async persist(): Promise<void> {
		const now = Date.now();
		const lines = [encodeStoreHeader("file")];
		for (const [ns, map] of this._index) {
			for (const [key, entry] of map) {
				if (!isExpired(entry.expires, now)) {
					entry.line ??= encodeFileRecord(ns, key, entry);
					lines.push(entry.line);
				}
			}
		}

		lines.push(encodeCheckpoint(lines.length - 1));
		await atomicWriteFile(this.path, lines, this._mode);
	}

	/**
	 * Reads the store file into memory.
	 * @returns Where the file is damaged, or `undefined` when it loaded cleanly.
	 * @throws {KeyvFsFormatError} If the file is not a keyv-fs store file this version can read.
	 */
	private async parse(): Promise<Damage | undefined> {
		const now = Date.now();
		let lineNumber = 0;
		let count = 0;
		let checkpoint: number | undefined;
		for await (const line of readLines(this.path)) {
			lineNumber++;
			if (lineNumber === 1) {
				this.checkHeader(line);
				continue;
			}

			if (checkpoint !== undefined) {
				return { line: lineNumber, reason: "data after the checkpoint" };
			}

			const record = parseFileRecord(line);
			if (record === undefined) {
				return { line: lineNumber, reason: "not a valid record" };
			}

			if (record.op === "checkpoint") {
				if (record.count !== count) {
					return {
						line: lineNumber,
						reason: `the checkpoint counts ${record.count} entries but the file has ${count}`,
					};
				}

				checkpoint = record.count;
				continue;
			}

			if (record.entry.kind === "j" && !isDecodable(record.entry.data)) {
				return { line: lineNumber, reason: "its value is not valid" };
			}

			count++;
			if (!isExpired(record.entry.expires, now)) {
				this.namespaceMap(record.namespace).set(record.key, { ...record.entry, line });
			}
		}

		// An empty file (for example, one created with `touch`) is an empty store.
		if (lineNumber > 0 && checkpoint === undefined) {
			return { line: lineNumber + 1, reason: "the file ends before its checkpoint" };
		}

		return undefined;
	}

	private checkHeader(line: string): void {
		const header = parseStoreHeader(line);
		if (header === undefined || header.kind !== "file") {
			throw new KeyvFsFormatError(
				this.path,
				`@keyv/fs: ${this.path} is not a @keyv/fs store file, so it was left untouched. Point \`path\` at a new file, or move this one away. To bring over data from keyv-file, see the @keyv/fs README.`,
			);
		}

		if (header.version > FORMAT_VERSION) {
			throw new KeyvFsFormatError(
				this.path,
				`@keyv/fs: ${this.path} was written by a newer version of @keyv/fs (format version ${header.version}). Upgrade @keyv/fs to read it.`,
			);
		}
	}

	/**
	 * Removes temporary files that an interrupted save left next to the store file.
	 */
	private async removeTemporaryFiles(): Promise<void> {
		const directory = path.dirname(this.path);
		const prefix = `${path.basename(this.path)}.`;
		for (const name of await readdirOrEmpty(directory)) {
			if (name.startsWith(prefix) && /^\d+\.[0-9a-f]{8}\.tmp$/.test(name.slice(prefix.length))) {
				await fsOps.unlink(path.join(directory, name)).catch(() => {});
			}
		}
	}
}

/** The current UTC time as `YYYYMMDDTHHMMSSZ`, for quarantine file names. */
function timestamp(): string {
	return new Date()
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}/, "");
}

/** Whether a stored `j` value can be read back. */
function isDecodable(data: string): boolean {
	try {
		decodeValue("j", data);
		return true;
	} catch {
		return false;
	}
}
