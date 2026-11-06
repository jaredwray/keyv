import Keyv from "keyv";
import { describe, expect, test } from "vitest";
import KeyvFs from "../src/index.js";
import { freshLocation, strategies } from "./helpers.js";

const hostileKeys = [
	"",
	"'",
	'"',
	"a\nb",
	"a\r\nb",
	"../../etc/passwd",
	"..",
	"/absolute",
	"C:\\windows",
	"CON",
	"nul",
	"k".repeat(10_000),
	"emoji 🎉",
	"\ud800",
	"\ud801",
	"Key",
	"key",
	"__proto__",
	"constructor",
	"\u0000",
	"a::b",
];

const hostileValues = [
	"",
	"line\nbreak",
	'{"value":"json"}',
	"\u2028\u2029",
	"lone \ud800 surrogate",
	"x".repeat(1024 * 1024),
];

describe.each(strategies)("%s strategy", (strategy) => {
	test("any string works as a key, and every key stays separate", async () => {
		const location = freshLocation(strategy);
		const store = new KeyvFs({ path: location, strategy });
		await store.setMany(hostileKeys.map((key, index) => ({ key, value: `value ${index}` })));
		await store.disconnect();

		const reopened = new KeyvFs({ path: location, strategy });
		expect(await reopened.getMany(hostileKeys)).toEqual(
			hostileKeys.map((_, index) => `value ${index}`),
		);
		const iterated = new Map<string, unknown>();
		for await (const [key, value] of reopened.iterator()) {
			iterated.set(key as string, value);
		}

		expect(iterated.size).toBe(hostileKeys.length);
		for (const [index, key] of hostileKeys.entries()) {
			expect(iterated.get(key)).toBe(`value ${index}`);
		}

		await reopened.disconnect();
	});

	test("string values round-trip exactly", async () => {
		const location = freshLocation(strategy);
		const store = new KeyvFs({ path: location, strategy });
		await store.setMany(hostileValues.map((value, index) => ({ key: `k${index}`, value })));
		await store.disconnect();

		const reopened = new KeyvFs({ path: location, strategy });
		const values = await reopened.getMany(hostileValues.map((_, index) => `k${index}`));
		expect(values).toEqual(hostileValues);
		await reopened.disconnect();
	});

	test("raw values keep their types, and undefined is stored", async () => {
		const location = freshLocation(strategy);
		const store = new KeyvFs({ path: location, strategy });
		const value = {
			value: { big: 9007199254740993n, buffer: Buffer.from("bytes"), date: new Date(0) },
			expires: undefined,
		};
		await store.set("raw", value);
		await store.set("undefined", undefined);
		await store.disconnect();

		const reopened = new KeyvFs({ path: location, strategy });
		const stored = (await reopened.get("raw")) as {
			value: { big: bigint; buffer: Uint8Array; date: string };
		};
		expect(stored.value.big).toBe(9007199254740993n);
		expect(Buffer.from(stored.value.buffer).toString()).toBe("bytes");
		expect(stored.value.date).toBe("1970-01-01T00:00:00.000Z");
		expect(await reopened.has("undefined")).toBe(true);
		expect(await reopened.get("undefined")).toBeUndefined();
		const entries: unknown[] = [];
		for await (const entry of reopened.iterator()) {
			entries.push(entry);
		}

		expect(entries).toContainEqual(["undefined", undefined]);
		await reopened.disconnect();
	});

	test("returned objects are copies", async () => {
		const store = new KeyvFs({ path: freshLocation(strategy), strategy });
		await store.set("obj", { value: { n: 1 } });
		const first = (await store.get("obj")) as { value: { n: number } };
		first.value.n = 2;
		expect(await store.get("obj")).toEqual({ value: { n: 1 } });
		await store.disconnect();
	});

	test("works through Keyv with every value type", async () => {
		const keyv = new Keyv({ store: new KeyvFs({ path: freshLocation(strategy), strategy }) });
		const values = [false, null, 0, "s", { a: [1, 2] }, [1, "two"]];
		for (const [index, value] of values.entries()) {
			await keyv.set(`k${index}`, value);
			expect(await keyv.get(`k${index}`)).toEqual(value);
		}

		await keyv.disconnect();
	});
});
