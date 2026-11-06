type Waiter = {
	generation: number;
	/** Whether the waiter asked to save without waiting out `writeDelay`. */
	urgent: boolean;
	resolve: () => void;
	reject: (error: unknown) => void;
};

/**
 * Batches writes into saves. Each change to the in-memory store takes the next generation number
 * with {@link GroupCommit.next}, and its caller waits for that generation with
 * {@link GroupCommit.wait}. A save writes everything up to the newest generation at the moment it
 * starts, so every change made in the same tick (or within `writeDelay`) shares one save. A
 * change made while a save is running gets a later generation, and another save follows.
 */
export class GroupCommit {
	private _generation = 0;
	private _durable = 0;
	private _running = false;
	private _waiters: Waiter[] = [];
	// An urgent save is scheduled with setImmediate and is never cancelled; a delayed one can be
	// replaced by an urgent one.
	private _timer: { urgent: true } | { urgent: false; handle: NodeJS.Timeout } | undefined;
	private readonly _persist: () => Promise<void>;
	private readonly _writeDelay: number;

	/**
	 * @param persist - Saves the current in-memory store. It must take its snapshot synchronously,
	 * before its first `await`.
	 * @param writeDelay - Milliseconds to wait before a save that is not urgent.
	 */
	constructor(persist: () => Promise<void>, writeDelay: number) {
		this._persist = persist;
		this._writeDelay = writeDelay;
	}

	/** Whether changes are waiting to be saved. */
	public get pending(): boolean {
		return this._durable < this._generation;
	}

	/**
	 * Records a change. Call it in the same synchronous step that changes the in-memory store.
	 * @returns The change's generation, to pass to {@link GroupCommit.wait}.
	 */
	public next(): number {
		return ++this._generation;
	}

	/**
	 * Waits until a generation has been saved.
	 * @param generation - The generation returned by {@link GroupCommit.next}.
	 * @returns A promise that resolves once a save that includes the change finishes, or rejects
	 * if that save fails.
	 */
	public wait(generation: number): Promise<void> {
		return this.enqueue(generation, false);
	}

	/**
	 * Saves every change made so far, without waiting out `writeDelay`.
	 */
	public flush(): Promise<void> {
		return this.enqueue(this._generation, true);
	}

	private enqueue(generation: number, urgent: boolean): Promise<void> {
		if (generation <= this._durable) {
			return Promise.resolve();
		}

		const { promise, resolve, reject } = Promise.withResolvers<void>();
		this._waiters.push({ generation, urgent, resolve, reject });
		this.arm(urgent);
		return promise;
	}

	private arm(urgent: boolean): void {
		// A running save loop picks up every newer generation before it stops.
		if (this._running) {
			return;
		}

		if (this._timer) {
			if (this._timer.urgent || !urgent) {
				return;
			}

			clearTimeout(this._timer.handle);
		}

		// Both timers stay referenced, so a pending save keeps the process alive until it is done.
		if (urgent || this._writeDelay === 0) {
			setImmediate(this.fire);
			this._timer = { urgent: true };
		} else {
			this._timer = { urgent: false, handle: setTimeout(this.fire, this._writeDelay) };
		}
	}

	private readonly fire = (): void => {
		this._timer = undefined;
		void this.run();
	};

	private async run(): Promise<void> {
		this._running = true;
		try {
			while (this._durable < this._generation) {
				const target = this._generation;
				try {
					await this._persist();
				} catch (error) {
					// The changes stay in memory. Only the callers covered by this save are told; the
					// next write or flush tries again.
					this.settle(target, { error });
					return;
				}

				this._durable = target;
				this.settle(target);
			}
		} finally {
			this._running = false;
			// Changes made during a failed save are tried once more, as soon as one of them asked.
			if (this._waiters.length > 0) {
				this.arm(this._waiters.some((waiter) => waiter.urgent));
			}
		}
	}

	private settle(target: number, failure?: { error: unknown }): void {
		const done = this._waiters.filter((waiter) => waiter.generation <= target);
		this._waiters = this._waiters.filter((waiter) => waiter.generation > target);
		for (const waiter of done) {
			if (failure) {
				waiter.reject(failure.error);
			} else {
				waiter.resolve();
			}
		}
	}
}
