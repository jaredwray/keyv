# Changelog

Release notes for the **v5 maintenance line** of Keyv, one Markdown file per
release cut.

`main` (v6) produces its changelog through its own release tooling. The `v5`
branch does not, so releases here are written by hand in this folder. Each file
documents a single release cut and may span more than one workspace package —
each package keeps its own semver (e.g. a cut can ship `keyv@5.6.1` and
`@keyv/sqlite@4.1.0` together).

## Cutting a v5 release

Publishing is manual by design and goes through npm **staged publishing**: CI
only ever *stages* packages (with provenance, via OIDC trusted publishing — no
tokens), and a maintainer approves each staged version with 2FA before it
becomes installable. GitHub Releases never trigger publishing on this branch.

1. **Release PR into `v5`.** Bump `version` in each package that has unreleased
   changes (never `6.0.0` or higher — v6 ships from `main`), add
   `changelog/<name>.md` and link it below, then merge.
2. **Run the `release` workflow from `v5`.** Actions → `release` → "Run
   workflow" → set "Use workflow from" to `v5`. Leave **Dry run** checked first:
   the job summary shows the stage plan — which packages would be staged (local
   version ahead of npm) under which dist-tag, and which are skipped — and
   validates packaging. Run it again with Dry run unchecked to stage for real.
   Any ref other than `v5` is forced to a dry run.
3. **What the run does.** Builds, runs the full test suite and the release-logic
   tests (`pnpm test:release`), then `scripts/release.mjs` packs each package
   whose version is not on npm and runs
   `pnpm stage publish <tarball> --tag <tag> --provenance` in dependency order
   (`@keyv/serialize` → `keyv` → adapters). Nothing is installable yet; the job
   summary lists what was staged.
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
   `v5` head. It publishes nothing.

Rules of thumb:

- **Approve in the same sitting.** The dist-tag is fixed when a version is
  staged and applied when it is approved. If `latest` moved to a newer major in
  between, `pnpm stage reject <stage-id>` and re-run the workflow so the tag is
  recomputed (`v5-lts`).
- **Never approve a dependent** whose dependency was not staged or approved; the
  script already skips dependents of a package that failed to stage.
- **CI cannot see the stage queue.** Re-running before approving reports already
  staged versions as conflicts (the registry rejects the duplicate); approve or
  reject them in the queue rather than re-staging.
- **A brand-new package cannot be staged.** Publish it manually once, then it
  joins the normal flow.

## Releases

- [v5.6.1](./v5.6.1.md) — 2026-07-03 · `keyv@5.6.1`, `@keyv/sqlite@4.1.0`
