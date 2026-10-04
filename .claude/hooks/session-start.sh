#!/bin/bash
# Claude Code cloud sessions: install Aikido Safe Chain, and the workspace dependencies through
# it, with scripts/setup-cloud-environment.sh. Then keep the Safe Chain shims first on PATH for
# the whole session so pnpm, npm, and npx always go through them (see AGENTS.md, "Safe Chain").
#
# A SessionStart hook can't stop the session, so until Safe Chain is installed this fails closed
# another way: a guard directory first on PATH holds npm, npx, pnpm, and pnpx commands that
# refuse to run. To retry a failed install, run this script again with CLAUDE_CODE_REMOTE=true.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

guard="$HOME/.safe-chain-guard"
guarded="npm npx pnpm pnpx"
retry="To retry the install, run CLAUDE_CODE_REMOTE=true .claude/hooks/session-start.sh from the repository root."

safe_chain_installed() {
  [ -x "$HOME/.safe-chain/bin/safe-chain" ] || return 1
  for name in $guarded; do
    [ -x "$HOME/.safe-chain/shims/$name" ] || return 1
  done
}

# The hook input's "source" names what started the session: startup, resume, clear, compact, or
# fork. Run by hand, there's no input, and it counts as startup.
started_by=startup
if [ ! -t 0 ]; then
  input="$(timeout 5 cat || true)"
  if [[ $input =~ \"source\"[[:space:]]*:[[:space:]]*\"([a-z]+)\" ]]; then
    started_by="${BASH_REMATCH[1]}"
  fi
fi

# The guard directory comes first on PATH and only exists while Safe Chain is missing, so this
# one line covers both cases. It goes in before the install, which can fail or time out, and is
# added once, whether or not the env file kept it from an earlier run.
path_line='export PATH="$HOME/.safe-chain-guard:$HOME/.safe-chain/shims:$HOME/.safe-chain/bin:$PATH"'
if [ -n "${CLAUDE_ENV_FILE:-}" ] && ! grep -Fqx "$path_line" "$CLAUDE_ENV_FILE" 2>/dev/null; then
  echo "$path_line" >>"$CLAUDE_ENV_FILE"
fi

if ! safe_chain_installed; then
  mkdir -p "$guard"
  for name in $guarded; do
    cat >"$guard/$name" <<EOF
#!/bin/sh
echo "$name is blocked because Safe Chain isn't installed (see AGENTS.md, \"Safe Chain\"). $retry" >&2
exit 1
EOF
    chmod +x "$guard/$name"
  done
fi

status=0
message="Safe Chain is installed and its shims are first on PATH."

# Install when the session starts. After resume, /clear, compaction, or a fork, the container
# already has Safe Chain and the dependencies, so only install if Safe Chain is missing.
if [ "$started_by" = startup ] || ! safe_chain_installed; then
  # The installer runs pnpm, so it runs without the guard on PATH. Its output stays out of the
  # session context and is shown only on failure.
  setup_path="$(printf '%s\n' "$PATH" | tr ':' '\n' | { grep -vFx "$guard" || true; } | paste -sd: -)"
  log="$(mktemp)"
  if PATH="$setup_path" bash scripts/setup-cloud-environment.sh >"$log" 2>&1; then
    rm -f "$log"
    message="$message Dependencies are installed with pnpm install --frozen-lockfile."
  else
    echo "scripts/setup-cloud-environment.sh failed (full log: $log):" >&2
    tail -n 40 "$log" >&2
    status=1
  fi
fi

if safe_chain_installed; then
  rm -rf "$guard"
else
  echo "Safe Chain isn't installed, so npm, npx, pnpm, and pnpx are blocked for this session. $retry" >&2
  status=1
fi

if [ "$status" -eq 0 ]; then
  echo "$message"
fi
exit "$status"
