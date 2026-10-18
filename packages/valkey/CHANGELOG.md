# @keyv/valkey

## 1.0.12

### Patch Changes

- Upgrade `iovalkey` to 0.4. `KeyvValkeyOptions` still extends `RedisOptions`, and the adapter still uses `get`, `mget`, `set`, `multi`, and `unlink`. The package typechecks against 0.4.
