import { Buffer } from "node:buffer";

// Improved version of the deprecated `json-buffer` (https://github.com/dominictarr/json-buffer) package.
// These default functionalities can be improved separately from the dependant packages.
// biome-ignore lint/suspicious/noExplicitAny: allowed
const _serialize = (data: any, escapeColonStrings: boolean = true): string => {
	if (data === undefined || data === null) {
		return "null";
	}

	if (typeof data === "string") {
		return JSON.stringify(
			escapeColonStrings && data.startsWith(":") ? `:${data}` : data,
		);
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
				s += _serialize(data[k], escapeColonStrings);
			} else if (data[k] !== undefined) {
				s += `${_serialize(k, false)}:${_serialize(data[k], escapeColonStrings)}`;
			}
		}

		s += array ? "]" : "}";
		return s;
	}

	return JSON.stringify(data);
};

// biome-ignore lint/suspicious/noExplicitAny: allowed
export const defaultSerialize = (data: any): string => {
	return _serialize(data, true);
};

// biome-ignore lint/suspicious/noExplicitAny: type format
export const defaultDeserialize = <Value>(data: any) =>
	JSON.parse(data as unknown as string, (_, value) => {
		if (typeof value === "string") {
			if (value.startsWith(":base64:")) {
				return Buffer.from(value.slice(8), "base64");
			}

			return value.startsWith(":") ? value.slice(1) : value;
		}

		return value;
	}) as Value;
