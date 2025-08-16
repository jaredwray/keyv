import type KeyvModule from "keyv";
import type * as Vitest from "vitest";
import type { KeyvStoreFn } from "./types";

const keyvNamespaceTests = (
	test: typeof Vitest,
	Keyv: typeof KeyvModule,
	store: KeyvStoreFn,
) => {
	test.beforeEach(async () => {
		const keyv1 = new Keyv({ store: store(), namespace: "keyv1" });
		const keyv2 = new Keyv({ store: store(), namespace: "keyv2" });
		await keyv1.clear();
		await keyv2.clear();
	});

	test.it("namespaced set/get don't collide", async (t) => {
		const keyv1 = new Keyv({ store: store(), namespace: "keyv1" });
		const keyv2 = new Keyv({ store: store(), namespace: "keyv2" });
		await keyv1.set("foo", "keyv1");
		await keyv2.set("foo", "keyv2");
		t.expect(await keyv1.get("foo")).toBe("keyv1");
		t.expect(await keyv2.get("foo")).toBe("keyv2");
	});

	test.it(
		"namespaced delete only deletes from current namespace",
		async (t) => {
			const keyv1 = new Keyv({ store: store(), namespace: "keyv1" });
			const keyv2 = new Keyv({ store: store(), namespace: "keyv2" });
			await keyv1.set("foo", "keyv1");
			await keyv2.set("foo", "keyv2");
			t.expect(await keyv1.delete("foo")).toBe(true);
			t.expect(await keyv1.get("foo")).toBeUndefined();
			t.expect(await keyv2.get("foo")).toBe("keyv2");
		},
	);

	test.it("namespaced clear only clears current namespace", async (t) => {
		const keyv1 = new Keyv({ store: store(), namespace: "keyv1" });
		const keyv2 = new Keyv({ store: store(), namespace: "keyv2" });
		await keyv1.set("foo", "keyv1");
		await keyv1.set("bar", "keyv1");
		await keyv2.set("foo", "keyv2");
		await keyv2.set("bar", "keyv2");
		await keyv1.clear();
		t.expect(await keyv1.get("foo")).toBeUndefined();
		t.expect(await keyv1.get("bar")).toBeUndefined();
		t.expect(await keyv2.get("foo")).toBe("keyv2");
		t.expect(await keyv2.get("bar")).toBe("keyv2");
	});

	test.afterEach(async () => {
		const keyv1 = new Keyv({ store: store(), namespace: "keyv1" });
		const keyv2 = new Keyv({ store: store(), namespace: "keyv2" });
		await keyv1.clear();
		await keyv2.clear();
	});
};

export default keyvNamespaceTests;
