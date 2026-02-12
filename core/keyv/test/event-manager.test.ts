// biome-ignore-all lint/correctness/noUnusedVariables: test file
import * as test from "vitest";
import EventManager from "../src/event-manager.js";

test.it("remove event listener", (t) => {
	const emitter = new EventManager();
	let dataReceived = 0;

	const listener = () => {
		dataReceived++;
	};

	emitter.on("test-event", listener);
	emitter.emit("test-event");
	emitter.off("test-event", listener);
	emitter.emit("test-event");

	t.expect(dataReceived).toBe(1);
});

test.it("get max listeners", (t) => {
	const emitter = new EventManager();
	t.expect(emitter.maxListeners()).toBe(100);
});

test.it("add event listener", (t) => {
	const emitter = new EventManager();
	emitter.addListener("test-event", () => {});
	t.expect(emitter.listeners("test-event").length).toBe(1);
});

test.it("remove event listener handler", (t) => {
	const emitter = new EventManager();
	const listener: EventListener = (data) => {
		console.log(data);
	};

	emitter.addListener("test-event8", listener);
	t.expect(emitter.listeners("test-event8").length).toBe(1);
	emitter.removeListener("test-event8", listener);
	t.expect(emitter.listeners("test-event8").length).toBe(0);
});

test.it("remove event listener handler when never existed", (t) => {
	const emitter = new EventManager();
	const listener = () => {};
	emitter.removeListener("test-event8", listener);
	t.expect(emitter.listeners("test-event8").length).toBe(0);
	emitter.on("test-event8", listener);
	emitter.removeListener("test-event8", () => {});
	t.expect(emitter.listeners("test-event8").length).toBe(1);
	emitter.removeListener("test-event8", listener);
	t.expect(emitter.listeners("test-event8").length).toBe(0);
});

test.it("remove all event listeners", (t) => {
	const emitter = new EventManager();
	let dataReceived = 0;

	const listener = () => {
		dataReceived++;
	};

	const listener1 = () => {
		dataReceived++;
	};

	emitter.on("test-event", listener);
	emitter.on("test-event", listener1);
	emitter.on("test-event2", listener);

	emitter.removeAllListeners();

	t.expect(emitter.listeners("test-event").length).toBe(0);
	t.expect(emitter.listeners("test-event2").length).toBe(0);
});

test.it("set max listeners and check warning", (t) => {
	const emitter = new EventManager();
	emitter.setMaxListeners(1);

	const listener = () => {};

	// Temporary override console.warn
	let capturedWarning = "";
	const originalWarn = console.warn;
	console.warn = (message) => {
		capturedWarning = message;
	};

	emitter.on("test-event", listener);
	emitter.on("test-event", listener); // This should trigger the warning

	// Restore original console.warn
	console.warn = originalWarn;

	t.expect(capturedWarning).toMatch(/MaxListenersExceededWarning/);
});

test.it("remove all listeners", (t) => {
	const emitter = new EventManager();
	const listener = () => {};

	emitter.on("test-event", listener);
	emitter.on("test-event", listener);
	emitter.removeAllListeners("test-event");

	t.expect(emitter.listeners("test-event")).toEqual([]);
});

test.it("listeners method", (t) => {
	const emitter = new EventManager();
	const listener = () => {};

	emitter.on("test-event", listener);

	t.expect(emitter.listeners("test-event")).toEqual([listener]);
});

test.it("once method", (t) => {
	const emitter = new EventManager();
	let dataReceived = 0;

	emitter.once("test-event", () => {
		dataReceived++;
	});

	emitter.emit("test-event");
	emitter.emit("test-event");

	t.expect(dataReceived).toBe(1);
});
