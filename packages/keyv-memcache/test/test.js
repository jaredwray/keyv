import test from "ava";
import Keyv from "keyv";
import KeyvMemcache from "this";
import keyvApiTests from '@keyv/test-suite/dist/api';
import keyvValueTests from '@keyv/test-suite/dist/values';
import keyvOfficialTests from '@keyv/test-suite/dist/official';

const keyvMemcache = new KeyvMemcache("localhost:11211");
const badMemcache = new KeyvMemcache("badUri");

test.serial('keyv get / no expired', async t => {
    const keyv = new Keyv({store: keyvMemcache});

    await keyv.set('foo', 'bar');

    let val = await keyv.get('foo');

    t.is(val, 'bar');
});


test.serial('keyv clear', async t => {
    const keyv = new Keyv({store: keyvMemcache});
    await keyv.clear();
    t.is(await keyv.get('foo'), undefined);
});

test.serial('keyv get', async t => {
    const keyv = new Keyv({store: keyvMemcache});
    await keyv.clear();
    t.is(await keyv.get('foo'), undefined);
    await keyv.set('foo', 'bar');
    t.is(await keyv.get('foo'), 'bar');
});

const store = () => new KeyvMemcache();

keyvApiTests(test, Keyv, store);
keyvValueTests(test, Keyv, store);
//keyvOfficialTests(test, Keyv, store);
