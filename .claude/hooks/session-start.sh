#!/usr/bin/env bash
# SessionStart hook for Claude Code on the web: bootstrap Aikido Safe Chain and
# install dependencies through its shims, as .devcontainer and .cursor do.
#
# Hook stdout is injected into the session, so the install log goes to stderr.
# Shim PATH is written by setup-cloud-environment.sh before that script can fail
# (CLAUDE_ENV_FILE). Do not append it here after the bootstrap: a failed hook
# would then leave the package managers unshimmed.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

bash ./scripts/setup-cloud-environment.sh >&2
