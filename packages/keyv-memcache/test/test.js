import test from "ava";
import keyvTestSuite, { keyvOfficialTests } from "@keyv/test-suite";
import Keyv from "keyv";
import KeyvMemcache from "this";

const keyvMemcache = new KeyvMemcache("memcache://localhost:11211");

test.serial('connection string automatically requires storage adapter', async t => {
    const keyv = new Keyv(keyvMemcache);
    await keyv.clear();
    t.is(await keyv.get('foo'), undefined);
    await keyv.set('foo', 'bar');
    t.is(await keyv.get('foo'), 'bar');
    await keyv.clear();
});

/*
keyvOfficialTests(test, Keyv, keyvMemcache, new KeyvMemcache("badUri"));

test.serial.cb('connection errors are emitted', t => {
    const keyv = new Keyv(new KeyvMemcache("badUri"));
    keyv.on('error', () => {
        console.log("THIS WORKED")
        t.pass();
        t.end();
    });
});
*/