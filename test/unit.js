import test from 'ava';
import Keyv from '../';

test('Keyv is a class', t => {
	t.is(typeof Keyv, 'function');
	t.throws(() => Keyv()); // eslint-disable-line new-cap
	t.notThrows(() => new Keyv());
});

test('Keyv is an instance of Keyv', t => {
	t.true(new Keyv() instanceof Keyv);
});
