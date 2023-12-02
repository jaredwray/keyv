/* eslint-disable @typescript-eslint/no-empty-function */
import test from 'ava';
import EventManager from '../src/event-manager';

test('remove event listener', t => {
	const emitter = new EventManager();
	let dataReceived = 0;

	const listener: EventListener = () => {
		dataReceived++;
	};

	emitter.on('test-event', listener);
	emitter.emit('test-event');
	emitter.off('test-event', listener);
	emitter.emit('test-event');

	t.is(dataReceived, 1);
});

test('get max listeners', t => {
	const emitter = new EventManager();
	t.is(emitter.maxListeners(), 100);
});

test('add event listener', t => {
	const emitter = new EventManager();
	emitter.addListener('test-event', () => {});
	t.is(emitter.listeners('test-event').length, 1);
});

test('remove event listener handler', t => {
	const emitter = new EventManager();
	const listener: EventListener = data => {
		console.log(data);
	};

	emitter.addListener('test-event8', listener);
	t.is(emitter.listeners('test-event8').length, 1);
	emitter.removeListener('test-event8', listener);
	t.is(emitter.listeners('test-event8').length, 0);
});

test('remove event listener handler when never existed', t => {
	const emitter = new EventManager();
	const listener: EventListener = () => {};
	emitter.removeListener('test-event8', listener);
	t.is(emitter.listeners('test-event8').length, 0);
	emitter.on('test-event8', listener);
	emitter.removeListener('test-event8', () => {});
	t.is(emitter.listeners('test-event8').length, 1);
	emitter.removeListener('test-event8', listener);
	t.is(emitter.listeners('test-event8').length, 0);
});

test('remove all event listeners', t => {
	const emitter = new EventManager();
	let dataReceived = 0;

	const listener: EventListener = () => {
		dataReceived++;
	};

	const listener1: EventListener = () => {
		dataReceived++;
	};

	emitter.on('test-event', listener);
	emitter.on('test-event', listener1);
	emitter.on('test-event2', listener);

	emitter.removeAllListeners();

	t.is(emitter.listeners('test-event').length, 0);
	t.is(emitter.listeners('test-event2').length, 0);
});

test('set max listeners and check warning', t => {
	const emitter = new EventManager();
	emitter.setMaxListeners(1);

	const listener: EventListener = () => {};

	// Temporary override console.warn
	let capturedWarning = '';
	const originalWarn = console.warn;
	console.warn = (message: any) => {
		capturedWarning = message;
	};

	emitter.on('test-event', listener);
	emitter.on('test-event', listener); // This should trigger the warning

	// Restore original console.warn
	console.warn = originalWarn;

	t.regex(capturedWarning, /MaxListenersExceededWarning/);
});

test('remove all listeners', t => {
	const emitter = new EventManager();
	const listener: EventListener = () => {};

	emitter.on('test-event', listener);
	emitter.on('test-event', listener);
	emitter.removeAllListeners('test-event');

	t.deepEqual(emitter.listeners('test-event'), []);
});

test('listeners method', t => {
	const emitter = new EventManager();
	const listener: EventListener = () => {};

	emitter.on('test-event', listener);

	t.deepEqual(emitter.listeners('test-event'), [listener]);
});

test('if it is an error with no listeners throw error', t => {
	const emitter = new EventManager();

	t.throws(() => {
		emitter.emit('error', new Error('test'));
	}, {instanceOf: Error});
});
