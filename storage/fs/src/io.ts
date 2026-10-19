import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import * as fsp from "node:fs/promises";
import path from "node:path";

/**
 * The file system calls this package makes. Everything goes through this object so tests can
 * inject failures and pause operations. It is not part of the public API.
 */
export const fsOps = {
	open: fsp.open,
	readFile: fsp.readFile,
	writeFile: fsp.writeFile,
	rename: fsp.rename,
	unlink: fsp.unlink,
	mkdir: fsp.mkdir,
	rm: fsp.rm,
	readdir: fsp.readdir,
	stat: fsp.stat,
	createReadStream,
};

/** The platform, overridable by tests. Not part of the public API. */
export const runtime = { platform: process.platform as string };

/** Bytes written per call when a file is written in pieces. */
const WRITE_CHUNK_SIZE = 1024 * 1024;

/**
 * Whether an error is a Node.js system error with the given code.
 * @param error - The error.
 * @param codes - The codes to match, such as `"ENOENT"`.
 */
export function hasCode(error: unknown, ...codes: string[]): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		codes.includes((error as NodeJS.ErrnoException).code as string)
	);
}

/**
 * Random lowercase hex.
 * @param bytes - How many random bytes to encode.
 */
export function randomHex(bytes: number): string {
	return randomBytes(bytes).toString("hex");
}

/**
 * Renames a file, replacing the target. On Windows, a rename can fail for a moment while another
 * handle (an antivirus scanner, a search indexer) has the target open, so it is retried there.
 * @param from - The file to rename.
 * @param to - The new name.
 */
export async function renameWithRetry(from: string, to: string): Promise<void> {
	const attempts = runtime.platform === "win32" ? 10 : 1;
	for (let attempt = 1; ; attempt++) {
		try {
			await fsOps.rename(from, to);
			return;
		} catch (error) {
			if (attempt >= attempts || !hasCode(error, "EPERM", "EACCES", "EBUSY")) {
				throw error;
			}

			await new Promise((resolve) => setTimeout(resolve, attempt * 10));
		}
	}
}

/**
 * Writes a file atomically: the lines go to a temporary file in the same directory, which is
 * then renamed over the target. Readers see either the old file or the new one, never part of
 * either. The directory is created when it is missing. On failure the temporary file is removed.
 * @param target - The file to write.
 * @param lines - The lines to write. Each is followed by a newline.
 * @param mode - The permissions to give the file, such as those of the file it replaces.
 */
export async function atomicWriteFile(
	target: string,
	lines: readonly string[],
	mode?: number,
): Promise<void> {
	const temporary = `${target}.${process.pid}.${randomHex(4)}.tmp`;
	let handle: fsp.FileHandle;
	try {
		handle = await fsOps.open(temporary, "wx");
	} catch (error) {
		if (!hasCode(error, "ENOENT")) {
			throw error;
		}

		await fsOps.mkdir(path.dirname(target), { recursive: true });
		handle = await fsOps.open(temporary, "wx");
	}

	try {
		try {
			if (mode !== undefined) {
				await handle.chmod(mode);
			}

			let chunk = "";
			for (const line of lines) {
				chunk += `${line}\n`;
				if (chunk.length >= WRITE_CHUNK_SIZE) {
					await handle.writeFile(chunk);
					chunk = "";
				}
			}

			if (chunk.length > 0) {
				await handle.writeFile(chunk);
			}
		} finally {
			await handle.close();
		}

		await renameWithRetry(temporary, target);
	} catch (error) {
		await fsOps.unlink(temporary).catch(() => {});
		throw error;
	}
}

/**
 * The permissions of a file.
 * @param file - The file.
 * @returns The permission bits, or `undefined` when the file does not exist.
 */
export async function fileMode(file: string): Promise<number | undefined> {
	try {
		return (await fsOps.stat(file)).mode & 0o777;
	} catch (error) {
		if (hasCode(error, "ENOENT")) {
			return undefined;
		}

		throw error;
	}
}

/**
 * Reads a file line by line without loading it into one string. Lines are split on `\n` only.
 * A final line without a newline is returned too.
 * @param file - The file to read.
 */
export async function* readLines(file: string): AsyncGenerator<string> {
	const stream = fsOps.createReadStream(file);
	let carry: Buffer[] = [];
	for await (const chunk of stream as AsyncIterable<Buffer>) {
		let start = 0;
		let end = chunk.indexOf(10, start);
		while (end !== -1) {
			const part = chunk.subarray(start, end);
			yield (carry.length > 0 ? Buffer.concat([...carry, part]) : part).toString("utf8");
			carry = [];
			start = end + 1;
			end = chunk.indexOf(10, start);
		}

		if (start < chunk.length) {
			carry.push(chunk.subarray(start));
		}
	}

	if (carry.length > 0) {
		yield Buffer.concat(carry).toString("utf8");
	}
}

/**
 * Reads a file up to its first newline.
 * @param file - The file to read.
 * @returns The text before the first newline (all of it when there is none), or `undefined` when
 * the file does not exist.
 */
export async function readFirstLine(file: string): Promise<string | undefined> {
	let handle: fsp.FileHandle;
	try {
		handle = await fsOps.open(file, "r");
	} catch (error) {
		if (hasCode(error, "ENOENT", "ENOTDIR")) {
			return undefined;
		}

		throw error;
	}

	try {
		const parts: Buffer[] = [];
		const buffer = Buffer.alloc(4096);
		for (;;) {
			const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
			if (bytesRead === 0) {
				break;
			}

			const newline = buffer.subarray(0, bytesRead).indexOf(10);
			if (newline !== -1) {
				parts.push(Buffer.from(buffer.subarray(0, newline)));
				break;
			}

			parts.push(Buffer.from(buffer.subarray(0, bytesRead)));
		}

		return Buffer.concat(parts).toString("utf8");
	} finally {
		await handle.close();
	}
}

/**
 * Lists a directory, treating a missing directory as empty.
 * @param directory - The directory.
 */
export async function readdirOrEmpty(directory: string): Promise<string[]> {
	try {
		return await fsOps.readdir(directory);
	} catch (error) {
		if (hasCode(error, "ENOENT", "ENOTDIR")) {
			return [];
		}

		throw error;
	}
}

/**
 * Removes a file, treating a missing file as already removed.
 * @param file - The file.
 * @returns Whether a file was removed.
 */
export async function unlinkIfExists(file: string): Promise<boolean> {
	try {
		await fsOps.unlink(file);
		return true;
	} catch (error) {
		if (hasCode(error, "ENOENT", "ENOTDIR")) {
			return false;
		}

		throw error;
	}
}

/**
 * Runs `fn` over every item with at most `limit` running at once, keeping results in input order.
 * Waits for every call to settle, then rejects with the first error if any failed.
 * @param items - The items.
 * @param limit - The most calls running at once.
 * @param fn - The function to run.
 */
export async function mapLimit<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let failed = false;
	let firstError: unknown;
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const index = next++;
			try {
				results[index] = await fn(items[index], index);
			} catch (error) {
				if (!failed) {
					failed = true;
					firstError = error;
				}
			}
		}
	};

	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	if (failed) {
		throw firstError;
	}

	return results;
}

/**
 * Runs functions one at a time per key, in call order. Different keys run concurrently.
 */
export class KeyedMutex {
	private readonly _tails = new Map<string, Promise<void>>();

	/**
	 * Runs `fn` once every earlier call for the same key has settled.
	 * @param key - The key to serialize on.
	 * @param fn - The function to run.
	 */
	public async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
		const previous = this._tails.get(key) ?? Promise.resolve();
		let release!: () => void;
		const tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		this._tails.set(key, tail);
		try {
			await previous;
			return await fn();
		} finally {
			release();
			if (this._tails.get(key) === tail) {
				this._tails.delete(key);
			}
		}
	}
}

type GateWaiter = { exclusive: boolean; grant: () => void };

/**
 * A first-in, first-out readers-writer gate. Shared holders run together; an exclusive holder
 * runs alone. A request takes its place in line when it is made, so holders are granted in call
 * order.
 */
export class RwGate {
	private _shared = 0;
	private _exclusive = false;
	private readonly _queue: GateWaiter[] = [];

	/**
	 * Requests a shared hold. The request takes its place in line synchronously.
	 * @returns A promise for the function that releases the hold.
	 */
	public shared(): Promise<() => void> {
		return this.request(false);
	}

	/**
	 * Requests an exclusive hold. The request takes its place in line synchronously.
	 * @returns A promise for the function that releases the hold.
	 */
	public exclusive(): Promise<() => void> {
		return this.request(true);
	}

	private request(exclusive: boolean): Promise<() => void> {
		return new Promise((resolve) => {
			let released = false;
			const release = () => {
				if (released) {
					return;
				}

				released = true;
				if (exclusive) {
					this._exclusive = false;
				} else {
					this._shared--;
				}

				this.drain();
			};

			this._queue.push({
				exclusive,
				grant: () => {
					resolve(release);
				},
			});
			this.drain();
		});
	}

	private drain(): void {
		while (this._queue.length > 0 && !this._exclusive) {
			const head = this._queue[0];
			if (head.exclusive) {
				if (this._shared > 0) {
					return;
				}

				this._exclusive = true;
			} else {
				this._shared++;
			}

			this._queue.shift();
			head.grant();
		}
	}
}
