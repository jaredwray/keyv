#!/usr/bin/env bash
# setup-cloud-environment.sh — Aikido Safe Chain bootstrap for Codespaces and Cursor Cloud Agents.
#
# Fail closed: never install dependencies unless Safe Chain shims are on PATH.
# Copied into the target repo as scripts/setup-cloud-environment.sh.

set -euo pipefail

export SAFE_CHAIN_VERSION="1.5.15"
SAFE_CHAIN_INSTALLER_SHA256="de0565e3d6346407a604e84e639e95fea8758748063da2216bbfdca5feda5dd2"
SAFE_CHAIN_INSTALLER_URL="https://github.com/AikidoSec/safe-chain/releases/download/${SAFE_CHAIN_VERSION}/install-safe-chain.sh"
SAFE_CHAIN_SHIMS="${HOME}/.safe-chain/shims"
SAFE_CHAIN_BIN="${HOME}/.safe-chain/bin"

if git_root=$(git rev-parse --show-toplevel 2>/dev/null); then
  cd "$git_root"
fi

if [[ ! -f pnpm-lock.yaml ]]; then
  echo "error: pnpm-lock.yaml is required; refusing to install without a frozen lockfile" >&2
  exit 1
fi

if [[ -f package.json ]] && grep -q '"packageManager"' package.json && command -v corepack >/dev/null; then
  corepack enable
fi

if ! command -v pnpm >/dev/null; then
  echo "error: pnpm is required on PATH before Safe Chain can wrap it" >&2
  exit 1
fi

installer=$(mktemp)
trap 'rm -f "$installer"' EXIT

curl -fsSL "$SAFE_CHAIN_INSTALLER_URL" -o "$installer"
echo "${SAFE_CHAIN_INSTALLER_SHA256}  ${installer}" | sha256sum -c -

sh "$installer" --ci

export PATH="${SAFE_CHAIN_SHIMS}:${SAFE_CHAIN_BIN}:${PATH}"

persist_shim_path() {
  local rc="$1"
  local line="export PATH=\"${SAFE_CHAIN_SHIMS}:${SAFE_CHAIN_BIN}:\$PATH\""
  if [[ -f "$rc" ]] && grep -Fq ".safe-chain/shims" "$rc"; then
    return 0
  fi
  mkdir -p "$(dirname "$rc")"
  printf '\n# Aikido Safe Chain shims\n%s\n' "$line" >> "$rc"
}

persist_shim_path "${HOME}/.profile"
persist_shim_path "${HOME}/.bashrc"
persist_shim_path "${HOME}/.zshrc"

if [[ -n "${GITHUB_PATH:-}" ]]; then
  printf '%s\n' "$SAFE_CHAIN_SHIMS" >> "$GITHUB_PATH"
  printf '%s\n' "$SAFE_CHAIN_BIN" >> "$GITHUB_PATH"
fi

pnpm safe-chain-verify
pnpm install --frozen-lockfile
