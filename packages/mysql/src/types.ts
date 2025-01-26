import {type ConnectionOptions} from 'mysql2';

export type KeyvMysqlOptions = {
	dialect?: 'mysql';
	uri?: string;
	table?: string;
	keySize?: number;
	useInternalScheduler?: boolean;
	iterationLimit?: string | number;
} & ConnectionOptions;
