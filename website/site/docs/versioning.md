---
title: 'Versioning & Release Tags'
order: 4
---

# Versioning & Release Tags

Keyv supports more than one major version at a time, so the npm [dist-tags](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/) are managed deliberately. This page explains which tag points where and which install command to use.

All Keyv packages — the core `keyv` package and every official adapter (`@keyv/redis`, `@keyv/postgres`, …) — share a single version and are released together, so the tags below apply consistently across the whole family.

## Which version do I get?

```bash
pnpm add keyv          # latest stable (recommended)
pnpm add keyv@beta     # the newest v6 pre-release
pnpm add keyv@5        # the newest stable v5 release
pnpm add keyv@4        # the newest stable v4 release
```

The same works for any adapter, e.g. `pnpm add @keyv/redis@5`.

## Dist-tags

| Tag | Points to | Use it for |
| --- | --- | --- |
| `latest` | Newest **stable** release of the current major | The default — `pnpm add keyv` |
| `beta` | Newest **v6 pre-release** | Trying v6 before it ships |
| `v5-lts` | Newest **stable v5** release | Pinning the v5 line explicitly (appears once v6 is `latest`) |

> While a major is still in pre-release, `latest` stays on the previous stable major. Today `latest` is **v5** and `beta` is **v6**; when v6 ships stable, `latest` moves to v6 and `v5-lts` tracks the v5 line.

## Why `keyv@5` works without a special tag

You may notice there is no `v5` or `v6` dist-tag. That is intentional: npm **rejects** dist-tag names that look like a semver version or range, so a tag literally named `v6` is not allowed. Instead, `keyv@5`, `keyv@v5`, and `keyv@6` are interpreted as **semver ranges** (`5.x`, `6.x`) and npm resolves them to the newest matching **stable** release automatically — no tag required.

One consequence: a semver range only matches stable releases. While v6 is in pre-release, `keyv@6` matches nothing, so use **`keyv@beta`** to try it. Once v6 ships a stable release, `keyv@6` starts resolving to it.

## How releases are tagged

Each release computes its tag from its version:

- **Pre-release** (e.g. `6.0.0-beta.1`) → published under the pre-release channel (`beta`). Never touches `latest`.
- **Stable, current major** → published under `latest`.
- **Stable, older major** → published under `v{major}-lts` (e.g. `v5-lts`). An older major can never move `latest`.

A safety guard refuses any release that would move `latest` backwards, so `pnpm add keyv` always installs a forward-moving stable line.

For the v5 → v6 changes themselves, see the [v5 to v6 Migration](/docs/v5-to-v6) guide.
