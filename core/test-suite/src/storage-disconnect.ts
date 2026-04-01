import type { StorageFn, TestFunction } from "./types.js";

const storageDisconnectTests = (test: TestFunction, store: StorageFn) => {
	test("disconnect() resolves without error", async (t) => {
		const s = store();
		if (typeof s.disconnect !== "function") {
			return;
		}

		await s.disconnect();
		t.expect(true).toBe(true);
	});
};

export default storageDisconnectTests;
