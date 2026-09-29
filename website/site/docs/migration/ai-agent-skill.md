---
title: 'Migrate with an AI Agent'
navTitle: 'AI Agent Skill'
description: 'Upgrade from Keyv v4 or v5 to v6 with a coding agent. Point it at https://keyv.org/skills/migrate, or install the keyv-migrate Agent Skill.'
order: 0
---

# Migrate with an AI Agent

Keyv has an [Agent Skill](https://agentskills.io) that walks a coding agent through an upgrade from Keyv v4 or v5 to v6. It covers the same ground as the [v4 to v5](/docs/migration/v4-to-v5/) and [v5 to v6](/docs/migration/v5-to-v6/) guides, written as steps an agent can follow. It works with Claude Code, Cursor, Codex, GitHub Copilot, and other agents that follow Markdown instructions.

## Point your agent at the skill

You don't have to install anything. Give your agent this prompt:

> Upgrade this project to Keyv v6 using the skill at https://keyv.org/skills/migrate. Fetch it with `curl -sL https://keyv.org/skills/migrate` and follow it.

`https://keyv.org/skills/migrate` returns the skill's `SKILL.md` as plain Markdown. The skill links to reference files and lists their full URLs, so an agent reading it over the web can fetch those too. Asking for `curl` helps with agents whose web tools summarize a page instead of returning it as written.

## Install the skill

When the skill is installed, your agent can load it on its own whenever you ask for a Keyv upgrade, and the reference files are on disk.

With the [`skills` CLI](https://github.com/vercel-labs/skills), which installs skills for Claude Code, Cursor, Codex, GitHub Copilot, and many other agents:

```bash
npx skills add https://keyv.org
# or from GitHub
npx skills add jaredwray/keyv --skill keyv-migrate
```

Or copy the [`skills/keyv-migrate`](https://github.com/jaredwray/keyv/tree/main/skills/keyv-migrate) folder into your agent's skills folder, such as `.claude/skills/` for Claude Code. Then ask: *"Upgrade this project to Keyv v6."*

## What the skill does

1. **Takes inventory.** It finds every package that uses Keyv and the versions in use, every Keyv instance and its store, custom storage adapters, and libraries such as `cache-manager` that still depend on Keyv v5.
2. **Decides what happens to stored data.** v6 removed the default `keyv` namespace, so data written by v4 or v5 reads as missing unless you use the right settings. The skill works out those settings for each adapter, or confirms with you that the data is a cache that can be rebuilt.
3. **Upgrades dependencies.** It pins `keyv` and every `@keyv/*` package to the same v6 version and removes the packages v6 dropped.
4. **Rewrites the code.** Connection strings, `opts`, serialization options, hooks, error handling, raw reads, return values, the iterator, and custom storage adapters.
5. **Verifies.** It runs your typecheck, lint, and tests, and searches again for code that compiles but behaves differently in v6.
6. **Reports.** It lists what changed, the decision for each store, and the steps left for you.

## What it won't do without asking

- Run a migration script or change stored data. It proposes the command and asks you to back up first. SQLite converts its table the first time v6 connects, so the skill also won't point v6 at a real SQLite database on its own.
- Change your Node.js version, your CI configuration, or unrelated dependencies.
- Force Keyv v6 onto a library that depends on v5.

## Links

- Skill source: [skills/keyv-migrate](https://github.com/jaredwray/keyv/tree/main/skills/keyv-migrate) on GitHub
- Raw files: [SKILL.md](https://keyv.org/skills/keyv-migrate/SKILL.md) and the [discovery index](https://keyv.org/.well-known/skills/index.json)
- The Agent Skills format: [agentskills.io](https://agentskills.io)
