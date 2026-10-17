# @keyv/serialize

## 1.1.2

### Patch Changes

- Serialize a plain `Uint8Array` as a `:base64:` string before `toJSON`, matching `Buffer`. Existing `Buffer` values and index-keyed objects still deserialize as before.
