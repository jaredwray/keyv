import type {Store} from 'keyv';

export type KeyvStoreFn = () => Store<string | undefined>;
