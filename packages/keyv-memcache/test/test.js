import test from "ava";
import Keyv from "keyv";
import KeyvMemcache from "this";
import keyvApiTests from '@keyv/test-suite/dist/api';
import keyvValueTests from '@keyv/test-suite/dist/values';

const keyvMemcache = new KeyvMemcache("localhost:11211");

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

function timeout (ms, fn) {
    return function (t) {
        setTimeout(() => {
            t.fail("Timeout error!")
            t.end()
        }, ms)
        fn(t)
    }
 }

test.cb('clear should emit an error', timeout( 1000, async t => {
    const keyv = new Keyv({store: new KeyvMemcache("baduri:11211")});

    keyv.on("error", (error) => {

        t.pass();
        t.end();
    });
    
    try {
    await keyv.clear();
    } catch (err) {}
}));

test.cb('delete should emit an error', timeout( 1000, async t => {
    const keyv = new Keyv({store: new KeyvMemcache("baduri:11211")});

    keyv.on("error", (error) => {

        t.pass();
        t.end();
    });
    
    try {
    await keyv.delete("foo");
    } catch (err) {}
}));

test.cb('set should emit an error', timeout( 1000, async t => {
    const keyv = new Keyv({store: new KeyvMemcache("baduri:11211")});

    keyv.on("error", (error) => {

        t.pass();
        t.end();
    });
    
    try {
    await keyv.set("foo", "bar");
    } catch (err) {}
}));

test.cb('get should emit an error', timeout( 1000, async t => {
    const keyv = new Keyv({store: new KeyvMemcache("baduri:11211")});

    keyv.on("error", (error) => {

        t.pass();
        t.end();
    });
    
    try {
    await keyv.get("foo");
    } catch (err) {}
}));

const store = () => new KeyvMemcache();

keyvApiTests(test, Keyv, store);
keyvValueTests(test, Keyv, store);

