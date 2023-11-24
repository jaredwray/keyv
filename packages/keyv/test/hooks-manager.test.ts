import test from 'ava';
import {HooksManager} from '../src/hooks-manager';

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

test('HooksManager: handlers getter', t => {
	const hooksManager = new HooksManager();
	const testData = 0;
	hooksManager.addHandler('testEvent', (data: number) => {
		data++;
	});

	t.true(hooksManager.handlers.has('testEvent'));
	t.is(hooksManager.handlers.get('testEvent')?.length, 1);
});

test('HooksManager: emit an error', t => {
	const hooksManager = new HooksManager();

	hooksManager.addHandler('testEvent', message => {
		throw new Error(message);
	});

	hooksManager.on('error', error => {
		t.is(error.message, 'Error in hook handler for event "testEvent": testMessage');
	});

	hooksManager.trigger('testEvent', 'testMessage');
});
