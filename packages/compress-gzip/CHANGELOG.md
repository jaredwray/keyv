# @keyv/compress-gzip

## 2.0.4

### Patch Changes

- Store compressed values as a `Buffer` so `@keyv/serialize` writes a compact `:base64:` string instead of an index-keyed byte object (#2009). `Buffer` is a `Uint8Array`, and legacy byte objects still decompress.
  
  Upgrade `pako` to v3. The public `Options` type still accepts the pako v2 `to: "string"` option and maps it to `toText: true`. `decompress` still always returns a string.
- Updated dependencies
  - @keyv/serialize@1.1.2
