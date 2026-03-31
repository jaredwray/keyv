import base from '../../tsdown.base.js';

export default {
	...base,
	entry: ['src/index.ts'],
	deps: {
		neverBundle: ['bun:sqlite', 'node:sqlite'],
	},
};
