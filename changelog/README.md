# Changelog

Release notes for the **v5 maintenance line** of Keyv, one Markdown file per
release cut.

`main` (v6) produces its changelog through its own release tooling. The `v5`
branch does not, so releases here are written by hand in this folder. Each file
documents a single release cut and may span more than one workspace package —
each package keeps its own semver (e.g. a cut can ship `keyv@5.6.1` and
`@keyv/sqlite@4.1.0` together).

Publishing is handled by the manual **`release`** GitHub Actions workflow
(`.github/workflows/release.yaml`), run from the `v5` branch after the release PR
merges. That workflow publishes every workspace package whose local `version` is
ahead of npm, under the dist-tag `scripts/release.mjs` computes, via OIDC trusted
publishing — it never bumps versions itself.

## Releases

- [v5.6.1](./v5.6.1.md) — 2026-07-03 · `keyv@5.6.1`, `@keyv/sqlite@4.1.0`
