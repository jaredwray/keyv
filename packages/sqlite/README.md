# @keyv/sqlite [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> SQLite storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/sqlite.svg)](https://www.npmjs.com/package/@keyv/sqlite)
[![npm](https://img.shields.io/npm/dm/@keyv/sqlite)](https://npmjs.com/package/@keyv/sqlite)

SQLite storage adapter for [Keyv](https://github.com/lukechilds/keyv).

## Install

```shell
npm install --save keyv @keyv/sqlite
```

## Usage

```js
import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';

const keyv = new Keyv(new KeyvSqlite('sqlite://path/to/database.sqlite'));
keyv.on('error', handleConnectionError);
```

You can specify the `table` and [`busyTimeout`](https://sqlite.org/c3ref/busy_timeout.html) option.

e.g:

```js
import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';

const keyvSqlite = new KeyvSqlite('sqlite://path/to/database.sqlite', {
  table: 'cache',
  busyTimeout: 10000
});

const keyv = new Keyv({ store: keyvSqlite }); 
```

You can also use a helper function to create `Keyv` with `KeyvSqlite` store.

```js
import {createKeyv} from '@keyv/sqlite';

const keyv = createKeyv('sqlite://path/to/database.sqlite');
```

## Using Different SQLite Drivers

By default, @keyv/sqlite uses the `sqlite3` driver. You can use any SQLite driver by providing a custom `connect` function:

### better-sqlite3 (High Performance)

```js
import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';
import Database from 'better-sqlite3';

const store = new KeyvSqlite({
  uri: 'sqlite://path/to/database.sqlite',
  connect: async () => {
    const db = new Database('path/to/database.sqlite');
    return {
      async query(sql, ...params) {
        const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
        const stmt = db.prepare(sql);
        return isSelect ? stmt.all(...params) : (stmt.run(...params), []);
      },
      async close() {
        db.close();
      }
    };
  }
});

const keyv = new Keyv({ store });
```

Install: `npm install better-sqlite3`

### node:sqlite (Node.js 22.5+, Zero Dependencies)

```js
import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';
import { DatabaseSync } from 'node:sqlite';

const store = new KeyvSqlite({
  uri: 'sqlite://path/to/database.sqlite',
  connect: async () => {
    const db = new DatabaseSync('path/to/database.sqlite');
    return {
      async query(sql, ...params) {
        const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
        const stmt = db.prepare(sql);
        return isSelect ? stmt.all(...params) : (stmt.run(...params), []);
      },
      async close() {
        db.close();
      }
    };
  }
});

const keyv = new Keyv({ store });
```

No installation needed - built into Node.js 22.5+

### bun:sqlite (Bun Runtime)

```js
import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';
import { Database } from 'bun:sqlite';

const store = new KeyvSqlite({
  uri: 'sqlite://path/to/database.sqlite',
  connect: async () => {
    const db = new Database('path/to/database.sqlite');
    return {
      async query(sql, ...params) {
        const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
        return isSelect ? db.query(sql).all(...params) : (db.run(sql, ...params), []);
      },
      async close() {
        db.close();
      }
    };
  }
});

const keyv = new Keyv({ store });
```

No installation needed - built into Bun runtime

The `connect` function should return an object with:
- `query(sql, ...params)`: Execute SQL and return results array (empty for non-SELECT)
- `close()`: Close the database connection

## License

[MIT © Jared Wray](LICENCE)

