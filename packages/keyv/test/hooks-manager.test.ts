import test from 'ava';
import {HooksManager} from '../src/hooks-manager.js'; // Update with the correct path

test('HooksManager: add and trigger handler', t => {
	const hooksManager = new HooksManager();
	let testData = 'foo';

	hooksManager.addHandler('testEvent', (data: string) => {
		testData = data;
	});
	hooksManager.trigger('testEvent', 'testData');

	t.is(testData, 'testData');
});

test('HooksManager: remove handler', t => {
	const hooksManager = new HooksManager();
	let testData = 0;

	const handler = () => {
		testData++;
	};

	hooksManager.addHandler('testEvent', handler);
	hooksManager.trigger('testEvent', testData);
	hooksManager.removeHandler('testEvent', handler);
	hooksManager.trigger('testEvent', testData);

	t.is(testData, 1);
});

test('HooksManager: error handling', t => {
	const hooksManager = new HooksManager();
	const errorMessage = 'Test Error';
	const error = new Error(errorMessage);
	let caughtErrorMessage: string | undefined;
	const testData = 0;

	hooksManager.addHandler('testEvent', () => {
		throw error;
	});
	hooksManager.addEventListener('error', (event: Event) => {
		const customEvent = event as CustomEvent;
		caughtErrorMessage = (customEvent.detail as Error).message;
	});

	hooksManager.trigger('testEvent', testData);

	// Ensure that the message of the caught error is the same as the message of the thrown error
	if (caughtErrorMessage === undefined) {
		t.fail('Error message was not caught');
	} else {
		t.pass();
	}
});

test('HooksManager: handlers getter', t => {
	const hooksManager = new HooksManager();
	const testData = 0;
	hooksManager.addHandler('testEvent', (data: number) => {
		data++;
	});

	t.true(hooksManager.handlers.has('testEvent'));
	t.is(hooksManager.handlers.get('testEvent')?.length, 1);
});
