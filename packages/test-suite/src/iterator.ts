import type KeyvModule from "keyv";
import type * as Vitest from "vitest";
import { delay } from "./helper.js";
import type { KeyvStoreFn } from "./types.js";

const keyvIteratorTests = (
	test: typeof Vitest,
	Keyv: typeof KeyvModule,
	store: KeyvStoreFn,
) => {
	test.beforeEach(async () => {
		const keyv = new Keyv({ store: store() });
		await keyv.clear();
	});

	test.it(".iterator() returns an asyncIterator", (t) => {
		const keyv = new Keyv({ store: store() });
		// @ts-expect-error - iterator
		t.expect(typeof keyv.iterator()[Symbol.asyncIterator]).toBe("function");
	});

	test.it("iterator() iterates over all values", async (t) => {
		const keyv = new Keyv({ store: store() });
		const map = new Map(
			Array.from({ length: 5 })
				.fill(0)
				.map((_x, i) => [String(i), String(i + 10)]),
		);
		const toResolve = [];
		for (const [key, value] of map) {
			toResolve.push(keyv.set(key, value));
		}

		await Promise.all(toResolve);
		t.expect.assertions(map.size);
		// @ts-expect-error - iterator
		for await (const [key, value] of keyv.iterator()) {
			const doesKeyExist = map.has(key);
			const isValueSame = map.get(key) === value;
			t.expect(doesKeyExist && isValueSame).toBeTruthy();
		}
	});

	test.it(
		"iterator() doesn't yield values from other namespaces",
		async (t) => {
			const keyvStore = store();

			const keyv1 = new Keyv({ store: keyvStore, namespace: "keyv1" });
			const map1 = new Map(
				Array.from({ length: 5 })
					.fill(0)
					.map((_x, i) => [String(i), String(i + 10)]),
			);
			const toResolve = [];
			for (const [key, value] of map1) {
				toResolve.push(keyv1.set(key, value));
			}

			await Promise.all(toResolve);

			const keyv2 = new Keyv({ store: keyvStore, namespace: "keyv2" });
			const map2 = new Map(
				Array.from({ length: 5 })
					.fill(0)
					.map((_x, i) => [String(i), String(i + 11)]),
			);
			toResolve.length = 0;
			for (const [key, value] of map2) {
				toResolve.push(keyv2.set(key, value));
			}

			await Promise.all(toResolve);
			t.expect.assertions(map2.size);
			// @ts-expect-error - iterator
			for await (const [key, value] of keyv2.iterator()) {
				const doesKeyExist = map2.has(key);
				const isValueSame = map2.get(key) === value;
				t.expect(doesKeyExist && isValueSame).toBeTruthy();
			}
		},
	);

	test.it(
		"iterator() doesn't yield expired values, and deletes them",
		async (t) => {
			const keyv = new Keyv({ store: store() });
			const map = new Map(
				Array.from({ length: 5 })
					.fill(0)
					.map((_x, i) => [String(i), String(i + 10)]),
			);
			const toResolve = [];
			for (const [key, value] of map) {
				toResolve.push(keyv.set(key, value, 200));
			}

			const nonExpiringKey = `foo-${Date.now()}`;
			toResolve.push(keyv.set(nonExpiringKey, "bar"));

			await Promise.all(toResolve);
			await delay(250);
			// @ts-expect-error - iterator
			const iterator = keyv.iterator();

			// Collect all yielded entries (order is not guaranteed)
			const entries: Array<[string, string]> = [];
			for await (const entry of iterator) {
				entries.push(entry);
			}

			// Should only yield the non-expired key
			t.expect(entries.length).toBe(1);
			t.expect(entries[0][0]).toBe(nonExpiringKey);
			t.expect(entries[0][1]).toBe("bar");
		},
	);
};

export default keyvIteratorTests;
