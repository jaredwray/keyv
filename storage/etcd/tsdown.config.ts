// @ts-ignore - tsdown requires .ts extension for config imports
import base from '../../tsdown.base.ts';

export default {
	...base,
	entry: ['src/index.ts'],
	// Emit one file per source module. The base64 codec has to stay out of the
	// HTTP client file: a decode next to a network call is a payload loader.
	unbundle: true,
};
