import {describe, test, expectTypeOf} from 'vitest';
import KeyvRedis from '../src/index.js';

describe('KeyvRedis Types', () => {
	test('should be able to set adapter-level generic value type', async () => {
		type Value = {foo: string};

		const keyvRedis = new KeyvRedis<Value>();

		expectTypeOf(keyvRedis.get('foo')).toEqualTypeOf<
			Promise<Value | undefined>
		>();

		expectTypeOf(keyvRedis.getMany(['foo', 'bar'])).toEqualTypeOf<
			Promise<Array<Value | undefined>>
		>();

		expectTypeOf(keyvRedis.iterator()).toEqualTypeOf<
			AsyncGenerator<[string, Value | undefined], void, unknown>
		>();
	});

	test('should be able to set method-level generic value type', async () => {
		type ValueFoo = {foo: string};

		type ValueBar = {bar: string};

		const keyvRedis = new KeyvRedis<ValueFoo>();

		expectTypeOf(keyvRedis.get<ValueBar>('foo')).toEqualTypeOf<
			Promise<ValueBar | undefined>
		>();

		expectTypeOf(keyvRedis.getMany<ValueBar>(['foo', 'bar'])).toEqualTypeOf<
			Promise<Array<ValueBar | undefined>>
		>();

		expectTypeOf(keyvRedis.iterator<ValueBar>()).toEqualTypeOf<
			AsyncGenerator<[string, ValueBar | undefined], void, unknown>
		>();
	});
});
