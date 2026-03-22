import { Buffer } from "node:buffer";

// biome-ignore lint/suspicious/noExplicitAny: allowed
const _stringify = (data: any, escapeColonStrings: boolean = true): string => {
	if (data === undefined || data === null) {
		return "null";
	}

	if (typeof data === "string") {
		return JSON.stringify(
			escapeColonStrings && data.startsWith(":") ? `:${data}` : data,
		);
	}

	if (typeof data === "bigint") {
		return JSON.stringify(`:bigint:${data.toString()}`);
	}

	if (Buffer.isBuffer(data)) {
		return JSON.stringify(`:base64:${data.toString("base64")}`);
	}

	if (data?.toJSON) {
		// biome-ignore lint/suspicious/noExplicitAny: allowed
		data = data.toJSON() as unknown as Record<string, any>;
	}

	if (typeof data === "object") {
		let s = "";
		const array = Array.isArray(data);
		s = array ? "[" : "{";
		let first = true;

		for (const k in data) {
			const ignore =
				typeof data[k] === "function" || (!array && data[k] === undefined);
			if (!Object.hasOwn(data, k) || ignore) {
				continue;
			}

			if (!first) {
				s += ",";
			}

			first = false;
			if (array) {
				s += _stringify(data[k], escapeColonStrings);
			} else if (data[k] !== undefined) {
				s += `${_stringify(k, false)}:${_stringify(data[k], escapeColonStrings)}`;
			}
		}

		s += array ? "]" : "}";
		return s;
	}

	return JSON.stringify(data);
};

export class KeyvJsonSerializer {
	stringify(object: unknown): string {
		return _stringify(object, true);
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
