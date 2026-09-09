# Defense in Depth

Tracking against https://github.com/jaredwray/agentic/blob/main/skills/security/defense-in-depth-nodejs/SKILL.md.

Profile: npm library · public

This checklist is for the `v5` branch. The same catalog is already complete on `main`.

## 1. Security docs
- [x] `SECURITY.md` present — contact info + "How this repository is secured" summary — PR #2128
- [x] `DEFENSE_IN_DEPTH.md` present (this file) — PR #2128

## 2. CODEOWNERS and cloud bootstrap
- [x] `.github/CODEOWNERS` covers `/.github/`, `/.vscode/`, `/.cursor/`, `/.devcontainer/`, `/scripts/` with owners the maintainer names — PR #2129
- [x] Codespaces and Cursor Cloud Agents bootstrap Aikido Safe Chain via scripts/setup-cloud-environment.sh (--ci shims, frozen lockfile) — PR #2135
- [x] Dev Container `image` pinned by digest (`name:<tag>@sha256:<digest>`; not a floating tag) — verified 2026-09-09 (greenfield template in PR #2135)

## 3. Dependencies (pnpm)
- [x] `packageManager: pnpm@11.3+` pinned in `package.json` — verified 2026-09-08 (`pnpm@12.2.1`)
- [x] 7-day cooldown: `minimumReleaseAge: 10080`, `minimumReleaseAgeStrict: true`, `minimumReleaseAgeIgnoreMissingTime: false`; no first-party `minimumReleaseAgeExclude` — PR #2130
- [x] `trustPolicy: no-downgrade`; no first-party `trustPolicyExclude` — PR #2131
- [x] Lifecycle scripts blocked: `strictDepBuilds: true`, `dangerouslyAllowAllBuilds: false`, `allowBuilds: {}` baseline — PR #2132 (third-party `allowBuilds` exceptions: esbuild, protobufjs, sqlite3)
- [x] `blockExoticSubdeps: true` — PR #2133
- [x] Lockfile committed; CI installs with `pnpm install --frozen-lockfile` — PR #2134
- [x] No `.github/dependabot.yml`; other dependency-update tools (if any) open PRs only — never auto-merge — verified 2026-09-08

## 4. GitHub Actions
- [x] `permissions: contents: read` (or `{}` + per-job grants) on every workflow — PR #2136
- [x] No `contents: write` except jobs whose purpose is mutating the repo (GitHub Release, Changesets version PR); generated output is a workflow artifact, never committed back from CI — verified 2026-09-09 (no remaining `contents: write`, `git commit` / `git push`, or auto-commit actions)
- [x] Every action pinned to a full commit SHA (`npx actions-up`) — PR #2137
- [x] Every job installs Socket Firewall (`SocketDev/action` SHA-pinned, `firewall-version` pinned); `pnpm install` / `npm install` run as `sfw pnpm install` / `sfw npm install` — PR #2138
- [x] `.github/workflows/check-workflows.yaml` lints workflows with zizmor on every PR — PR #2139
- [ ] Workflow `name:` and job `name:` contain no spaces (kebab-case) so they can be set as required status checks (PR pending)
- [x] `persist-credentials: false` on checkouts that don't push — verified 2026-09-09 (required for zizmor to pass)
- [x] No `pull_request_target` on workflows that run untrusted PR code — verified 2026-09-08
- [ ] Artifact-publishing workflows disable `actions/setup-node` default caching (`package-manager-cache: false`) to prevent cache poisoning
- [ ] No npm tokens (or other registry credentials) in Actions secrets

## 5. npm publishing — npm libraries only
- [ ] OIDC trusted publishing configured **stage-only** on npmjs.com for the publish workflow — it can stage, never publish live (manual)
- [ ] `.github/workflows/release.yaml` packs then stages with `pnpm stage publish ./packed/*.tgz --no-git-checks`
- [ ] Maintainer promotes staged versions with 2FA (manual)
- [ ] Drydock connected — staged releases reviewed before promotion (manual)
- [ ] No direct publish rights: package requires 2FA and disallows tokens (manual)
- [x] `package.json` `repository.url` accurate so provenance maps to this repo — verified 2026-09-08

## 6. Security tooling
- [x] Aikido runs on every build — verified 2026-09-08 (PR #2127: Aikido Security: check code)
- [ ] Aikido release gate: the release workflow's stage-publish job `needs:` a passing `scan-release`
- [x] Socket reviews every PR that changes dependencies — verified 2026-09-08 (PR #2127: Socket Security Pull Request Alerts and Project Report)

## 7. Repository lockdown
- [ ] Phishing-resistant 2FA (passkeys / hardware keys) on the GitHub and npm accounts (manual)
- [ ] Recovery codes stored offline in a password manager (manual)
- [ ] `lockdown-repo.sh` applied by a repo admin (never committed to this repo); `--check` with `--required-checks` and `--allowed-actions` passes (PRs required on the default branch, merges blocked unless required status checks pass, tag ruleset, immutable releases, fork-PR approval (public repos), read-only workflow tokens, Actions allowlist, secret scanning, Dependabot disabled, private vulnerability reporting (public repos))
