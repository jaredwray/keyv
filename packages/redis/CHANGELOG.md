# @keyv/redis

## 5.2.0

### Minor Changes

- Fix duplicate event listeners after reconnect (#2106) and share one in-flight connect so concurrent commands are not dropped (#2107).
  
  Require Node.js >= 22.18. Node.js 20 reached end of life on 2026-04-30, and `hookified` 3 plus `@redis/client` 6 need this floor. This follows the `@keyv/sqlite` 4.1.0 engine bump, which was a minor.
  
  Upgrade `@redis/client` to v6 and `hookified` to v3. Clients created by `KeyvRedis` (including `createKeyv`) keep the v5 defaults: RESP 2, no command timeout, and a 5 second TCP keepalive. Cluster node clients get that timeout from `defaults.commandOptions`, which is where `@redis/client` 6 builds them. An explicit option, or a client you pass in, is left as provided. `emit("error")` with no listeners does not throw. The hookified v1 names `logger` and `throwHookErrors` still work, and so do the v1 hook calls `prependHook(event, handler)`, `prependOnceHook(event, handler)`, `onceHook(event, handler)`, `removeHook(event, handler)`, `onHookEntry`, and `getHooks` (handler functions, not hook entries).
  
  `KeyvRedis` still implements `KeyvStoreAdapter`. `createClient`, `createCluster`, and `createSentinel` remain re-exports of `@redis/client`, so calling those helpers directly follows `@redis/client` v6.
