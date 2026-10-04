#!/bin/bash
# Claude Code cloud sessions: install Aikido Safe Chain, and the workspace dependencies through
# it, with scripts/setup-cloud-environment.sh. Then keep the Safe Chain shims first on PATH for
# the whole session so pnpm, npm, and npx always go through them (see AGENTS.md, "Safe Chain").
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Keep the installer and pnpm output out of the session context; show it only on failure.
log="$(mktemp)"
if ! bash scripts/setup-cloud-environment.sh >"$log" 2>&1; then
  echo "scripts/setup-cloud-environment.sh failed, so dependencies are not installed (full log: $log):" >&2
  tail -n 40 "$log" >&2
  exit 1
fi
rm -f "$log"

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PATH="$HOME/.safe-chain/shims:$HOME/.safe-chain/bin:$PATH"' >>"$CLAUDE_ENV_FILE"
fi

echo "Safe Chain is installed and its shims are first on PATH; dependencies are installed with pnpm install --frozen-lockfile."
