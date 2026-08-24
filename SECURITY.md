# Security Policy

We take security seriously and work to keep this project up to date. If you discover a security vulnerability, please report it **privately** so we can investigate and ship a fix before the issue becomes public.

## Reporting a vulnerability

Please use one of the following private channels — **do not open a public issue, pull request, or discussion** for security concerns:

1. **Preferred:** open a private report via GitHub's [Privately reporting a security vulnerability](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) flow on this repository's **Security** tab.
2. **Email:** send the details to me@jaredwray.com. If the issue is urgent, include `[SECURITY]` in the subject line and we will respond as soon as possible.

When reporting, please include as much of the following as you can:

- A description of the vulnerability and its impact.
- Steps to reproduce, or a proof-of-concept.
- The affected version(s) and platform.
- Any suggested remediation, if you have one.

We will acknowledge receipt, work with you on a coordinated disclosure timeline, and credit you in the advisory once a fix is published unless you ask to remain anonymous.

## How this repository is secured

This repository follows the [defense-in-depth](https://github.com/jaredwray/agentic/blob/main/skills/security/defense-in-depth-nodejs/SKILL.md)
hardening checklist; progress is tracked in [DEFENSE_IN_DEPTH.md](./DEFENSE_IN_DEPTH.md). Measures currently in place:

- pnpm is pinned via `packageManager` (`pnpm@11.18.0`).
- Dependencies install through pnpm with a 7-day cooldown on new versions, lifecycle scripts blocked by default, and `trustPolicy: no-downgrade`.
- The lockfile is committed and CI installs with `--frozen-lockfile`. There is no Dependabot config; dependency updates go through reviewed PRs.
- Workflows do not use `pull_request_target` and do not store npm tokens (OIDC trusted publishing).
- Published packages set `repository.url` to this repo so provenance can map back.
- Socket reviews every pull request that changes dependencies.
- Codespaces and Cursor Cloud Agents install through Aikido Safe Chain; package-manager shims must not be bypassed.
