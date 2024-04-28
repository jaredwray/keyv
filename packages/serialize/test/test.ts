import {Buffer} from 'node:buffer';
import test from 'ava';
import {defaultDeserialize, defaultSerialize} from '../src';

test('serialization and deserialization of string value', t => {
	const serialized = defaultSerialize({value: 'foo'});
	const deserialized = defaultDeserialize<{value: string}>(serialized);
	t.is(deserialized.value, 'foo');
});

test('serialization and deserialization of number value', t => {
	const serialized = defaultSerialize({value: 5});
	const deserialized = defaultDeserialize<{value: number}>(serialized);
	t.is(deserialized.value, 5);
});

test('serialization and deserialization of boolean value', t => {
	const serialized = defaultSerialize({value: true});
	const deserialized = defaultDeserialize<{value: boolean}>(serialized);
	t.is(deserialized.value, true);
});

test('serialization and deserialization of only string value', t => {
	const serialized = defaultSerialize('foo');
	t.is(defaultDeserialize<string>(serialized), 'foo');
});

test('serialization and deserialization of only string value with colon', t => {
	const serialized = defaultSerialize(':base64:aGVsbG8gd29ybGQ=');
	t.is(defaultDeserialize<string>(serialized), ':base64:aGVsbG8gd29ybGQ=');
});

test('serialization and deserialization of object value', t => {
	const serialized = defaultSerialize({value: {foo: 'bar', bar: 5, baz: true, def: undefined, nul: null}});
	const deserialized = defaultDeserialize<{value: {foo: string; bar: number; baz: boolean; def?: string; nul: string | undefined}}>(serialized);
	t.deepEqual(deserialized.value, {foo: 'bar', bar: 5, baz: true, nul: null});
});

test('defaultSerialize converts Buffer to base64 JSON string', t => {
	const buffer = Buffer.from('hello world', 'utf8');
	const expectedResult = JSON.stringify(':base64:' + buffer.toString('base64'));
	const result = defaultSerialize(buffer);
	t.is(result, expectedResult);
});

test('serialization toJSON is called on object', t => {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const serialized = defaultSerialize({value: {toJSON: () => 'foo'}});
	const deserialized = defaultDeserialize<{value: string}>(serialized);
	t.is(deserialized.value, 'foo');
});

test('serialization with array in array', t => {
	const serialized = defaultSerialize({value: [[1, 2], [3, 4]]});
	const deserialized = defaultDeserialize<{value: number[][]}>(serialized);
	t.deepEqual(deserialized.value, [[1, 2], [3, 4]]);
});

test('defaultSerialize detects base64 on string', t => {
	const json = JSON.stringify({
		encoded: ':base64:aGVsbG8gd29ybGQ=', // "hello world" in base64
	});
	const result = defaultDeserialize<{encoded: Buffer}>(json);
	t.is(result.encoded.toString(), 'hello world');
});

test('removes the first colon from strings not prefixed by base64', t => {
	const json = JSON.stringify({
		simple: ':hello',
	});

	const result = defaultDeserialize<{simple: string}>(json);
	t.is(result.simple, 'hello');
});
