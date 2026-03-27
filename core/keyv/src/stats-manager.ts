import type { IEventEmitter } from "hookified";
import type { KeyvTelemetryEvent, StatsManagerOptions } from "./types.js";

class StatsManager {
	private _hits = 0;
	private _misses = 0;
	private _sets = 0;
	private _deletes = 0;
	private _errors = 0;

	private _maxEntries: number = 1000;
	private _enabled: boolean = false;

	private readonly hitKeysMap = new Map<string, number>();
	private readonly missKeysMap = new Map<string, number>();
	private readonly setKeysMap = new Map<string, number>();
	private readonly deleteKeysMap = new Map<string, number>();
	private readonly errorKeysMap = new Map<string, number>();

	private _emitter?: IEventEmitter;
	private readonly _listeners = new Map<
		string,
		(event: KeyvTelemetryEvent) => void
	>();

	constructor(options?: StatsManagerOptions) {
		if (options?.maxEntries !== undefined) {
			this._maxEntries = options.maxEntries;
		}

		if (options?.enabled !== undefined) {
			this._enabled = options.enabled;
		}

		this.reset();

		if (options?.emitter && this._enabled === true) {
			this.subscribe(options.emitter);
		}
	}

	/**
	 * Total number of cache hits.
	 */
	public get hits(): number {
		return this._hits;
	}

	/**
	 * Total number of cache misses.
	 */
	public get misses(): number {
		return this._misses;
	}

	/**
	 * Total number of cache sets.
	 */
	public get sets(): number {
		return this._sets;
	}

	/**
	 * Total number of cache deletes.
	 */
	public get deletes(): number {
		return this._deletes;
	}

	/**
	 * Total number of cache errors.
	 */
	public get errors(): number {
		return this._errors;
	}

	/**
	 * LRU-bounded map of key to hit count.
	 */
	public get hitKeys(): Map<string, number> {
		return this.hitKeysMap;
	}

	/**
	 * LRU-bounded map of key to miss count.
	 */
	public get missKeys(): Map<string, number> {
		return this.missKeysMap;
	}

	/**
	 * LRU-bounded map of key to set count.
	 */
	public get setKeys(): Map<string, number> {
		return this.setKeysMap;
	}

	/**
	 * LRU-bounded map of key to delete count.
	 */
	public get deleteKeys(): Map<string, number> {
		return this.deleteKeysMap;
	}

	/**
	 * LRU-bounded map of key to error count.
	 */
	public get errorKeys(): Map<string, number> {
		return this.errorKeysMap;
	}

	/**
	 * Maximum number of entries per event-type LRU map.
	 * @default 1000
	 */
	public get maxEntries(): number {
		return this._maxEntries;
	}

	/**
	 * Set the maximum number of entries per event-type LRU map.
	 * @param {number} value the new maximum entries
	 */
	public set maxEntries(value: number) {
		this._maxEntries = value;
	}

	/**
	 * Whether stats tracking is enabled.
	 * @default false
	 */
	public get enabled(): boolean {
		return this._enabled;
	}

	/**
	 * Enable or disable stats tracking. If false it will unsubscribe from the events
	 * @param {boolean} value true to enable, false to disable
	 */
	public set enabled(value: boolean) {
		this._enabled = value;

		if (this._enabled === false && this._listeners.size !== 0) {
			this.unsubscribe();
		}
	}

	/**
	 * Increment the hit counter.
	 */
	public hit() {
		if (this._enabled) {
			this._hits++;
		}
	}

	/**
	 * Increment the miss counter.
	 */
	public miss() {
		if (this._enabled) {
			this._misses++;
		}
	}

	/**
	 * Increment the set counter.
	 */
	public set() {
		if (this._enabled) {
			this._sets++;
		}
	}

	/**
	 * Increment the delete counter.
	 */
	public delete() {
		if (this._enabled) {
			this._deletes++;
		}
	}

	/**
	 * Increment the error counter.
	 */
	public error() {
		if (this._enabled) {
			this._errors++;
		}
	}

	/**
	 * Build a composite key from a telemetry event.
	 * Format: "namespace:key" if namespace is present, otherwise just "key".
	 */
	public buildKeyEventName(event: KeyvTelemetryEvent): string {
		if (event.namespace && event.key) {
			return `${event.namespace}:${event.key}`;
		}

		return event.key ?? "";
	}

	/**
	 * Increment the count for a key in an LRU-bounded map.
	 * Deletes and re-inserts to maintain LRU order, evicts the oldest entry when full.
	 */
	public incrementKeys(map: Map<string, number>, compositeKey: string): void {
		if (this.maxEntries <= 0 || !compositeKey) {
			return;
		}

		const current = map.get(compositeKey) ?? 0;
		map.delete(compositeKey);
		map.set(compositeKey, current + 1);
		if (map.size > this.maxEntries) {
			const first = map.keys().next().value;
			if (first !== undefined) {
				map.delete(first);
			}
		}
	}

	/**
	 * Subscribe to telemetry events from an emitter (e.g. a Keyv instance).
	 * Automatically increments the corresponding stat counters and LRU key maps on each event.
	 * @param {IEventEmitter} emitter the event emitter to subscribe to
	 */
	public subscribe(emitter: IEventEmitter): void {
		this.unsubscribe();

		this._emitter = emitter;

		const hitListener = (event: KeyvTelemetryEvent) => {
			this.hit();
			this.incrementKeys(this.hitKeysMap, this.buildKeyEventName(event));
		};

		const missListener = (event: KeyvTelemetryEvent) => {
			this.miss();
			this.incrementKeys(this.missKeysMap, this.buildKeyEventName(event));
		};

		const setListener = (event: KeyvTelemetryEvent) => {
			this.set();
			this.incrementKeys(this.setKeysMap, this.buildKeyEventName(event));
		};

		const deleteListener = (event: KeyvTelemetryEvent) => {
			this.delete();
			this.incrementKeys(this.deleteKeysMap, this.buildKeyEventName(event));
		};

		const errorListener = (event: KeyvTelemetryEvent) => {
			this.error();
			this.incrementKeys(this.errorKeysMap, this.buildKeyEventName(event));
		};

		this._listeners.set("stat:hit", hitListener);
		this._listeners.set("stat:miss", missListener);
		this._listeners.set("stat:set", setListener);
		this._listeners.set("stat:delete", deleteListener);
		this._listeners.set("stat:error", errorListener);

		emitter.on("stat:hit", hitListener);
		emitter.on("stat:miss", missListener);
		emitter.on("stat:set", setListener);
		emitter.on("stat:delete", deleteListener);
		emitter.on("stat:error", errorListener);
	}

	/**
	 * Unsubscribe from the currently subscribed emitter, removing all telemetry event listeners.
	 */
	public unsubscribe(): void {
		if (!this._emitter) {
			return;
		}

		for (const [eventName, listener] of this._listeners) {
			this._emitter.off(eventName, listener);
		}

		this._listeners.clear();
		this._emitter = undefined;
	}

	/**
	 * Reset all counters and LRU key maps to their initial state.
	 */
	public reset() {
		this._hits = 0;
		this._misses = 0;
		this._sets = 0;
		this._deletes = 0;
		this._errors = 0;
		this.hitKeysMap.clear();
		this.missKeysMap.clear();
		this.setKeysMap.clear();
		this.deleteKeysMap.clear();
		this.errorKeysMap.clear();
	}
}

export default StatsManager;
