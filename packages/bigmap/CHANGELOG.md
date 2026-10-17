# @keyv/bigmap

## 1.4.0

### Minor Changes

- Require Node.js >= 22.18. Node.js 20 reached end of life on 2026-04-30, and `hookified` 3 needs this floor. This follows the `@keyv/sqlite` 4.1.0 engine bump, which was a minor.
  
  Upgrade `hashery` to v3 and `hookified` to v3. The `Map` methods are unchanged. `emit("error")` with no listeners does not throw. The hookified v1 names `logger` and `throwHookErrors` are still accepted on the constructor and as properties. `createKeyv` is unchanged. `Hashery` is still re-exported.
