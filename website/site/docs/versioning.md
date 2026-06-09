---
title: 'Versioning & Release Tags'
order: 4
---

# Versioning & Release Tags

Keyv supports more than one major version at a time, so the npm [dist-tags](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/) are managed deliberately. This page explains which tag points where and which install command to use.

Since **v6**, all Keyv packages — the core `keyv` package and every official adapter (`@keyv/redis`, `@keyv/postgres`, …) — share a single version and are released together, so the tags below apply consistently across the whole family. (v5 and earlier versioned each package independently — see [Why all packages share one version](#why-all-packages-share-one-version) for the reasoning.)

## Which version do I get?

```bash
pnpm add keyv          # latest stable (recommended)
pnpm add keyv@beta     # the newest v6 pre-release
pnpm add keyv@5        # the newest stable v5 release
pnpm add keyv@4        # the newest stable v4 release
```

From v6 on, an adapter shares Keyv's version, so `pnpm add @keyv/redis@6` lines up with `keyv@6`. (On v5 and earlier, adapters carried their own version numbers — see [Why all packages share one version](#why-all-packages-share-one-version).)

## Dist-tags

| Tag | Points to | Use it for |
| --- | --- | --- |
| `latest` | Newest **stable** release of the current major | The default — `pnpm add keyv` |
| `beta` | Newest **v6 pre-release** | Trying v6 before it ships |
| `v5-lts` | Newest **stable v5** release | Pinning the v5 line explicitly (appears once v6 is `latest`) |

> While a major is still in pre-release, `latest` stays on the previous stable major. Today `latest` is **v5** and `beta` is **v6**; when v6 ships stable, `latest` moves to v6 and `v5-lts` tracks the v5 line.

## Why keyv@5 works without a special tag

You may notice there is no `v5` or `v6` dist-tag. That is intentional: npm **rejects** dist-tag names that look like a semver version or range, so a tag literally named `v6` is not allowed. Instead, `keyv@5`, `keyv@v5`, and `keyv@6` are interpreted as **semver ranges** (`5.x`, `6.x`) and npm resolves them to the newest matching **stable** release automatically — no tag required.

One consequence: a semver range only matches stable releases. While v6 is in pre-release, `keyv@6` matches nothing, so use **`keyv@beta`** to try it. Once v6 ships a stable release, `keyv@6` starts resolving to it.

## How releases are tagged

Each release computes its tag from its version:

- **Pre-release** (e.g. `6.0.0-beta.1`) → published under the pre-release channel (`beta`). Never touches `latest`.
- **Stable, current major** → published under `latest`.
- **Stable, older major** → published under `v{major}-lts` (e.g. `v5-lts`). An older major can never move `latest`.

A safety guard refuses any release that would move `latest` backwards, so `pnpm add keyv` always installs a forward-moving stable line.

## Why all packages share one version

Before v6, each Keyv package was versioned independently — a package only got a new version when its own code changed. That is the textbook semver approach, but for a family of packages designed to be used together it created friction:

- **Compatibility was a guessing game.** Which `@keyv/redis` works with which `keyv`? You had to consult a compatibility matrix instead of reading it off the version number.
- **Dist-tags didn't line up.** `keyv@beta` and `@keyv/redis@beta` could point at unrelated version numbers, and a range like `@keyv/redis@6` would not necessarily match `keyv@6`.
- **Adapters looked stale.** A solid adapter that simply hadn't changed in a while would lag several majors behind core, reading as unmaintained when it was fine.
- **Coordinated changes were awkward.** The v6 overhaul touched core, serialization, compression, and the adapters together; shipping that cleanly wants a single coordinated release, not a dozen independently-versioned ones.

From v6 onward we version the whole family together: every package shares one version and is published at the same time. Now the version number *is* the compatibility statement — `keyv@6.2.0` is built and tested against `@keyv/redis@6.2.0` — and every dist-tag (`latest`, `beta`, `v5-lts`) means the same thing across every package.

The trade-off is that a package can get a new version even when its own code didn't change, simply because the family moved. We accept that: the clarity of "install everything at the same version" is worth more than a per-package number that strictly reflects only that package's own diffs.

These family-wide behaviors — shared versions, and a dist-tag meaning the same thing everywhere — describe **v6 onward**. The v5 and v4 lines keep the independent versions they shipped with, so on those lines you pin each adapter to its own compatible release.

## Maintenance & breaking changes on LTS

**Our goal: an LTS line never changes its API landscape.** We aim for staying within a major (`keyv@5`) to mean `pnpm update` is safe — your code keeps compiling and behaving the same. "API landscape" here means the public types and method signatures, constructor options, events, runtime behavior, and the supported runtimes (Node.js versions, ESM/CJS). We work to keep all of these stable across an LTS line.

Breaking changes — to Keyv's API or to its supported runtimes — only ever land on the **current development major** (today, v6).

### When an underlying dependency releases a breaking major on LTS

Keyv's core has no dependencies, but the storage adapters wrap third-party drivers (for example `@keyv/redis` over its Redis client, `@keyv/sqlite` over its SQLite driver). When one of those drivers ships a breaking major, the question is **not** "did the dependency have a major?" but "**does adopting it change Keyv's own contract?**":

- **It can be absorbed** — the adapter handles the difference internally and nothing observable changes for you (same API, same behavior, same supported Node versions). → We ship it as a **minor** release on the LTS line. (A pure security or internal-only fix may be a **patch**.) A dependency major is significant enough that we signal it with a minor rather than a patch, even though your code needs no changes.
- **It cannot be absorbed** — adopting it would change Keyv's API, alter a default you rely on, or drop a supported runtime (e.g. the driver drops an older Node version). → We **do not** take it on the LTS line. The LTS line stays on the last compatible driver major, and the upgrade lands only on the current development major.

So a major bump of an inner dependency never forces a major bump of Keyv, and it never forces a breaking change onto LTS. The dependency's version number doesn't drive Keyv's — Keyv's public contract does. That is what semver actually versions: *our* API, not our dependencies' APIs.

> Because all Keyv packages share one version, a dependency change in a single adapter is released as a version bump across the whole family. That is expected — the family always moves together. (This is the v6 model; on the v5 line, which still uses independent versions, only the changed adapter bumps.)

### When a dependency raises its Node.js requirement

Raising the minimum supported Node.js version is itself a **breaking change** — it is part of the runtime contract above, even when no code changes. A user on the dropped Node version who runs `pnpm update` would suddenly be unable to install or run Keyv. So we treat a dependency that raises its Node floor exactly like any other change we cannot absorb:

- **On an LTS line (and on any already-released major):** we never raise the Node floor. If a driver's new version requires a newer Node than the line supports, the line stays on the last driver version compatible with its committed Node range. The newer driver is adopted only in the next Keyv major.
- **Node floor increases happen only at a major boundary.** A new Keyv major may raise its minimum Node version — and is the place where we adopt drivers that did. While that major is still in pre-release the floor can still move; once it ships stable, the floor is fixed for that major's lifetime.

In short, `engines.node` on a released line never goes up. We track Node.js's own [release schedule](https://nodejs.org/en/about/previous-releases) and drop end-of-life Node versions only when we cut a new major — never on LTS, and never mid-major.

### Security fixes on LTS versions

Security is the one thing that can override "no changes on LTS", and we work hard to avoid even that. If a vulnerability's only fix lives in a driver major that *would* break Keyv's contract, we first try to pin a patched release of the compatible major, or get the fix backported. Only if there is genuinely no compatible fix do we make an announced, documented exception — this is rare and clearly communicated.

### Peer dependencies

Some adapters take their driver as a peer dependency, so you control its version. On an LTS line we keep the supported peer range stable; support for a driver's new breaking major is added on the current development major, not backported.

For the v5 → v6 changes themselves, see the [v5 to v6 Migration](/docs/v5-to-v6) guide.
