import { createHash } from "node:crypto";
import { jsonSerializer } from "keyv";

/** The format version this release reads and writes. */
export const FORMAT_VERSION = 1;

/**
 * How a value is stored:
 * - `s`: a string, stored as is.
 * - `j`: any other value, stored as keyv's `jsonSerializer` output (keeps Buffer and BigInt).
 * - `u`: `undefined`.
 * - `q`: directory entries only. A string that is not well-formed UTF-16 (it has a lone
 *   surrogate), stored as JSON so it survives the trip through UTF-8.
 */
export type ValueKind = "s" | "j" | "u" | "q";

/** A stored value with its absolute expiry. Entries are never mutated; a write replaces them. */
export type Entry = {
	readonly kind: ValueKind;
	readonly data: string;
	readonly expires: number | undefined;
};

/** A namespace as the strategies see it: `undefined` means no namespace. */
export type Namespace = string | undefined;

/** The header line of a store file or the marker file of a store directory. */
export type StoreHeader = { format: string; kind: string; version: number };

/** The parsed header line of a directory entry file. */
export type EntryHeader = {
	key: string;
	namespace: Namespace;
	expires: number | undefined;
	kind: ValueKind;
};

/**
 * Encodes a value for storage.
 * @param value - The value Keyv passed to the adapter: usually a string, or any value when
 * Keyv's serialization is off.
 * @param expires - Absolute expiry in Unix ms. Anything other than a finite number means none.
 * @returns The entry to store.
 * @throws {TypeError} If the value can't be stored (a function, a symbol, or a circular value).
 */
export function encodeEntry(value: unknown, expires: unknown): Entry {
	const normalized = typeof expires === "number" && Number.isFinite(expires) ? expires : undefined;
	if (typeof value === "string") {
		return { kind: "s", data: value, expires: normalized };
	}

	if (value === undefined) {
		return { kind: "u", data: "", expires: normalized };
	}

	let data: unknown;
	try {
		data = jsonSerializer.stringify(value);
	} catch (error) {
		throw new TypeError(`@keyv/fs can't store this value: ${(error as Error).message}`, {
			cause: error,
		});
	}

	if (typeof data !== "string") {
		throw new TypeError(`@keyv/fs can't store a value of type ${typeof value}.`);
	}

	return { kind: "j", data, expires: normalized };
}

/**
 * Decodes a stored value. Each call returns a new object for `j` values, so callers can't change
 * what is stored.
 * @param kind - How the value was stored.
 * @param data - The stored text.
 * @returns The value.
 */
export function decodeValue(kind: ValueKind, data: string): unknown {
	switch (kind) {
		case "s": {
			return data;
		}

		case "j": {
			return jsonSerializer.parse(data);
		}

		case "q": {
			return JSON.parse(data) as string;
		}

		default: {
			return undefined;
		}
	}
}

/**
 * Whether an absolute expiry has passed. An expiry equal to `now` has passed.
 * @param expires - Absolute expiry in Unix ms, or `undefined` for none.
 * @param now - The current time in Unix ms.
 */
export function isExpired(expires: number | undefined, now: number): boolean {
	return expires !== undefined && expires <= now;
}

/**
 * The first 64 hex characters of the SHA-256 of a string's UTF-16 code units. Hashing the code
 * units, not UTF-8, keeps strings with lone surrogates distinct.
 * @param value - The string to hash.
 */
export function hashName(value: string): string {
	return createHash("sha256").update(value, "utf16le").digest("hex");
}

/**
 * Serializes a store header or directory marker.
 * @param kind - `"file"` or `"directory"`.
 */
export function encodeStoreHeader(kind: "file" | "directory"): string {
	return `{"format":"keyv-fs","kind":"${kind}","version":${FORMAT_VERSION}}`;
}

/**
 * Parses a store header or directory marker.
 * @param text - The header line.
 * @returns The header, or `undefined` when the text is not a keyv-fs header.
 */
export function parseStoreHeader(text: string): StoreHeader | undefined {
	const header = parseObject(text);
	if (
		header === undefined ||
		header.format !== "keyv-fs" ||
		typeof header.kind !== "string" ||
		typeof header.version !== "number" ||
		!Number.isInteger(header.version)
	) {
		return undefined;
	}

	return { format: header.format, kind: header.kind, version: header.version };
}

/**
 * Serializes one `set` record of a store file.
 * @param namespace - The entry's namespace.
 * @param key - The entry's key.
 * @param entry - The entry.
 */
export function encodeFileRecord(namespace: Namespace, key: string, entry: Entry): string {
	let line = '{"op":"set"';
	if (namespace !== undefined) {
		line += `,"n":${JSON.stringify(namespace)}`;
	}

	line += `,"k":${JSON.stringify(key)}`;
	if (entry.expires !== undefined) {
		line += `,"e":${entry.expires}`;
	}

	line += entry.kind === "u" ? ',"u":1}' : `,"${entry.kind}":${JSON.stringify(entry.data)}}`;
	return line;
}

/** A parsed line of a store file. */
export type FileRecord =
	| { op: "set"; namespace: Namespace; key: string; entry: Entry }
	| { op: "checkpoint"; count: number };

/**
 * Parses one line of a store file after the header.
 * @param line - The line.
 * @returns The record, or `undefined` when the line is not a valid record.
 */
export function parseFileRecord(line: string): FileRecord | undefined {
	const record = parseObject(line);
	if (record === undefined) {
		return undefined;
	}

	if (record.op === "checkpoint") {
		return Number.isSafeInteger(record.count) && (record.count as number) >= 0
			? { op: "checkpoint", count: record.count as number }
			: undefined;
	}

	if (record.op !== "set" || typeof record.k !== "string" || !isOptionalString(record.n)) {
		return undefined;
	}

	if (record.e !== undefined && !(typeof record.e === "number" && Number.isFinite(record.e))) {
		return undefined;
	}

	let kind: ValueKind;
	let data: string;
	if (typeof record.s === "string") {
		kind = "s";
		data = record.s;
	} else if (typeof record.j === "string") {
		kind = "j";
		data = record.j;
	} else if (record.u === 1) {
		kind = "u";
		data = "";
	} else {
		return undefined;
	}

	return {
		op: "set",
		namespace: record.n as Namespace,
		key: record.k,
		entry: { kind, data, expires: record.e as number | undefined },
	};
}

/**
 * Serializes the checkpoint line that closes a store file.
 * @param count - The number of `set` records before it.
 */
export function encodeCheckpoint(count: number): string {
	return `{"op":"checkpoint","count":${count}}`;
}

/**
 * Serializes a directory entry file: a JSON header line, then the raw value.
 * @param namespace - The entry's namespace.
 * @param key - The entry's key.
 * @param entry - The entry.
 */
export function encodeEntryFile(namespace: Namespace, key: string, entry: Entry): string {
	let kind = entry.kind;
	let payload = entry.data;
	if (kind === "s" && !payload.isWellFormed()) {
		kind = "q";
		payload = JSON.stringify(payload);
	}

	let header = `{"format":"keyv-fs","kind":"entry","version":${FORMAT_VERSION},"k":${JSON.stringify(key)}`;
	if (namespace !== undefined) {
		header += `,"n":${JSON.stringify(namespace)}`;
	}

	if (entry.expires !== undefined) {
		header += `,"e":${entry.expires}`;
	}

	return `${header},"t":"${kind}"}\n${payload}`;
}

/**
 * Parses the header line of a directory entry file.
 * @param text - The header line, without its newline.
 * @returns The header, or `undefined` when it is not a valid entry header.
 */
export function parseEntryHeader(text: string): EntryHeader | undefined {
	const header = parseObject(text);
	if (
		header === undefined ||
		header.format !== "keyv-fs" ||
		header.kind !== "entry" ||
		header.version !== FORMAT_VERSION ||
		typeof header.k !== "string" ||
		!isOptionalString(header.n) ||
		(header.e !== undefined && !(typeof header.e === "number" && Number.isFinite(header.e))) ||
		(header.t !== "s" && header.t !== "j" && header.t !== "u" && header.t !== "q")
	) {
		return undefined;
	}

	return {
		key: header.k,
		namespace: header.n as Namespace,
		expires: header.e as number | undefined,
		kind: header.t,
	};
}

function parseObject(text: string): Record<string, unknown> | undefined {
	try {
		const value: unknown = JSON.parse(text);
		return value !== null && typeof value === "object" && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
}

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === "string";
}
