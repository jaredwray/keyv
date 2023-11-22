import test from 'ava';
import { HooksManager } from '../src/hooks-manager.js'; // Update with the correct path

test('HooksManager: add and trigger handler', t => {
    const hooksManager = new HooksManager();
    let testData = null;

    hooksManager.addHandler('testEvent', data => { testData = data; });
    hooksManager.trigger('testEvent', 'testData');

    t.is(testData, 'testData');
});

test('HooksManager: remove handler', t => {
    const hooksManager = new HooksManager();
    let testData = 0;

    const handler = () => { testData++; };
    hooksManager.addHandler('testEvent', handler);
    hooksManager.trigger('testEvent');
    hooksManager.removeHandler('testEvent', handler);
    hooksManager.trigger('testEvent');

    t.is(testData, 1);
});

test('HooksManager: error handling', t => {
    const hooksManager = new HooksManager();
    const error = new Error('Test Error');

    hooksManager.addHandler('testEvent', () => { throw error; });
    hooksManager.addEventListener('error', (event: CustomEvent) => {
        t.is(event.detail, error);
    });

    hooksManager.trigger('testEvent');
});

test('HooksManager: handlers getter', t => {
    const hooksManager = new HooksManager();
    hooksManager.addHandler('testEvent', () => {});

    t.true(hooksManager.handlers.has('testEvent'));
    t.is(hooksManager.handlers.get('testEvent')?.length, 1);
});
