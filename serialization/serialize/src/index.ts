import { Buffer } from "node:buffer";
import type { KeyvSerializationAdapter } from "keyv";

/**
 * Pre-process a value tree, converting Buffer and BigInt to tagged strings
 * before JSON.stringify can call toJSON() on them.
 */
// biome-ignore lint/suspicious/noExplicitAny: needed for recursive traversal
function prepare(value: any): any {
	if (value === null || value === undefined) {
		return value;
	}

	if (Buffer.isBuffer(value)) {
		return `:base64:${value.toString("base64")}`;
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
					return Buffer.from(value.slice(8), "base64");
				}

				return value.startsWith(":") ? value.slice(1) : value;
			}

			return value;
		}) as T;
	}
}

export const jsonSerializer = new KeyvJsonSerializer();

export default KeyvJsonSerializer;
