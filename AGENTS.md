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
- `@keyv/valkey-glide` uses its own standalone Valkey instance on port 6371 so other packages cannot clear its test data
- Packages run their tests in parallel, so they must not share a cluster: `@keyv/redis` flushes its cluster (ports 7001-7003) before each test, `@keyv/valkey` uses its own (7101-7103), and `@keyv/valkey-glide` uses ports 7201-7203. Give a new adapter that needs a cluster its own as well
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

## Simplified Technical English

Write in ASD-STE100 Simplified Technical English (STE). Get the current issue of the specification
free of charge from <https://www.asd-ste100.org>. STE applies to all text that you write for this
repository, its pull requests, and its issues. This text includes documentation, code comments,
commit messages, review replies, and changelog entries.

- Use approved STE words with their approved meanings. You can also use technical names and
  technical verbs. If you cannot confirm that a word is approved, use a short, common word with one
  meaning.
- Use one word for one meaning.
- Write an instruction in the imperative. Write one instruction in each sentence.
- Do not write more than 20 words in an instruction or 25 words in a descriptive sentence.
- Use the active voice.
- Use only the simple present, simple past, or simple future tense. Do not use the present perfect.
- Do not use the "-ing" form of a verb, except in a technical name.
- Do not write a noun cluster of more than three words.
- Do not omit articles, verbs, or subjects to make a sentence shorter.
- Write one topic in each paragraph. Do not write more than six sentences in a paragraph.
- Use a vertical list for steps, conditions, and other complex text.
- Do not change code, commands, identifiers, file paths, or quoted text to make them STE.
- Use STE for the text that you add or change. Do not rewrite other text only to make it STE.

## Test audit

Apply this gate to each test that a pull request adds, changes, or deletes. Apply it before you open
or update the pull request. This gate is the authoring gate of the `test-audit` skill in
`jaredwray/agentic`. If that skill is installed, use it.

Keep a new or changed test only if you can answer all four questions:

1. Which observable behavior, invariant, or contract does the test protect?
2. Which credible regression makes the test fail?
3. Why does the current coverage not find that regression? If a test or its table owns the
   contract, extend it. Do not add a near-duplicate test.
4. Does the test need an export, flag, or hook that no production caller uses? If yes, test at the
   real boundary.

- A regression test for a bug fix must fail on the code before the fix, for the intended reason.
- Do not keep a test that asserts nothing, restates the implementation, repeats the type checker,
  or only proves a mock.
- A coverage target does not lower this bar. Reach an uncovered line through its public entry
  point. If no caller can reach a branch, remove the branch. Do not add a test for it.
- Delete a test only when a different test proves its contract, or when the contract is gone. Do
  not delete a test because it fails.
- Record the gate in the verification list of the pull request body. List each test that you did
  not keep, rewrote, or deleted, and give the reason. For a deleted test, name the test that proves
  its contract, or show that the contract is gone.
- Do not audit tests that this pull request does not touch. Audit them in a separate pull request.

## Pull requests

The task does not stop when you open a pull request. Do these steps before you start a different
task:

1. Wait approximately 20 minutes for automated and human code reviews.
2. Read each new comment. Find each comment that has a finding, a question, or a change request.
3. Examine the code for each finding or change request. Decide if it is correct. Do not decide from
   who the reviewer is.
4. If it is correct, change the code. Run the same checks that CI runs. Push the change. On the
   thread, reply with what changed and the commit SHA.
5. If it is not correct, reply on the thread with the reason. Give the file and line. Do not
   resolve the thread. The reviewer closes it.
6. If a comment asks a question, answer it on the thread.
7. If CI fails, find the root cause and fix it. Do not skip or disable a test to make CI pass.
8. If you pushed a change or CI did not finish, do steps 1 to 7 again. Stop when CI passes and each
   finding, question, and change request has a reply.

Do not reply to a comment that needs no answer: your own replies, approvals, thanks, and bot status
notices. A reply to one of these comments starts the loop again.
