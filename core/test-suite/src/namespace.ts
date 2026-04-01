import { faker } from "@faker-js/faker";
import type KeyvModule from "keyv";
import type { KeyvStoreFn, TestFunction } from "./types.js";

const keyvNamespaceTests = (test: TestFunction, Keyv: typeof KeyvModule, store: KeyvStoreFn) => {
	test("namespaced set/get don't collide", async (t) => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const keyv1 = new Keyv({ store: store(), namespace: ns1 });
		const keyv2 = new Keyv({ store: store(), namespace: ns2 });
		const key = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const value2 = faker.lorem.sentence();
		await keyv1.set(key, value1);
		await keyv2.set(key, value2);
		t.expect(await keyv1.get(key)).toBe(value1);
		t.expect(await keyv2.get(key)).toBe(value2);
	});

	test("namespaced delete only deletes from current namespace", async (t) => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const keyv1 = new Keyv({ store: store(), namespace: ns1 });
		const keyv2 = new Keyv({ store: store(), namespace: ns2 });
		const key = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const value2 = faker.lorem.sentence();
		await keyv1.set(key, value1);
		await keyv2.set(key, value2);
		t.expect(await keyv1.delete(key)).toBe(true);
		t.expect(await keyv1.get(key)).toBeUndefined();
		t.expect(await keyv2.get(key)).toBe(value2);
	});

	test("namespaced clear only clears current namespace", async (t) => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const keyv1 = new Keyv({ store: store(), namespace: ns1 });
		const keyv2 = new Keyv({ store: store(), namespace: ns2 });
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const value2 = faker.lorem.sentence();
		await keyv1.set(key1, value1);
		await keyv1.set(key2, value1);
		await keyv2.set(key1, value2);
		await keyv2.set(key2, value2);
		await keyv1.clear();
		t.expect(await keyv1.get(key1)).toBeUndefined();
		t.expect(await keyv1.get(key2)).toBeUndefined();
		t.expect(await keyv2.get(key1)).toBe(value2);
		t.expect(await keyv2.get(key2)).toBe(value2);
	});
};

export default keyvNamespaceTests;
