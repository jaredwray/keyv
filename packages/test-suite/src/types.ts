import type {KeyvStoreAdapter} from 'keyv';

export type KeyvStoreFn = () => KeyvStoreAdapter | any;
