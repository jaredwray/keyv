const test = require("ava");
const Keyv = require("keyv");
const KeyvMemcache = require("this");

const kvat = require("@keyv/test-suite");

const snooze = ms => new Promise(resolve => setTimeout(resolve, ms));

//handle all the tests with listeners.
require('events').EventEmitter.prototype._maxListeners = 200;

const uri = "localhost:11211";
const keyvMemcache = new KeyvMemcache(uri);

test.serial('keyv get / no expired', async t => {
    const keyv = new Keyv({store: keyvMemcache});

    await keyv.set('foo', 'bar');

    let val = await keyv.get('foo');

    t.is(val, 'bar');
});


test.serial('testing defaults', async t => {
    const m = new KeyvMemcache();
    t.is(m.opts.url, 'localhost:11211');
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

test('get namespace', t => {
    const keyv = new Keyv({store: keyvMemcache});
    t.is(keyvMemcache._getNamespace(), 'namespace:keyv');
});
test('format key for no namespace', t => {
    t.is(new KeyvMemcache(uri).formatKey("foo"), 'foo');
});

test('format key for namespace', t => {
    const keyv = new Keyv({store: keyvMemcache});
    t.is(keyvMemcache.formatKey("foo"), 'keyv:foo');
});

test.serial('keyv get with namespace', async t => {
    const keyv1 = new Keyv({store: keyvMemcache, namespace: "keyv1"});
    const keyv2 = new Keyv({store: keyvMemcache, namespace: "2"});

    await keyv1.set('foo', 'bar');
    t.is(await keyv1.get('foo'), 'bar');

    await keyv2.set('foo', 'bar2');
    t.is(await keyv2.get('foo'), 'bar2');

});

test.serial('keyv get / should still exist', async t => {
    const keyv = new Keyv({store: keyvMemcache});

    await keyv.set('foo-expired', 'bar-expired', 4000);

    await snooze(3000);

    let val = await keyv.get('foo-expired');

    t.is(val, "bar-expired");
});

test.serial('keyv get / expired existing', async t => {
    const keyv = new Keyv({store: keyvMemcache});

    await keyv.set('foo-expired', 'bar-expired', 2000);

    await snooze(3000);

    let val = await keyv.get('foo-expired');

    t.is(val, undefined);
});

test.serial('keyv get / expired existing with bad number', async t => {
    const keyv = new Keyv({store: keyvMemcache});

    await keyv.set('foo-expired', 'bar-expired', 1);

    await snooze(1000);

    let val = await keyv.get('foo-expired');

    t.is(val, undefined);
});

test.serial('keyv get / expired', async t => {
    const keyv = new Keyv({store: keyvMemcache});

    await keyv.set('foo-expired', 'bar-expired', 1000);

    await snooze(1000);

    let val = await keyv.get('foo-expired');

    t.is(val, undefined);
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
    var opts = { logger: { log: function(){}}};
    const keyv = new Keyv({store: new KeyvMemcache("baduri:11211", opts)});

    keyv.on("error", (error) => {

        t.pass();
        t.end();
    });
    
    try {
    await keyv.delete("foo");
    } catch (err) {}
}));

test.cb('set should emit an error', timeout( 1000, async t => {
    var opts = { logger: { log: function(){}}};
    const keyv = new Keyv({store: new KeyvMemcache("baduri:11211", opts)});

    keyv.on("error", (error) => {

        t.pass();
        t.end();
    });
    
    try {
    await keyv.set("foo", "bar");
    } catch (err) {}
}));

test.cb('get should emit an error', timeout( 1000, async t => {
    var opts = { logger: { log: function(){}}};
    const keyv = new Keyv({store: new KeyvMemcache("baduri:11211", opts)});

    keyv.on("error", (error) => {
        t.pass();
        t.end();
    });
    
    try {
    await keyv.get("foo");
    } catch (err) {}
}));

const store = () => keyvMemcache;

kvat.keyvApiTests(test, Keyv, store);
kvat.keyvValueTests(test, Keyv, store);

