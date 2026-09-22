import { Buffer } from "node:buffer";
import type { KeyvCompressionAdapter } from "keyv";
import { deflate, inflate } from "pako";
import type { Options } from "./types.js";

/** The JSON envelope that Keyv v5 stored around a compressed value. */
type V5Envelope = { value?: unknown; expires?: number };

export class KeyvGzip implements KeyvCompressionAdapter {
	private readonly _options: Options;

	constructor(options?: Options) {
		this._options = { ...options };
	}

	async compress(value: string): Promise<string> {
		const compressed = deflate(value, this._options);
		return Buffer.from(compressed).toString("base64");
	}

	async decompress(value: string): Promise<string> {
		// v6 stores base64, which never starts with "{". A JSON envelope was written by Keyv v5.
		if (value.startsWith("{")) {
			return this.decompressV5(value);
		}

		const buffer = Buffer.from(value, "base64");
		return inflate(buffer, { ...this._options, toText: true });
	}

	/**
	 * Reads a value written by Keyv v5 with @keyv/compress-gzip v2. v5 deflated only the value, which
	 * had to be a string, and stored the bytes in a JSON envelope as an object keyed by index:
	 * `{"value":{"0":120,"1":156,...},"expires":1700000000000}`. Returns the envelope Keyv v6 writes
	 * before compressing, so values stored before the upgrade stay readable.
	 */
	private decompressV5(stored: string): string {
		const { value, expires } = JSON.parse(stored) as V5Envelope;
		if (typeof value !== "object" || value === null) {
			throw new TypeError("Unrecognized compressed value: expected a Keyv v5 gzip value");
		}

		const text = inflate(Uint8Array.from(Object.values(value)), {
			...this._options,
			toText: true,
		});
		// Keyv's JSON serializer strips one leading colon from strings, so escape it.
		return JSON.stringify({ value: text.startsWith(":") ? `:${text}` : text, expires });
	}
}

export default KeyvGzip;
