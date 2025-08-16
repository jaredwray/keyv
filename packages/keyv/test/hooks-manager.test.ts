// biome-ignore-all lint/correctness/noUnusedVariables: test file
import * as test from "vitest";
import HooksManager from "../src/hooks-manager.js";

test.it("add and trigger handler", (t) => {
	const hooksManager = new HooksManager();
	let testData = "foo";

	hooksManager.addHandler("testEvent", (data: string) => {
		testData = data;
	});
	hooksManager.trigger("testEvent", "testData");

	t.expect(testData).toBe("testData");
});

test.it("addHandler adds a handler for an event", (t) => {
	const hooksManager = new HooksManager();
	let called = false;
	const handler = () => {
		called = true;
	};

	hooksManager.addHandler("testEvent", handler);

	// Trigger the event
	hooksManager.trigger("testEvent", "testData");
	t.expect(called).toBeTruthy();
});

test.it("addHandler allows multiple handlers for the same event", (t) => {
	const hooksManager = new HooksManager();
	let callCount = 0;
	const handler1 = () => {
		callCount++;
	};

	const handler2 = () => {
		callCount++;
	};

	hooksManager.addHandler("testEvent", handler1);
	hooksManager.addHandler("testEvent", handler2);

	// Trigger the event
	hooksManager.trigger("testEvent", "testData");
	t.expect(callCount).toBe(2);
});

test.it("remove handler", (t) => {
	const hooksManager = new HooksManager();
	let testData = 0;

	const handler = () => {
		testData++;
	};

	hooksManager.addHandler("testEvent", handler);
	hooksManager.trigger("testEvent", testData);
	hooksManager.removeHandler("testEvent", handler);
	hooksManager.trigger("testEvent", testData);

	t.expect(testData).toBe(1);
});

test.it("handlers getter", (t) => {
	const hooksManager = new HooksManager();
	const testData = 0;
	hooksManager.addHandler("testEvent", (data: number) => {
		data++;
	});

	t.expect(hooksManager.handlers.has("testEvent")).toBeTruthy();
	t.expect(hooksManager.handlers.get("testEvent")?.length).toBe(1);
});

test.it("emit an error", (t) => {
	const hooksManager = new HooksManager();

	hooksManager.addHandler("testEvent", (message) => {
		throw new Error(message);
	});

	hooksManager.on("error", (error) => {
		t.expect(error.message).toBe(
			'Error in hook handler for event "testEvent": testMessage',
		);
	});

	hooksManager.trigger("testEvent", "testMessage");
});
