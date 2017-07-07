import test from 'ava';
import Keyv from '../';

test('Keyv is a function', t => {
	t.is(typeof Keyv, 'function');
});

test('Keyv cannot be invoked without \'new\'', t => {
	t.throws(() => Keyv()); // eslint-disable-line new-cap
	t.notThrows(() => new Keyv());
});
