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

# pnpm 12 starts from bin/pnpm.mjs, which corepack supports from 0.36.0. The corepack
# bundled with Node 22 looks for bin/pnpm.cjs and fails, so install a current one through
# the Safe Chain npm shim and put its pnpm shim in SAFE_CHAIN_BIN, ahead of Node's on PATH.
if [[ -f package.json ]] && grep -q '"packageManager"' package.json; then
  corepack_dir="${HOME}/.safe-chain/corepack"
  npm install --prefix "$corepack_dir" --no-save --no-audit --no-fund corepack@0.36.0
  "${corepack_dir}/node_modules/.bin/corepack" enable --install-directory "$SAFE_CHAIN_BIN" pnpm

  # An older corepack that already ran this pnpm version cached it with the missing launcher.
  pnpm_version=$(sed -nE 's/.*"packageManager": *"pnpm@([^+"]+).*/\1/p' package.json)
  pnpm_cache="${COREPACK_HOME:-${HOME}/.cache/node/corepack}/v1/pnpm/${pnpm_version}"
  if [[ "$pnpm_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && -f "${pnpm_cache}/.corepack" && ! -e "${pnpm_cache}/bin/pnpm.cjs" ]] \
    && grep -q 'pnpm\.cjs' "${pnpm_cache}/.corepack"; then
    rm -rf "$pnpm_cache"
  fi
fi

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
