// @vitest-environment happy-dom
// biome-ignore-all lint/suspicious/noExplicitAny: test file accessing globals dynamically
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type Keyv from "../src/index.js";

// Strip Buffer to verify the btoa/atob fallback path in the serializer.
// We keep process because hookified (and vitest internals) reference it;
// in a real browser, bundlers shim or strip process references.
const originalBuffer = globalThis.Buffer;

beforeAll(() => {
	delete (globalThis as any).Buffer;

	return () => {
		(globalThis as any).Buffer = originalBuffer;
	};
});

describe("browser runtime - import", () => {
	test("can import Keyv", async () => {
		const { default: Keyv } = await import("../src/index.js");
		expect(Keyv).toBeDefined();
	});

	test("can import KeyvGenericStore and createKeyv", async () => {
		const { KeyvGenericStore, createKeyv } = await import(
			"../src/generic-store.js"
		);
		expect(KeyvGenericStore).toBeDefined();
		expect(createKeyv).toBeDefined();
	});
});

describe("browser runtime - core operations", () => {
	let keyv: Keyv;

	beforeEach(async () => {
		const { default: Keyv } = await import("../src/index.js");
		keyv = new Keyv();
	});

	test("set and get", async () => {
		await keyv.set("foo", "bar");
		expect(await keyv.get("foo")).toBe("bar");
	});

	test("delete", async () => {
		await keyv.set("foo", "bar");
		expect(await keyv.delete("foo")).toBe(true);
		expect(await keyv.get("foo")).toBeUndefined();
	});

	test("clear", async () => {
		await keyv.set("a", 1);
		await keyv.set("b", 2);
		await keyv.clear();
		expect(await keyv.get("a")).toBeUndefined();
		expect(await keyv.get("b")).toBeUndefined();
	});

	test("has", async () => {
		await keyv.set("exists", "yes");
		expect(await keyv.has("exists")).toBe(true);
		expect(await keyv.has("missing")).toBe(false);
	});

	test("getMany", async () => {
		await keyv.set("a", 1);
		await keyv.set("b", 2);
		const values = await keyv.get(["a", "b", "c"]);
		expect(values).toEqual([1, 2, undefined]);
	});

	test("TTL expiration", async () => {
		vi.useFakeTimers();
		await keyv.set("temp", "value", 10);
		vi.advanceTimersByTime(20);
		expect(await keyv.get("temp")).toBeUndefined();
		vi.useRealTimers();
	});
});

describe("browser runtime - serializer without Buffer", () => {
	test("Buffer is not available", () => {
		expect((globalThis as any).Buffer).toBeUndefined();
	});

	test("serializer handles strings", async () => {
		const { default: Keyv } = await import("../src/index.js");
		const keyv = new Keyv();
		await keyv.set("str", "hello world");
		expect(await keyv.get("str")).toBe("hello world");
	});

	test("serializer handles objects", async () => {
		const { default: Keyv } = await import("../src/index.js");
		const keyv = new Keyv();
		const obj = { name: "test", nested: { value: 42 } };
		await keyv.set("obj", obj);
		expect(await keyv.get("obj")).toEqual(obj);
	});

	test("serializer handles Uint8Array via btoa/atob fallback", async () => {
		const { jsonSerializer } = await import("../src/index.js");
		const data = new Uint8Array([72, 101, 108, 108, 111]);
		const serialized = jsonSerializer.stringify(data);
		const deserialized = jsonSerializer.parse<Uint8Array>(serialized);
		expect(deserialized).toBeInstanceOf(Uint8Array);
		expect(Array.from(deserialized)).toEqual([72, 101, 108, 108, 111]);
	});

	test("serializer handles BigInt", async () => {
		const { jsonSerializer } = await import("../src/index.js");
		const big = BigInt("9007199254740993");
		const serialized = jsonSerializer.stringify(big);
		const deserialized = jsonSerializer.parse<bigint>(serialized);
		expect(deserialized).toBe(big);
	});
});
