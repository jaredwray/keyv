# Agents

## Common Commands

### Build
- `pnpm build` - Build all packages (keyv first, then all others)
- `pnpm build:keyv` - Build only the keyv package

### Testing
- `pnpm test` - Run all tests across all packages with coverage
- `pnpm -r --workspace-concurrency 1 test:ci` - Run CI tests (same as `pnpm test`)
- `pnpm test:services:start` - Start Docker services for testing (requires Docker with host networking enabled)
- `pnpm test:services:stop` - Stop Docker services

Individual package tests:
- `cd {category}/{package-name} && pnpm test` - Test specific package (e.g., `cd storage/redis && pnpm test`)
- `cd {category}/{package-name} && pnpm test:ci` - Run CI tests for specific package

### Linting and Code Quality
- `biome check` - Check code with Biome linter
- `biome check --write` - Fix auto-fixable issues
- Individual packages use Biome for linting, configured with tabs and double quotes

### Development Workflow
1. Start test services: `pnpm test:services:start`
2. Run tests: `pnpm test`
3. Build packages: `pnpm build`
4. Stop test services: `pnpm test:services:stop`

### Clean Up
- `pnpm clean` - Remove node_modules and generated files from all packages

## Architecture Overview

### Monorepo Structure
- **Root**: Workspace configuration with pnpm
- **core/keyv**: Core Keyv library - the main key-value storage interface
- **core/test-suite**: Shared test suite (@keyv/test-suite) for API compliance testing
- **serialization/superjson**: SuperJSON serializer (@keyv/serialize-superjson) - optional
- **serialization/msgpackr**: MessagePack serializer (@keyv/serialize-msgpackr) - optional
- **core/bigmap**: BigMap - scalable in-memory Map implementation
- **storage/**: Storage adapters - Redis, MySQL, PostgreSQL, MongoDB, SQLite, Etcd, Memcache, Valkey, Valkey GLIDE, DynamoDB, Cloudflare KV
- **compression/**: Compression adapters - Brotli, Gzip, LZ4
- **encryption/**: Encryption adapters - Node.js crypto (@keyv/encrypt-node), Web Crypto (@keyv/encrypt-web)
- **skills/**: Agent Skills for coding agents - `keyv-migrate` upgrades user projects from Keyv v4/v5 to v6
- **website**: Documentation website

### Key Architecture Concepts

**Core Keyv Class** (`core/keyv/src/keyv.ts`, exported from `core/keyv/src/index.ts`):
- Extends Hookified for events and hooks (`onHook`/`addHook`, `KeyvHooks.BEFORE_*`/`AFTER_*`; the old `PRE_*`/`POST_*` names are deprecated aliases)
- Includes KeyvStats for usage statistics, driven by `stat:*` events
- Supports pluggable storage adapters, serialization, compression, and encryption
- Handles TTL: turns the relative `ttl` users pass into an absolute `expires` timestamp for the adapter
- Does not prefix keys; namespacing is done by the storage adapters. There is no default namespace
- A failed operation emits `error`; it resolves to a fallback value when an `error` listener is attached and rejects when none is

**Storage Adapter Interface** (`KeyvStorageAdapter` in `core/keyv/src/types/adapters.ts`):
- Must implement: `get()`, `set(key, value, expires?)`, `delete()`, `clear()`, `has()`, `hasMany()`, `getMany()`, `setMany()`, `deleteMany()`
- Optional: `iterator()` (no arguments), `disconnect()`
- `expires` is an absolute Unix timestamp in milliseconds; declare the v6 contract with `get capabilities() { return keyvStorageCapability(this); }`
- Keyv wraps adapters that don't declare it in `KeyvBridgeAdapter`, and `Map`-like stores in `KeyvMemoryAdapter`
- Adapters extend Hookified and handle their own `namespace`

**Serialization**:
- Default uses built-in `KeyvJsonSerializer` with JSON.stringify/parse (plus `Buffer` and `BigInt` support)
- Compression and encryption adapters can be plugged in; they run only while serialization is enabled. Without it, compression is skipped, and writes with an encryption adapter fail with an error
- Data format: `{ value: T, expires?: number }`

### Build Dependencies
1. `keyv` core must be built first (used by adapters and serialization packages)
2. All other packages can be built in parallel

### Testing Requirements
- Docker is required for integration tests with databases/services
- Enable "host networking" in Docker settings for the Redis and Valkey cluster tests
- Packages run their tests in parallel, so they must not share a cluster: `@keyv/redis` flushes its cluster (ports 7001-7003) before each test, and `@keyv/valkey` uses its own (7101-7103). Give a new adapter that needs a cluster its own as well
- Test services are managed via scripts in `/scripts/` directory
- Each storage adapter should use `@keyv/test-suite` for compliance testing
- Tests use Vitest with coverage reporting
- Don't set `retry` in a package's Vitest config or on a test to get CI green: a test that only passes on retry is flaky, so fix its cause. The one exception is the Cloudflare KV live config, which calls the real Cloudflare API over the internet

### Code Style
- TypeScript with strict mode enabled
- Biome for linting and formatting
- Tab indentation, double quotes
- ES modules (`type: "module"`)
- Build targets: CommonJS and ESM with TypeScript definitions

### Package Dependencies
- Workspace packages use `workspace:^` protocol
- Core package (`keyv`) depends only on `hookified` (serializer is built-in)
- Storage adapters depend on `keyv` as peer dependency
- Test suite depends on `keyv` and various testing utilities

## Migration Skill

`skills/keyv-migrate/` is an Agent Skill that coding agents follow to upgrade user projects from Keyv v4 or v5 to v6. It is published at https://keyv.org/skills/migrate (and `/skills/keyv-migrate/`, plus the `/.well-known/skills/` discovery index) by `website/src/skills.ts` during `pnpm website:build`, and can be installed with `npx skills add jaredwray/keyv --skill keyv-migrate`.

- When a change alters a public API, an option, an adapter's behavior, or how an adapter builds storage keys, update `website/site/docs/migration/v5-to-v6.md` and the matching file in `skills/keyv-migrate/references/` in the same PR.
- Keep the skill Markdown only. Don't add scripts: agents run it in other people's projects, and it can be read straight from a URL.
- `pnpm --filter @keyv/website test` validates the skill (frontmatter, links, headings, absolute URLs) and the publishing step.

## Pull Request Guidelines

### PR Title Format
Use the following format for pull request titles:

```
{package} - {type}: {description}
```

**Examples:**
- `sqlite - feat: Add WAL (Write-Ahead Logging) mode support`
- `redis - fix: Connection timeout handling`
- `keyv - docs: Update API documentation`
- `mono - chore: Upgrade dependencies`

**Package names:**
- Use the package name (e.g., `sqlite`, `redis`, `postgres`, `keyv`, `serialize`)
- Use `mono` for changes that affect the entire monorepo

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `chore`: Maintenance tasks (dependencies, CI, etc.)
- `refactor`: Code refactoring
- `test`: Test additions or changes
- `perf`: Performance improvements

## Safe Chain

Package installs in this environment go through Aikido Safe Chain shims. Never bypass them:

- Keep `~/.safe-chain/shims` first on `PATH`.
- Do not call unshimmed `npm`, `pnpm`, `npx`, or `pnpx`.
- Do not install packages with `curl | sh` or by pointing at a package manager outside the shim directory.

In Claude Code cloud sessions, the SessionStart hook in `.claude/hooks/session-start.sh` runs `scripts/setup-cloud-environment.sh` when a session starts and puts the shims first on `PATH` for the session. After resume, `/clear`, or compaction it installs again only if Safe Chain is missing. Until Safe Chain is installed, `npm`, `npx`, `pnpm`, and `pnpx` are blocked; to retry a failed install, run `CLAUDE_CODE_REMOTE=true .claude/hooks/session-start.sh` from the repository root.
