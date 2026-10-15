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

### Releasing (v5 line)
- Versions are bumped by hand in a release PR; `scripts/release.mjs` never bumps them, and nothing on this branch may be `6.0.0` or higher (v6 ships from `main`)
- `pnpm release:dry` - Print the stage plan (which packages are ahead of npm, under which dist-tag) and validate packaging; stages nothing
- `pnpm test:release` - Unit tests for the release decision logic and the exact `pnpm stage publish … --provenance` command (CI runs them before staging)
- Publishing is manual: Actions → `release` → "Run workflow" with "Use workflow from" set to `v5`. CI only **stages** packages on npm (`pnpm stage publish` with provenance via OIDC trusted publishing); a maintainer approves them with 2FA (`pnpm stage list` / `pnpm stage view <id>` / `pnpm stage approve <id>…`, dependencies first)
- Never run `pnpm publish` for a release. The one exception is creating a brand-new package on npm, which staging cannot do — see "New packages" in `changelog/README.md`, which also has the full runbook

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

Aikido Safe Chain shims examine each package that a package manager installs in this environment.
Never bypass the shims.

- Keep `~/.safe-chain/shims` first on `PATH`.
- Run `npm`, `npx`, `pnpm`, and `pnpx` only through the shims. Do not run a different copy by its
  full path.
- Do not install a package with `curl | sh` or with a package manager that has no shim.
- If Safe Chain blocks a package, stop. Do not use a different command, path, or package to get the
  same code. Tell the user the package name and the Safe Chain message.

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
