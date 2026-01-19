# Agents

## Common Commands

### Build
- `pnpm build` - Build all packages (serialize first, then keyv, then all others)
- `pnpm build:keyv:serialize` - Build only the serialize package
- `pnpm build:keyv` - Build only the keyv package

### Testing
- `pnpm test` - Run all tests across all packages with coverage
- `pnpm -r --workspace-concurrency 1 test:ci` - Run CI tests (same as `pnpm test`)
- `pnpm test:services:start` - Start Docker services for testing (requires Docker with host networking enabled)
- `pnpm test:services:stop` - Stop Docker services

Individual package tests:
- `cd packages/{package-name} && pnpm test` - Test specific package
- `cd packages/{package-name} && pnpm test:ci` - Run CI tests for specific package

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
- **packages/keyv**: Core Keyv library - the main key-value storage interface
- **packages/serialize**: Serialization utilities (@keyv/serialize) - used by core and adapters
- **packages/test-suite**: Shared test suite (@keyv/test-suite) for API compliance testing
- **Storage Adapters**: Redis, MySQL, PostgreSQL, MongoDB, SQLite, Etcd, Memcache, Valkey, DynamoDB
- **Compression Adapters**: Brotli, Gzip, LZ4
- **packages/website**: Documentation website

### Key Architecture Concepts

**Core Keyv Class** (`packages/keyv/src/index.ts`):
- Extends EventManager for event emission
- Uses HooksManager for pre/post operation hooks
- Includes StatsManager for usage statistics
- Supports pluggable storage adapters, serialization, and compression
- Handles namespacing, TTL, and key prefixing

**Storage Adapter Interface**:
- Must implement: `get()`, `set()`, `delete()`, `clear()`
- Optional: `getMany()`, `setMany()`, `deleteMany()`, `has()`, `hasMany()`, `iterator()`, `disconnect()`
- Should emit events and extend EventEmitter-like interface

**Serialization**:
- Default uses `@keyv/serialize` package with JSON.stringify/parse
- Compression adapters can be plugged in
- Data format: `{ value: T, expires?: number }`

### Build Dependencies
1. `@keyv/serialize` must be built first (used by keyv core)
2. `keyv` core must be built second (used by adapters)
3. All other packages can be built in parallel

### Testing Requirements
- Docker is required for integration tests with databases/services
- Enable "host networking" in Docker settings for Redis cluster tests
- Test services are managed via scripts in `/scripts/` directory
- Each storage adapter should use `@keyv/test-suite` for compliance testing
- Tests use Vitest with coverage reporting

### Code Style
- TypeScript with strict mode enabled
- Biome for linting and formatting
- Tab indentation, double quotes
- ES modules (`type: "module"`)
- Build targets: CommonJS and ESM with TypeScript definitions

### Package Dependencies
- Workspace packages use `workspace:^` protocol
- Core package (`keyv`) depends only on `@keyv/serialize`
- Storage adapters depend on `keyv` as peer dependency
- Test suite depends on `keyv` and various testing utilities