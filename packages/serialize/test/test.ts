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

test('serialization and deserialization of object value', t => {
	const serialized = defaultSerialize({value: {foo: 'bar', bar: 5, baz: true, def: undefined, nul: null}});
	const deserialized = defaultDeserialize<{value: {foo: string; bar: number; baz: boolean; def?: string; nul: string | undefined}}>(serialized);
	t.deepEqual(deserialized.value, {foo: 'bar', bar: 5, baz: true, nul: null});
});
