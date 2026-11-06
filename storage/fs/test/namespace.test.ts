import Keyv from "keyv";
import { describe, expect, test } from "vitest";
import KeyvFs from "../src/index.js";
import { freshLocation, strategies } from "./helpers.js";

async function collect(store: KeyvFs): Promise<Record<string, unknown>> {
	const entries: Record<string, unknown> = {};
	for await (const [key, value] of store.iterator()) {
		entries[key as string] = value;
	}

	return entries;
}

describe.each(strategies)("%s strategy", (strategy) => {
	test("namespaces never overlap, even when one is a prefix of another", async () => {
		const location = freshLocation(strategy);
		const none = new KeyvFs({ path: location, strategy });
		const a = new KeyvFs({ path: location, strategy, namespace: "a" });
		const ab = new KeyvFs({ path: location, strategy, namespace: "a::b" });

		await none.set("a::b::x", "none");
		await a.set("b::x", "a");
		await ab.set("x", "a::b");

		expect(await none.get("a::b::x")).toBe("none");
		expect(await a.get("b::x")).toBe("a");
		expect(await ab.get("x")).toBe("a::b");
		expect(await collect(none)).toEqual({ "a::b::x": "none" });
		expect(await collect(a)).toEqual({ "b::x": "a" });
		expect(await collect(ab)).toEqual({ x: "a::b" });

		await a.clear();
		expect(await a.get("b::x")).toBeUndefined();
		expect(await ab.get("x")).toBe("a::b");
		expect(await none.get("a::b::x")).toBe("none");

		await none.clear();
		expect(await none.get("a::b::x")).toBeUndefined();
		expect(await ab.get("x")).toBe("a::b");

		await ab.clear();
		await ab.clear();
		expect(await collect(ab)).toEqual({});
		await Promise.all([none.disconnect(), a.disconnect(), ab.disconnect()]);
	});

	test("an empty namespace is the same as none", async () => {
		const location = freshLocation(strategy);
		const empty = new KeyvFs({ path: location, strategy, namespace: "" });
		const none = new KeyvFs({ path: location, strategy });
		await empty.set("k", "v");
		expect(await none.get("k")).toBe("v");
		await none.clear();
		expect(await empty.get("k")).toBeUndefined();
		await Promise.all([empty.disconnect(), none.disconnect()]);
	});

	test("namespaces set through Keyv are kept across reopening", async () => {
		const location = freshLocation(strategy);
		const users = new Keyv({ store: new KeyvFs({ path: location, strategy }), namespace: "users" });
		const posts = new Keyv({ store: new KeyvFs({ path: location, strategy }), namespace: "posts" });
		await users.set("1", { name: "Ada" });
		await posts.set("1", { title: "Hello" });
		await users.disconnect();
		await posts.disconnect();

		const reopened = new Keyv({
			store: new KeyvFs({ path: location, strategy }),
			namespace: "users",
		});
		expect(await reopened.get("1")).toEqual({ name: "Ada" });
		await reopened.clear();
		reopened.namespace = "posts";
		expect(await reopened.get("1")).toEqual({ title: "Hello" });
		await reopened.disconnect();
	});
});
