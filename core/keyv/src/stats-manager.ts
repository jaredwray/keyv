import type { IEventEmitter } from "hookified";

class StatsManager {
	public enabled = true;

	public hits = 0;
	public misses = 0;
	public sets = 0;
	public deletes = 0;
	public errors = 0;

	constructor(enabled?: boolean) {
		if (enabled !== undefined) {
			this.enabled = enabled;
		}

		this.reset();
	}

	hit() {
		if (this.enabled) {
			this.hits++;
		}
	}

	miss() {
		if (this.enabled) {
			this.misses++;
		}
	}

	set() {
		if (this.enabled) {
			this.sets++;
		}
	}

	delete() {
		if (this.enabled) {
			this.deletes++;
		}
	}

	error() {
		if (this.enabled) {
			this.errors++;
		}
	}

	/**
	 * Subscribe to telemetry events from an emitter (e.g. a Keyv instance).
	 * Automatically increments the corresponding stat counters on each event.
	 * @param {IEventEmitter} emitter the event emitter to subscribe to
	 */
	subscribe(emitter: IEventEmitter): void {
		emitter.on("stat:hit", () => {
			this.hit();
		});
		emitter.on("stat:miss", () => {
			this.miss();
		});
		emitter.on("stat:set", () => {
			this.set();
		});
		emitter.on("stat:delete", () => {
			this.delete();
		});
		emitter.on("stat:error", () => {
			this.error();
		});
	}

	public hitsOrMisses<T>(array: Array<T | undefined>): void {
		for (const item of array) {
			if (item === undefined) {
				this.miss();
			} else {
				this.hit();
			}
		}
	}

	reset() {
		this.hits = 0;
		this.misses = 0;
		this.sets = 0;
		this.deletes = 0;
		this.errors = 0;
	}
}

export default StatsManager;
