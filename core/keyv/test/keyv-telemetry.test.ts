import { describe, expect, it, vi } from "vitest";
import type { KeyvTelemetryEvent } from "../src/index.js";
import { Keyv, KeyvEvents } from "../src/index.js";

describe("Keyv Telemetry Events", () => {
	it("should emit stat:set on set()", async () => {
		const keyv = new Keyv({ stats: true });
		const listener = vi.fn();
		keyv.on(KeyvEvents.STAT_SET, listener);

		await keyv.set("key1", "value1");

		expect(listener).toHaveBeenCalledOnce();
		const payload = listener.mock.calls[0][0] as KeyvTelemetryEvent;
		expect(payload.event).toBe("set");
		expect(payload.key).toBe("key1");
		expect(payload.timestamp).toBeTypeOf("number");
	});

	it("should emit stat:hit on get() cache hit", async () => {
		const keyv = new Keyv({ stats: true });
		const listener = vi.fn();
		keyv.on(KeyvEvents.STAT_HIT, listener);

		await keyv.set("key1", "value1");
		await keyv.get("key1");

		expect(listener).toHaveBeenCalledOnce();
		const payload = listener.mock.calls[0][0] as KeyvTelemetryEvent;
		expect(payload.event).toBe("hit");
		expect(payload.key).toBe("key1");
	});

	it("should emit stat:miss on get() cache miss", async () => {
		const keyv = new Keyv({ stats: true });
		const listener = vi.fn();
		keyv.on(KeyvEvents.STAT_MISS, listener);

		await keyv.get("nonexistent");

		expect(listener).toHaveBeenCalledOnce();
		const payload = listener.mock.calls[0][0] as KeyvTelemetryEvent;
		expect(payload.event).toBe("miss");
		expect(payload.key).toBe("nonexistent");
	});

	it("should emit stat:miss on get() when data is expired", async () => {
		const keyv = new Keyv({ stats: true });
		const listener = vi.fn();
		keyv.on(KeyvEvents.STAT_MISS, listener);

		await keyv.set("key1", "value1", 1);
		await new Promise((resolve) => {
			setTimeout(resolve, 50);
		});
		await keyv.get("key1");

		expect(listener).toHaveBeenCalled();
		const calls = listener.mock.calls.filter(
			(call: KeyvTelemetryEvent[]) => call[0].key === "key1",
		);
		expect(calls.length).toBeGreaterThanOrEqual(1);
	});

	it("should emit stat:delete on delete()", async () => {
		const keyv = new Keyv({ stats: true });
		const listener = vi.fn();
		keyv.on(KeyvEvents.STAT_DELETE, listener);

		await keyv.set("key1", "value1");
		await keyv.delete("key1");

		expect(listener).toHaveBeenCalledOnce();
		const payload = listener.mock.calls[0][0] as KeyvTelemetryEvent;
		expect(payload.event).toBe("delete");
		expect(payload.key).toBe("key1");
	});

	it("should emit per-key hit/miss on getMany()", async () => {
		const keyv = new Keyv({ stats: true });
		const hitListener = vi.fn();
		const missListener = vi.fn();
		keyv.on(KeyvEvents.STAT_HIT, hitListener);
		keyv.on(KeyvEvents.STAT_MISS, missListener);

		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		// key3 does not exist
		await keyv.get(["key1", "key2", "key3"]);

		expect(hitListener).toHaveBeenCalledTimes(2);
		expect(missListener).toHaveBeenCalledTimes(1);

		const hitKeys = hitListener.mock.calls.map((call: KeyvTelemetryEvent[]) => call[0].key);
		expect(hitKeys).toContain("key1");
		expect(hitKeys).toContain("key2");

		const missPayload = missListener.mock.calls[0][0] as KeyvTelemetryEvent;
		expect(missPayload.key).toBe("key3");
	});

	it("should emit stat:hit on getRaw() cache hit", async () => {
		const keyv = new Keyv({ stats: true });
		const listener = vi.fn();
		keyv.on(KeyvEvents.STAT_HIT, listener);

		await keyv.set("key1", "value1");
		await keyv.getRaw("key1");

		expect(listener).toHaveBeenCalledOnce();
		const payload = listener.mock.calls[0][0] as KeyvTelemetryEvent;
		expect(payload.event).toBe("hit");
		expect(payload.key).toBe("key1");
	});

	it("should emit stat:miss on getRaw() cache miss", async () => {
		const keyv = new Keyv({ stats: true });
		const listener = vi.fn();
		keyv.on(KeyvEvents.STAT_MISS, listener);

		await keyv.getRaw("nonexistent");

		expect(listener).toHaveBeenCalledOnce();
		const payload = listener.mock.calls[0][0] as KeyvTelemetryEvent;
		expect(payload.event).toBe("miss");
		expect(payload.key).toBe("nonexistent");
	});

	it("should emit per-key hit/miss on getManyRaw()", async () => {
		const keyv = new Keyv({ stats: true });
		const hitListener = vi.fn();
		const missListener = vi.fn();
		keyv.on(KeyvEvents.STAT_HIT, hitListener);
		keyv.on(KeyvEvents.STAT_MISS, missListener);

		await keyv.set("key1", "value1");
		await keyv.getManyRaw(["key1", "missing"]);

		expect(hitListener).toHaveBeenCalledOnce();
		expect(missListener).toHaveBeenCalledOnce();
		expect((hitListener.mock.calls[0][0] as KeyvTelemetryEvent).key).toBe("key1");
		expect((missListener.mock.calls[0][0] as KeyvTelemetryEvent).key).toBe("missing");
	});

	it("should emit stat:set on setRaw()", async () => {
		const keyv = new Keyv({ stats: true });
		const listener = vi.fn();
		keyv.on(KeyvEvents.STAT_SET, listener);

		await keyv.setRaw("key1", { value: "value1" });

		expect(listener).toHaveBeenCalledOnce();
		const payload = listener.mock.calls[0][0] as KeyvTelemetryEvent;
		expect(payload.event).toBe("set");
		expect(payload.key).toBe("key1");
	});

	it("should emit stat:error on store error", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing with Map as store
		const errorStore = new Map() as any;
		const keyv = new Keyv({ store: errorStore, stats: true });
		keyv.on("error", () => {}); // suppress unhandled error

		const listener = vi.fn();
		keyv.on(KeyvEvents.STAT_ERROR, listener);

		// Force an error by making store.get throw
		errorStore.get = () => {
			throw new Error("store error");
		};

		await keyv.get("key1");

		expect(listener).toHaveBeenCalledOnce();
		const payload = listener.mock.calls[0][0] as KeyvTelemetryEvent;
		expect(payload.event).toBe("error");
		expect(payload.key).toBe("key1");
	});

	it("should include namespace in telemetry payload", async () => {
		const keyv = new Keyv({ namespace: "test-ns", stats: true });
		const listener = vi.fn();
		keyv.on(KeyvEvents.STAT_SET, listener);

		await keyv.set("key1", "value1");

		const payload = listener.mock.calls[0][0] as KeyvTelemetryEvent;
		expect(payload.namespace).toBe("test-ns");
	});

	it("should have correct payload shape for all events", async () => {
		const keyv = new Keyv({ namespace: "shape-test", stats: true });
		const events: KeyvTelemetryEvent[] = [];

		keyv.on(KeyvEvents.STAT_SET, (e: KeyvTelemetryEvent) => events.push(e));
		keyv.on(KeyvEvents.STAT_HIT, (e: KeyvTelemetryEvent) => events.push(e));
		keyv.on(KeyvEvents.STAT_MISS, (e: KeyvTelemetryEvent) => events.push(e));
		keyv.on(KeyvEvents.STAT_DELETE, (e: KeyvTelemetryEvent) => events.push(e));

		await keyv.set("key1", "value1");
		await keyv.get("key1");
		await keyv.get("nonexistent");
		await keyv.delete("key1");

		expect(events.length).toBe(4);
		for (const event of events) {
			expect(event.event).toBeTypeOf("string");
			expect(event.key).toBeTypeOf("string");
			expect(event.namespace).toBe("shape-test");
			expect(event.timestamp).toBeTypeOf("number");
			expect(event.timestamp).toBeGreaterThan(0);
		}
	});

	it("should emit telemetry events even when stats are disabled", async () => {
		const keyv = new Keyv({ stats: false });
		const listener = vi.fn();
		keyv.on(KeyvEvents.STAT_SET, listener);

		await keyv.set("key1", "value1");

		expect(listener).toHaveBeenCalledOnce();
	});

	it("should track correct per-key stats with getMany (bug fix validation)", async () => {
		const keyv = new Keyv({ stats: true });

		await keyv.set("a", 1);
		await keyv.set("b", 2);
		await keyv.set("c", 3);

		keyv.stats.reset();
		await keyv.get(["a", "b", "c"]);

		expect(keyv.stats.hits).toBe(3);
		expect(keyv.stats.misses).toBe(0);
	});

	it("should track per-key misses with getMany", async () => {
		const keyv = new Keyv({ stats: true });

		await keyv.set("a", 1);
		keyv.stats.reset();

		await keyv.get(["a", "missing1", "missing2"]);

		expect(keyv.stats.hits).toBe(1);
		expect(keyv.stats.misses).toBe(2);
	});

	it("should emit per-key stat:set on setMany()", async () => {
		const keyv = new Keyv({ stats: true });
		const listener = vi.fn();
		keyv.on(KeyvEvents.STAT_SET, listener);

		await keyv.setMany([
			{ key: "a", value: 1 },
			{ key: "b", value: 2 },
			{ key: "c", value: 3 },
		]);

		expect(listener).toHaveBeenCalledTimes(3);
		const keys = listener.mock.calls.map((call: KeyvTelemetryEvent[]) => call[0].key);
		expect(keys).toContain("a");
		expect(keys).toContain("b");
		expect(keys).toContain("c");
	});

	it("should emit per-key stat:error on setMany() failure", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing with Map as store
		const errorStore = new Map() as any;
		errorStore.setMany = () => {
			throw new Error("store error");
		};
		const keyv = new Keyv({ store: errorStore, stats: true });
		keyv.on("error", () => {}); // suppress unhandled error

		const listener = vi.fn();
		keyv.on(KeyvEvents.STAT_ERROR, listener);

		await keyv.setMany([
			{ key: "a", value: 1 },
			{ key: "b", value: 2 },
		]);

		expect(listener).toHaveBeenCalledTimes(2);
		for (const call of listener.mock.calls) {
			const payload = call[0] as KeyvTelemetryEvent;
			expect(payload.event).toBe("error");
			expect(payload.key).toBeTypeOf("string");
			expect(payload).not.toHaveProperty("keys");
		}
	});

	it("should emit per-key stat:delete on deleteMany()", async () => {
		const keyv = new Keyv({ stats: true });
		const listener = vi.fn();
		keyv.on(KeyvEvents.STAT_DELETE, listener);

		await keyv.set("a", 1);
		await keyv.set("b", 2);
		await keyv.set("c", 3);
		await keyv.delete(["a", "b", "c"]);

		expect(listener).toHaveBeenCalledTimes(3);
		const keys = listener.mock.calls.map((call: KeyvTelemetryEvent[]) => call[0].key);
		expect(keys).toContain("a");
		expect(keys).toContain("b");
		expect(keys).toContain("c");
	});

	it("should emit per-key stat:error on deleteMany() failure", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing with Map as store
		const errorStore = new Map() as any;
		errorStore.deleteMany = () => {
			throw new Error("store error");
		};
		const keyv = new Keyv({ store: errorStore, stats: true });
		keyv.on("error", () => {}); // suppress unhandled error

		const listener = vi.fn();
		keyv.on(KeyvEvents.STAT_ERROR, listener);

		await keyv.delete(["x", "y"]);

		expect(listener).toHaveBeenCalledTimes(2);
		for (const call of listener.mock.calls) {
			const payload = call[0] as KeyvTelemetryEvent;
			expect(payload.event).toBe("error");
			expect(payload.key).toBeTypeOf("string");
			expect(payload).not.toHaveProperty("keys");
		}
	});

	it("should never include keys property in telemetry events", async () => {
		const keyv = new Keyv({ stats: true });
		const events: KeyvTelemetryEvent[] = [];

		keyv.on(KeyvEvents.STAT_SET, (e: KeyvTelemetryEvent) => events.push(e));
		keyv.on(KeyvEvents.STAT_HIT, (e: KeyvTelemetryEvent) => events.push(e));
		keyv.on(KeyvEvents.STAT_MISS, (e: KeyvTelemetryEvent) => events.push(e));
		keyv.on(KeyvEvents.STAT_DELETE, (e: KeyvTelemetryEvent) => events.push(e));

		await keyv.set("a", 1);
		await keyv.set("b", 2);
		await keyv.get(["a", "b", "missing"]);
		await keyv.setMany([
			{ key: "c", value: 3 },
			{ key: "d", value: 4 },
		]);
		await keyv.delete(["a", "b"]);

		expect(events.length).toBeGreaterThan(0);
		for (const event of events) {
			expect(event).not.toHaveProperty("keys");
		}
	});
});
