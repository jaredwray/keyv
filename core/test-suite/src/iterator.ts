import { faker } from "@faker-js/faker";
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

			// Create 5 unique key-value pairs that will expire
			const expiringKey1 = faker.string.alphanumeric(10);
			const expiringValue1 = faker.lorem.sentence();
			const expiringKey2 = faker.string.alphanumeric(10);
			const expiringValue2 = faker.lorem.sentence();
			const expiringKey3 = faker.string.alphanumeric(10);
			const expiringValue3 = faker.lorem.sentence();
			const expiringKey4 = faker.string.alphanumeric(10);
			const expiringValue4 = faker.lorem.sentence();
			const expiringKey5 = faker.string.alphanumeric(10);
			const expiringValue5 = faker.lorem.sentence();

			// Create a non-expiring key-value pair
			const nonExpiringKey = faker.string.alphanumeric(10);
			const nonExpiringValue = faker.lorem.sentence();

			// Set expiring keys with 100ms TTL
			await keyv.set(expiringKey1, expiringValue1, 100);
			await keyv.set(expiringKey2, expiringValue2, 100);
			await keyv.set(expiringKey3, expiringValue3, 100);
			await keyv.set(expiringKey4, expiringValue4, 100);
			await keyv.set(expiringKey5, expiringValue5, 100);

			// Set non-expiring key
			await keyv.set(nonExpiringKey, nonExpiringValue);

			await delay(300);
			// @ts-expect-error - iterator
			const iterator = keyv.iterator();

			// Collect all yielded entries
			const keys: string[] = [];
			const values: string[] = [];
			for await (const [key, value] of iterator) {
				keys.push(key);
				values.push(value as string);
			}

			// Should only yield the non-expired key
			t.expect(keys.length).toBe(1);
			t.expect(keys).toContain(nonExpiringKey);
			t.expect(values).toContain(nonExpiringValue);
		},
	);
};

export default keyvIteratorTests;
