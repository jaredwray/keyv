import test from 'ava';
import Keyv from '../src/index';

test('object exists', t => {
	const keyv = new Keyv();
	t.truthy(keyv);
});
