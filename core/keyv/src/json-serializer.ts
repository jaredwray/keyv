import type { KeyvSerializationAdapter } from "./types.js";

type BufferLike = Uint8Array & {
	toString(encoding?: string): string;
};

type GlobalBuffer = {
	isBuffer(value: unknown): value is BufferLike;
	from(data: Uint8Array): BufferLike;
	from(data: string, encoding: "base64"): BufferLike;
};

function getGlobalBuffer(): GlobalBuffer | undefined {
	return (globalThis as { Buffer?: GlobalBuffer }).Buffer;
}

function bytesToBase64(bytes: Uint8Array): string {
	const buffer = getGlobalBuffer();
	if (buffer) {
		return buffer.from(bytes).toString("base64");
	}

	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
	const buffer = getGlobalBuffer();
	if (buffer) {
		return buffer.from(value, "base64");
	}

	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes;
}

function isBinaryValue(value: unknown): value is Uint8Array {
	const buffer = getGlobalBuffer();
	if (buffer?.isBuffer(value)) {
		return true;
	}

	return value instanceof Uint8Array;
}

/**
 * Pre-process a value tree, converting Buffer and BigInt to tagged strings
 * before JSON.stringify can call toJSON() on them.
 */
// biome-ignore lint/suspicious/noExplicitAny: needed for recursive traversal
function prepare(value: any): any {
	if (value === null || value === undefined) {
		return value;
	}

	if (isBinaryValue(value)) {
		return `:base64:${bytesToBase64(value)}`;
	}

	if (typeof value === "bigint") {
		return `:bigint:${value.toString()}`;
	}

	if (typeof value === "string") {
		return value.startsWith(":") ? `:${value}` : value;
	}

	if (Array.isArray(value)) {
		return value.map((item) => prepare(item));
	}

	if (typeof value === "object") {
		// Call toJSON if present (e.g. Date), then continue processing
		if (typeof value.toJSON === "function") {
			return prepare(value.toJSON());
		}

		// biome-ignore lint/suspicious/noExplicitAny: needed for object rebuild
		const result: Record<string, any> = {};
		for (const key of Object.keys(value)) {
			if (value[key] !== undefined) {
				result[key] = prepare(value[key]);
			}
		}

		return result;
	}

	return value;
}

export class KeyvJsonSerializer implements KeyvSerializationAdapter {
	stringify(object: unknown): string {
		return JSON.stringify(prepare(object));
	}

	parse<T>(data: string): T {
		return JSON.parse(data, (_, value) => {
			if (typeof value === "string") {
				if (value.startsWith(":bigint:")) {
					return BigInt(value.slice(8));
				}

				if (value.startsWith(":base64:")) {
					return base64ToBytes(value.slice(8));
				}

				return value.startsWith(":") ? value.slice(1) : value;
			}

			return value;
		}) as T;
	}
}

export const jsonSerializer = new KeyvJsonSerializer();

export default KeyvJsonSerializer;
