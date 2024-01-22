import test from 'ava';
import KeyvMemcache from '@keyv/memcache';
import Keyv from '../src';

const keyvMemcache = new KeyvMemcache('localhost:11211');

// eslint-disable-next-line no-promise-executor-return
const snooze = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test.serial('Keyv has should return if adapter does not support has on expired', async t => {
	const keyv = new Keyv({store: new Map()});
    keyv.opts.store.has = undefined;
	await keyv.set('foo', 'bar', 1000);
	t.is(await keyv.has('foo'), true);
	await snooze(1100);
	t.is(await keyv.has('foo'), false);
});