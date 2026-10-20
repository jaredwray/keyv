import { describe, expect, test, vi } from "vitest";
import { GroupCommit } from "../src/group-commit.js";

/** A persist function whose calls can be held open and failed on demand. */
function controllablePersist() {
	const calls: Array<{ release: () => void; fail: (error: unknown) => void }> = [];
	let auto = true;
	let failNext: unknown;
	const persist = vi.fn(() => {
		if (failNext !== undefined) {
			const error = failNext;
			failNext = undefined;
			return Promise.reject(error);
		}

		if (auto) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve, reject) => {
			calls.push({ release: resolve, fail: reject });
		});
	});
	return {
		persist,
		calls,
		hold() {
			auto = false;
		},
		failOnce(error: unknown) {
			failNext = error;
		},
	};
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("GroupCommit", () => {
	test("changes in the same tick share one save", async () => {
		const control = controllablePersist();
		const commit = new GroupCommit(control.persist, 0);
		const waits = Array.from({ length: 100 }, () => commit.wait(commit.next()));
		expect(commit.pending).toBe(true);
		await Promise.all(waits);
		expect(control.persist).toHaveBeenCalledTimes(1);
		expect(commit.pending).toBe(false);
	});

	test("a wait for a saved generation resolves at once", async () => {
		const control = controllablePersist();
		const commit = new GroupCommit(control.persist, 0);
		const generation = commit.next();
		await commit.wait(generation);
		await commit.wait(generation);
		await commit.flush();
		expect(control.persist).toHaveBeenCalledTimes(1);
	});

	test("sequential awaited changes each get a save", async () => {
		const control = controllablePersist();
		const commit = new GroupCommit(control.persist, 0);
		await commit.wait(commit.next());
		await commit.wait(commit.next());
		await commit.wait(commit.next());
		expect(control.persist).toHaveBeenCalledTimes(3);
	});

	test("a change made during a save is saved by the next one (keyv-file B1)", async () => {
		const control = controllablePersist();
		control.hold();
		const commit = new GroupCommit(control.persist, 0);
		const first = commit.wait(commit.next());
		await tick();
		expect(control.calls).toHaveLength(1);

		let secondDone = false;
		const second = commit.wait(commit.next()).then(() => {
			secondDone = true;
		});
		control.calls[0].release();
		await first;
		await tick();
		expect(secondDone).toBe(false);
		expect(control.calls).toHaveLength(2);
		control.calls[1].release();
		await second;
		expect(secondDone).toBe(true);
	});

	test("writeDelay batches changes until the delay passes; flush skips it", async () => {
		vi.useFakeTimers();
		try {
			const control = controllablePersist();
			const commit = new GroupCommit(control.persist, 1000);
			const first = commit.wait(commit.next());
			await vi.advanceTimersByTimeAsync(500);
			const second = commit.wait(commit.next());
			expect(control.persist).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(500);
			await Promise.all([first, second]);
			expect(control.persist).toHaveBeenCalledTimes(1);

			const third = commit.wait(commit.next());
			const flushed = commit.flush();
			await vi.advanceTimersByTimeAsync(0);
			await Promise.all([third, flushed]);
			expect(control.persist).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	test("an urgent flush replaces a pending delay, and a later wait keeps it", async () => {
		vi.useFakeTimers();
		try {
			const control = controllablePersist();
			const commit = new GroupCommit(control.persist, 60_000);
			const waited = commit.wait(commit.next());
			const flushed = commit.flush();
			const later = commit.wait(commit.next());
			await vi.advanceTimersByTimeAsync(0);
			await Promise.all([waited, flushed, later]);
			expect(control.persist).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	test("a failed save rejects only the changes it covered; the next save retries", async () => {
		const control = controllablePersist();
		const commit = new GroupCommit(control.persist, 0);
		control.failOnce(new Error("disk full"));
		const failed = commit.wait(commit.next());
		await expect(failed).rejects.toThrow("disk full");
		expect(commit.pending).toBe(true);
		await commit.wait(commit.next());
		expect(control.persist).toHaveBeenCalledTimes(2);
		expect(commit.pending).toBe(false);
	});

	test("changes made during a failed save are retried once, without looping", async () => {
		const control = controllablePersist();
		control.hold();
		const commit = new GroupCommit(control.persist, 0);
		const first = commit.wait(commit.next());
		await tick();
		const second = commit.wait(commit.next());
		control.calls[0].fail(new Error("first failed"));
		await expect(first).rejects.toThrow("first failed");
		await tick();
		expect(control.calls).toHaveLength(2);
		control.calls[1].fail(new Error("second failed"));
		await expect(second).rejects.toThrow("second failed");
		await tick();
		await tick();
		expect(control.calls).toHaveLength(2);
	});
});

test("a flush called during a save that fails is retried without waiting out writeDelay", async () => {
	vi.useFakeTimers();
	try {
		const control = controllablePersist();
		control.hold();
		const commit = new GroupCommit(control.persist, 60_000);
		commit.next();
		const first = commit.flush();
		await vi.advanceTimersByTimeAsync(0);
		expect(control.calls).toHaveLength(1);
		commit.next();
		const flushed = commit.flush();
		control.calls[0].fail(new Error("first failed"));
		await expect(first).rejects.toThrow("first failed");
		await vi.advanceTimersByTimeAsync(0);
		expect(control.calls).toHaveLength(2);
		control.calls[1].release();
		await flushed;
	} finally {
		vi.useRealTimers();
	}
});
