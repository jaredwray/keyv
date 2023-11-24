import test from 'ava';
import { EventManager, EventListener } from '../src/event-manager'; // Adjust the import path as necessary

test('EventManager: remove event listener', t => {
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

test('EventManager: remove all event listeners', t => {
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

test('EventManager: set max listeners and check warning', t => {
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

test('EventManager: remove all listeners', t => {
    const emitter = new EventManager();
    const listener: EventListener = () => {};

    emitter.on('test-event', listener);
    emitter.on('test-event', listener);
    emitter.removeAllListeners('test-event');

    t.deepEqual(emitter.listeners('test-event'), []);
});

test('EventManager: listeners method', t => {
    const emitter = new EventManager();
    const listener: EventListener = () => {};

    emitter.on('test-event', listener);

    t.deepEqual(emitter.listeners('test-event'), [listener]);
});
