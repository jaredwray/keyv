import { Buffer } from "node:buffer";
import type { KeyvCompressionAdapter } from "keyv";
import { compress, uncompress } from "lz4-napi";

/** The JSON envelope that Keyv v5 stored around a compressed value. */
type V5Envelope = { value?: unknown; expires?: number };

export class KeyvLz4 implements KeyvCompressionAdapter {
	constructor(private readonly dictionary?: string) {}

	async compress(data: string): Promise<string> {
		const compressed = await compress(Buffer.from(data), this.getDictionary());
		return compressed.toString("base64");
	}

	async decompress(data: string): Promise<string> {
		// v6 stores base64, which never starts with "{". A JSON envelope was written by Keyv v5.
		if (data.startsWith("{")) {
			return this.decompressV5(data);
		}

		const buffer = Buffer.from(data, "base64");
		const value = await uncompress(buffer, this.getDictionary());
		return value.toString("utf8");
	}

	/**
	 * Reads a value written by Keyv v5 with @keyv/compress-lz4 v1. v5 compressed only the value,
	 * which had to be a string, and stored it in a JSON envelope:
	 * `{"value":":base64:<lz4>","expires":1700000000000}`. Returns the envelope Keyv v6 writes
	 * before compressing, so values stored before the upgrade stay readable.
	 */
	private async decompressV5(stored: string): Promise<string> {
		const { value, expires } = JSON.parse(stored) as V5Envelope;
		if (typeof value !== "string" || !value.startsWith(":base64:")) {
			throw new TypeError("Unrecognized compressed value: expected a Keyv v5 lz4 value");
		}

		const buffer = await uncompress(Buffer.from(value.slice(8), "base64"), this.getDictionary());
		const text = buffer.toString("utf8");
		// Keyv's JSON serializer strips one leading colon from strings, so escape it.
		return JSON.stringify({ value: text.startsWith(":") ? `:${text}` : text, expires });
	}

	private getDictionary() {
		if (this.dictionary) {
			return Buffer.from(this.dictionary);
		}

		return undefined;
	}
}

export default KeyvLz4;
