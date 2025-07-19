import {Buffer} from 'node:buffer';
import * as test from 'vitest';
import {defaultDeserialize, defaultSerialize} from '../src/index.js';

test.it('serialization and deserialization of string value', t => {
	const serialized = defaultSerialize({value: 'foo'});
	const deserialized = defaultDeserialize<{value: string}>(serialized);
	t.expect(deserialized.value).toBe('foo');
});

test.it('serialization and deserialization of number value', t => {
	const serialized = defaultSerialize({value: 5});
	const deserialized = defaultDeserialize<{value: number}>(serialized);
	t.expect(deserialized.value).toBe(5);
});

test.it('serialization and deserialization of boolean value', t => {
	const serialized = defaultSerialize({value: true});
	const deserialized = defaultDeserialize<{value: boolean}>(serialized);
	t.expect(deserialized.value).toBe(true);
});

test.it('serialization and deserialization of only string value', t => {
	const serialized = defaultSerialize('foo');
	t.expect(defaultDeserialize<string>(serialized)).toBe('foo');
});

test.it('serialization and deserialization of only string value with colon', t => {
	const serialized = defaultSerialize(':base64:aGVsbG8gd29ybGQ=');
	t.expect(defaultDeserialize<string>(serialized)).toBe(':base64:aGVsbG8gd29ybGQ=');
});

test.it('serialization and deserialization of object value', t => {
	const serialized = defaultSerialize({
		value: {
			foo: 'bar', bar: 5, baz: true, def: undefined, nul: null,
		},
	});
	const deserialized = defaultDeserialize<{value: {foo: string; bar: number; baz: boolean; def?: string; nul: string | undefined}}>(serialized);
	t.expect(deserialized.value).toEqual({
		foo: 'bar', bar: 5, baz: true, nul: null,
	});
});

test.it('defaultSerialize converts Buffer to base64 JSON string', t => {
	const buffer = Buffer.from('hello world', 'utf8');
	const expectedResult = JSON.stringify(':base64:' + buffer.toString('base64'));
	const result = defaultSerialize(buffer);
	t.expect(result).toBe(expectedResult);
});

test.it('serialization toJSON is called on object', t => {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const serialized = defaultSerialize({value: {toJSON: () => 'foo'}});
	const deserialized = defaultDeserialize<{value: string}>(serialized);
	t.expect(deserialized.value).toBe('foo');
});

test.it('serialization with array in array', t => {
	const serialized = defaultSerialize({value: [[1, 2], [3, 4]]});
	const deserialized = defaultDeserialize<{value: number[][]}>(serialized);
	t.expect(deserialized.value).toEqual([[1, 2], [3, 4]]);
});

test.it('defaultSerialize detects base64 on string', t => {
	const json = JSON.stringify({
		encoded: ':base64:aGVsbG8gd29ybGQ=', // "hello world" in base64
	});
	// eslint-disable-next-line @typescript-eslint/no-restricted-types
	const result = defaultDeserialize<{encoded: Buffer}>(json);
	t.expect(result.encoded.toString()).toBe('hello world');
});

test.it('defaultSerialize accepts objects created with null', t => {
	const json = Object.create(null) as Record<string, any>;
	json.someKey = 'value';

	const result = defaultSerialize(json);
	t.expect(result).toStrictEqual('{"someKey":"value"}');
});

test.it('removes the first colon from strings not prefixed by base64', t => {
	const json = JSON.stringify({
		simple: ':hello',
	});

	const result = defaultDeserialize<{simple: string}>(json);
	t.expect(result.simple).toBe('hello');
});
