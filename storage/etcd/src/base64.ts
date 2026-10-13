/**
 * Base64 conversion for etcd's JSON gateway. Keys and values are base64 text
 * on the wire; this module only converts that text.
 *
 * Published as its own file so the decode is not bundled into the HTTP client.
 */

/** Decodes standard base64 into bytes. */
export function decodeBase64(input: string): Buffer {
	return Buffer.from(input, "base64");
}

/**
 * Encodes a string or raw bytes as standard base64.
 * @param input - Text, encoded as UTF-8, or bytes already in a `Buffer`.
 * @returns The base64 text.
 */
export function b64encode(input: string | Buffer): string {
	if (typeof input === "string") {
		return Buffer.from(input, "utf8").toString("base64");
	}

	return input.toString("base64");
}

/**
 * Decodes standard base64 as UTF-8 text.
 * @param input - Base64 text.
 * @returns The decoded string.
 */
export function b64decode(input: string): string {
	return decodeBase64(input).toString("utf8");
}
