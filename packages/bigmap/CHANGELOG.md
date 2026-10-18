# @keyv/bigmap

## 1.4.0

### Minor Changes

- Require Node.js >= 22.18. Node.js 20 reached end of life on 2026-04-30, and `hookified` 3 needs this floor. This follows the `@keyv/sqlite` 4.1.0 engine bump, which was a minor.
  
  Upgrade `hashery` to v3 and `hookified` to v3. The `Map` methods are unchanged. `emit("error")` with no listeners does not throw. The hookified v1 names `logger` and `throwHookErrors` are still accepted on the constructor and as properties. The v1 hook calls `prependHook(event, handler)`, `prependOnceHook(event, handler)`, `onceHook(event, handler)`, `removeHook(event, handler)`, `onHookEntry`, and `getHooks` (handler functions) still work. `createKeyv` is unchanged. `Hashery` is still re-exported from `hashery` 3. Its hash API is unchanged. Hookified v1 option names on that re-exported class follow `hashery` 3, which takes `eventLogger` and `throwOnHookError`.
