# Dependencies

## Runtime

Every v6 package declares `"engines": { "node": ">= 22.19.0" }`. Bun and browsers are also supported; see https://keyv.org/docs/browser-node-and-bun/.

Check the version the project really runs on, not only `node --version`:

- `engines` in each package.json
- `.nvmrc`, `.node-version`, `.tool-versions`, and `volta` settings
- `FROM node:…` lines in Dockerfiles
- Node.js versions in CI workflows and deploy settings (serverless runtimes, PaaS config)

Setting `engines.node` to `>=22.19.0` in a package.json that already declares `engines` is part of the upgrade: do it. The rest are runtime pins: if any of them is older than 22.19.0, tell the user, and ask before changing them.

## Pick one exact version

From v6 on, every Keyv package shares one version, and packages are only tested together at the same version. Don't mix versions.

1. List the v6 versions: `npm view "keyv@>=6.0.0-0 <7" version --json`. Call the highest one `V`. The list is sorted, so it is the last entry.
2. For each `@keyv/*` package the project uses, confirm that `V` exists: `npm view @keyv/<name>@<V> version` must print `V`. If one is missing, use the highest version that every package has.
3. If `V` contains a hyphen, such as `6.0.0-rc.1`, it is a pre-release. Tell the user and get a go-ahead before installing it.

To find the versions installed now, read the lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, or `bun.lock`). Without one, resolve each range with `npm view <package>@<range> version` and take the highest result, and use npm unless the project names another package manager (the `packageManager` field, or its docs and scripts).

Don't pick the version from dist-tags. While v6 is in pre-release, `latest` points to v5 for most packages but to an early v6 pre-release for packages that are new in v6, and `beta` can be older than `rc`.

Respect the project's install policies. If pnpm's `minimumReleaseAge`, a trust policy, or a registry proxy blocks `V`, stop and tell the user. Don't weaken the policy to get the install through.

## Install

Use the project's package manager, and set every Keyv package in one command:

```sh
npm install keyv@V @keyv/redis@V
pnpm add keyv@V @keyv/redis@V
yarn add keyv@V @keyv/redis@V
bun add keyv@V @keyv/redis@V
```

While `V` is a pre-release, save exact versions (`--save-exact`, or `--exact` with yarn and bun) so a later pre-release isn't picked up by accident. Once v6 is stable, follow the project's usual range style, such as `^6.0.0`.

Every adapter declares `keyv` as a peer dependency. Keep `keyv` in the dependencies of each package that imports it.

## Package changes

| Package | In v6 | What to do |
| --- | --- | --- |
| `keyv` | Core | Upgrade to `V` |
| `@keyv/serialize` | Removed (v5 only) | Remove it. The built-in `KeyvJsonSerializer` is the default and writes the same format. If code imports it, use `import { KeyvJsonSerializer } from 'keyv'` |
| `@keyv/offline`, `@keyv/tiered` | Removed (v4 only) | Remove them. For an in-memory layer in front of a remote store, or offline fallbacks, suggest `cacheable` (https://cacheable.org) |
| `@keyv/redis`, `@keyv/valkey`, `@keyv/postgres`, `@keyv/mysql`, `@keyv/sqlite`, `@keyv/mongo`, `@keyv/memcache`, `@keyv/etcd`, `@keyv/dynamo` | Changed | Upgrade to `V`; see [adapters.md](adapters.md) |
| `@keyv/compress-gzip`, `@keyv/compress-brotli`, `@keyv/compress-lz4` | Changed | Upgrade to `V`; old compressed entries can't be read |
| `@keyv/bigmap` | Changed | Upgrade to `V` |
| `@keyv/test-suite` | Changed API | Upgrade to `V`; see [custom-adapters.md](custom-adapters.md) |
| `@keyv/serialize-superjson`, `@keyv/serialize-msgpackr` | New | Optional serializers |
| `@keyv/encrypt-node`, `@keyv/encrypt-web` | New | Optional encryption |
| `@keyv/cloudflare-kv` | New | Optional storage adapter |

Driver dependencies that change with the adapters:

- **`@keyv/sqlite`** no longer uses `sqlite3`. It uses `node:sqlite` on Node.js, `bun:sqlite` on Bun, and falls back to `better-sqlite3`. Remove a `sqlite3` dependency that nothing else uses. `better-sqlite3` is a native module: pnpm 10 and later block its install script until it is allowed. Ask the user before allowing a build script.
- **`@keyv/redis`** uses the official `redis` client (`@redis/client` v6), not `ioredis`.
- **`@keyv/memcache`** uses the `memcache` client instead of `memjs`.
- **`@keyv/etcd`** no longer uses `etcd3`. It talks to etcd's HTTP/JSON gateway.
- **`@keyv/mongo`** uses MongoDB driver v7.

## Packages the project publishes

When the project is a library or adapter that other people install:

- **Peer dependency on `keyv`.** Use a range that accepts `V`. While v6 is a pre-release, `^6.0.0` rejects it, so use `>=V <7` (such as `>=6.0.0-rc.1 <7`), and switch to `^6.0.0` once v6 is stable. Don't pin a peer to an exact version. A package that implements the v6 storage contract can't also support v5, so drop `^5` from the range.
- **Development dependencies** (`keyv`, `@keyv/test-suite`): pin them to `V` like the rest of the upgrade.
- **Version.** The upgrade is a breaking change for the package's users. Suggest a new major version, and let the user decide.
- **Runtime.** Set `engines.node` to `>=22.19.0`.

## Libraries that embed Keyv v5

Some libraries depend on Keyv v5 and accept Keyv instances or adapters from the app. When this skill was written, these depended on `keyv` `^5.6.0`: `cache-manager` 7, `cacheable` 2, `@cacheable/memory` 2, `cacheable-request` 13, and `got` 16. `@nestjs/cache-manager` 12 accepts `keyv` `>=5` but runs on `cache-manager`.

Check the current release of each library the project uses:

```sh
npm view <package> dependencies.keyv peerDependencies.keyv
```

Then check how the project uses it:

- **The project never imports `keyv` or `@keyv/*` itself.** There is nothing to migrate. Stop.
- **The project creates Keyv instances or adapters and passes them to the library**, for example `createCache({ stores: [new Keyv(new KeyvRedis(url))] })`, or a Keyv instance as `got`'s `cache` option. Mixing breaks quietly. A v6 `Keyv` given to `cache-manager` breaks `ttl()` and `wrap()` refreshes, because `cache-manager` asks for raw values with `get(key, { raw: true })`, which v6 ignores. A v6 adapter driven by a v5 `Keyv` gets relative TTLs where it expects absolute timestamps, so entries expire at the wrong time. Stop and give the user the options:
  1. Wait until the library supports Keyv v6 (check its changelog).
  2. Keep the whole project on Keyv v5 for now.
  3. Migrate only the Keyv code that the library never sees, and keep the instances it receives on v5 with npm aliases, such as `"keyv-v5": "npm:keyv@^5.6.0"` and `"keyv-redis-v5": "npm:@keyv/redis@^5"`. This is more complex; recommend it only when the user needs v6 elsewhere now. Know the catch before you offer it: v5 adapters declare a peer dependency on `keyv@^5`, and the name `keyv` is taken by v6, so `npm install` fails with `ERESOLVE`. pnpm and yarn install it with a peer warning; with npm, the choices are `--legacy-peer-deps` (it relaxes peer checks for every package, so it's the user's call) or moving that code into its own package that stays on v5. The aliases carry their own types:

     ```ts
     import KeyvV5 from 'keyv-v5';
     import KeyvRedisV5 from 'keyv-redis-v5';

     const httpCache = createCache({ stores: [new KeyvV5({ store: new KeyvRedisV5(url) })] });
     ```

     An instance kept on v5 reads and writes the same data as before, so it needs no stored-data decision. Include the alias names in the step 5 searches.
- **The library uses Keyv internally and the project only passes plain options**, such as a connection string or a `Map`. Nothing to migrate for that library.
