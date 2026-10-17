# Changelog

Release notes for the **v5 maintenance line** of Keyv, one Markdown file per
release cut.

`main` (v6) produces its changelog through its own release tooling. On `v5`,
[Changesets](https://github.com/changesets/changesets) bumps each public
package independently and writes that package's `CHANGELOG.md`. This folder
still holds one hand-written note per release cut, which may span more than
one workspace package — each package keeps its own semver (e.g. a cut can ship
`keyv@5.6.1` and `@keyv/sqlite@4.1.0` together). Private packages are ignored.

## Cutting a v5 release

Publishing is manual by design and goes through npm **staged publishing**: CI
only ever *stages* packages (with provenance, via OIDC trusted publishing — no
tokens), and a maintainer approves each staged version with 2FA before it
becomes installable. GitHub Releases never trigger publishing on this branch.

1. **Release PR into `v5`.** Add one changeset per user-facing change
   (`pnpm changeset`), then run `pnpm exec changeset version`. That bumps
   `version` in each affected public package (never `6.0.0` or higher — v6
   ships from `main`; `scripts/release.mjs` refuses it), writes
   `packages/<name>/CHANGELOG.md`, and deletes the consumed changeset files.
   Leave `.changeset/config.json`. Do not bump a package for devDependency-only
   or CI-only changes, and do not leave changeset files that would bump again
   on the next `changeset version`. Also add `changelog/<name>.md` and link it
   below, then merge. If `keyv` itself is not part of the cut, name the file
   for the date or the packages, not `v5.x.y`.
2. **Run the `release-v5` workflow from `v5`.** Actions → `release-v5` → "Run
   workflow" → set "Use workflow from" to `v5`. Leave **Dry run** checked first:
   the job summary shows the stage plan — which packages would be staged (local
   version ahead of npm) under which dist-tag, and which are skipped — and
   validates packaging. Run it again with Dry run unchecked to stage for real.
   Any ref other than `v5` is forced to a dry run. (`main` carries a copy of
   `release-v5.yaml` only so GitHub lists the workflow; it refuses to run.)
3. **What the run does.** Builds, runs the full test suite, the Aikido release
   scan and the release-logic tests (`pnpm test:release`), then `scripts/release.mjs` packs each package
   whose version is not on npm and runs
   `pnpm stage publish <tarball> --tag <tag> --provenance` in dependency order
   (`@keyv/serialize` → `keyv` → adapters). Nothing is installable yet; the job
   summary lists what was staged. Nothing from this branch is ever tagged
   `latest` (that tag belongs to v6 on `main`): a stable version stages under
   `v{major}-lts` (`keyv@5.x` → `v5-lts`, `@keyv/sqlite@4.x` → `v4-lts`,
   `@keyv/serialize@1.x` → `v1-lts`), a pre-release under its channel, or
   `v{major}-{channel}` when v6 owns that channel.
4. **Approve with 2FA** (pnpm ≥ 11.25 or npm ≥ 11.15, logged in to npm):
   ```sh
   pnpm stage list                 # staged versions awaiting approval
   pnpm stage view <stage-id>      # verify version, dist-tag and provenance
   pnpm stage approve <stage-id>…  # promotes to the registry; one OTP per batch
   ```
   Approve in dependency order (`@keyv/serialize` → `keyv` → adapters); a batch
   approve run inside the workspace does this automatically. The "Staged
   Packages" tab on npmjs.com works too. Verify with `npm view keyv dist-tags`.
5. **Optional GitHub Release** for release notes: tag `v5-YYYY-MM-DD` on the
   `v5` head. It publishes nothing: a GitHub Release runs the workflows at the
   tag's commit, `release-v5.yaml` has no `release` trigger, and main's
   `release.yaml` refuses any tag whose commit is not on `main`.

Rules of thumb:

- **Approve in the same sitting.** The dist-tag is fixed when a version is
  staged and applied when it is approved. If the registry moved in between,
  `pnpm stage reject <stage-id>` and re-run the workflow so the tag is
  recomputed.
- **Never approve a dependent** whose dependency was not staged or approved; the
  script already skips dependents of a package that failed to stage.
- **CI cannot see the stage queue.** Re-running before approving reports already
  staged versions as conflicts (the registry rejects the duplicate); approve or
  reject them in the queue rather than re-staging.
- **Overlapping v5 releases wait their turn.** Runs of `release-v5` share a
  concurrency group with a FIFO queue, so a run dispatched while another is in
  flight stays pending until it finishes.

## New packages

npm cannot stage a package that does not exist yet, and trusted publishing
cannot create one, so the release script refuses a never-published package at
plan time. Creating a new package on npm is the **one deliberate exception** to
"never publish directly": a maintainer publishes its first version by hand,
with 2FA, from a clean checkout of the merged release commit —

```sh
pnpm --filter <name> publish --access public
```

— then adds the stage-only trusted publisher for it on npmjs.com (repo
`jaredwray/keyv`, workflow `release-v5.yaml`, environment `release`). Every later
version of that package goes through the workflow like any other.

## Releases

- [2026-10-17](./2026-10-17.md) — 2026-10-17 · `@keyv/redis@5.2.0`, `@keyv/bigmap@1.4.0`, `@keyv/compress-gzip@2.0.4`, `@keyv/serialize@1.1.2`, `@keyv/dynamo@1.2.5`, `@keyv/mongo@3.1.1`, `@keyv/mysql@2.1.11`, `@keyv/postgres@2.2.4`, `@keyv/valkey@1.0.12`, `@keyv/test-suite@2.1.3`
- [v5.6.1](./v5.6.1.md) — 2026-07-03 · `keyv@5.6.1`, `@keyv/sqlite@4.1.0`
