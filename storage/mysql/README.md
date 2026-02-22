# @keyv/mysql [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> MySQL/MariaDB storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/mysql.svg)](https://www.npmjs.com/package/@keyv/mysql)
[![npm](https://img.shields.io/npm/dm/@keyv/mysql)](https://npmjs.com/package/@keyv/mysql)

MySQL/MariaDB storage adapter for [Keyv](https://github.com/jaredwray/keyv).

## Install

```shell
npm install --save keyv @keyv/mysql
```

## Usage

```js
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';

const keyv = new Keyv({ store: new KeyvMysql('mysql://user:pass@localhost:3306/dbname') });
```

Or use the `createKeyv` helper for a more concise setup:

```js
import { createKeyv } from '@keyv/mysql';

const keyv = createKeyv('mysql://user:pass@localhost:3306/dbname');
await keyv.set('foo', 'bar');
const value = await keyv.get('foo');
```

## Constructor

The `KeyvMysql` constructor accepts a connection URI string or an options object:

```js
// With a connection URI
const store = new KeyvMysql('mysql://user:pass@localhost:3306/dbname');

// With an options object
const store = new KeyvMysql({
  uri: 'mysql://user:pass@localhost:3306/dbname',
  table: 'cache',
  keySize: 255,
  intervalExpiration: 60
});
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `uri` | `string` | `'mysql://localhost'` | MySQL connection URI |
| `table` | `string` | `'keyv'` | Database table name for key-value storage |
| `keySize` | `number` | `255` | Maximum key length (VARCHAR size) |
| `intervalExpiration` | `number` | `undefined` | Interval in seconds for MySQL event scheduler to delete expired keys |
| `iterationLimit` | `string \| number` | `10` | Number of rows to fetch per iteration batch |

Any additional options are passed directly to the `mysql2` connection pool (e.g., `ssl`, `charset`, `timezone`).

## createKeyv Helper

The `createKeyv` function creates a `Keyv` instance with a `KeyvMysql` store in a single call:

```js
import { createKeyv } from '@keyv/mysql';

// With a URI
const keyv = createKeyv('mysql://user:pass@localhost:3306/dbname');

// With options
const keyv = createKeyv({
  uri: 'mysql://user:pass@localhost:3306/dbname',
  table: 'cache',
  keySize: 512
});
```

## Interval Expiration

You can use native MySQL scheduler to delete expired keys by specifying `intervalExpiration` in seconds:

```js
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';

const keyv = new Keyv({ store: new KeyvMysql({
  uri: 'mysql://user:pass@localhost:3306/dbname',
  table: 'cache',
  keySize: 255,
  intervalExpiration: 60
}) });
```

## SSL

```js
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';
import fs from 'fs';

const options = {
	ssl: {
		rejectUnauthorized: false,
		ca: fs.readFileSync(path.join(__dirname, '/certs/ca.pem')).toString(),
		key: fs.readFileSync(path.join(__dirname, '/certs/client-key.pem')).toString(),
		cert: fs.readFileSync(path.join(__dirname, '/certs/client-cert.pem')).toString(),
	},
};

const keyvMysql = new KeyvMysql('mysql://user:pass@localhost:3306/dbname', options);
const keyv = new Keyv({ store: keyvMysql });
```

## License

[MIT © Jared Wray](LISCENCE)
