import {Buffer} from 'node:buffer';

// Improved version of the deprecated `json-buffer` (https://github.com/dominictarr/json-buffer) package.
// These default functionalities can be improved separately from the dependant packages.
export const defaultSerialize = (data: any): string => {
	if (data === undefined || data === null) {
		return 'null';
	}

	if (typeof data === 'string') {
		return JSON.stringify(data.startsWith(':') ? ':' + data : data);
	}

	if (Buffer.isBuffer(data)) {
		return JSON.stringify(':base64:' + data.toString('base64'));
	}

	if (data?.toJSON) {
		data = data.toJSON();
	}

	if (typeof data === 'object') {
		let s = '';
		const array = Array.isArray(data);
		s = array ? '[' : '{';
		let first = true;

		// eslint-disable-next-line guard-for-in
		for (const k in data) {
			const ignore = typeof data[k] === 'function' || (!array && data[k] === undefined);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			if (!Object.hasOwn(data, k) || ignore) {
				continue;
			}

			if (!first) {
				s += ',';
			}

			first = false;
			if (array) {
				s += defaultSerialize(data[k]);
			} else if (data[k] !== undefined) {
				s += defaultSerialize(k) + ':' + defaultSerialize(data[k]);
			}
		}

		s += array ? ']' : '}';
		return s;
	}

	return JSON.stringify(data);
};

export const defaultDeserialize = <Value>(data: any) => JSON.parse(data as unknown as string, (_, value) => {
	if (typeof value === 'string') {
		if (value.startsWith(':base64:')) {
			return Buffer.from(value.slice(8), 'base64');
		}

		return value.startsWith(':') ? value.slice(1) : value;
	}

	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return value;
}) as Value;
