#!/bin/sh
set -eu

DS4_ROOT=${1:-$(pwd)}
DS4_ROOT=$(CDPATH= cd -- "$DS4_ROOT" && pwd)

if [ ! -x "$DS4_ROOT/harness/start-codex-ds4-cli.sh" ]; then
    echo "Missing harness in $DS4_ROOT. Run scripts/install-into-ds4.sh first." >&2
    exit 1
fi

CODEX_BIN=${CODEX_BIN:-}
if [ -z "$CODEX_BIN" ] && [ -x /Applications/Codex.app/Contents/Resources/codex ]; then
    CODEX_BIN=/Applications/Codex.app/Contents/Resources/codex
fi
if [ -z "$CODEX_BIN" ]; then
    CODEX_BIN=$(command -v codex || true)
fi
if [ -z "$CODEX_BIN" ]; then
    echo "Missing Codex CLI. Install Codex first, or set CODEX_BIN=/path/to/codex." >&2
    exit 1
fi

DS4_PROXY_URL=${DS4_PROXY_URL:-http://127.0.0.1:8788}
export CODEX_OSS_BASE_URL="$DS4_PROXY_URL/v1"
export CODEX_HOME="${DS4_CODEX_HOME:-$HOME/.codex-ds4/codex-home}"

exec "$CODEX_BIN" \
    --oss \
    --local-provider lmstudio \
    -m deepseek-v4-flash \
    --ask-for-approval never \
    --sandbox read-only \
    -C "$DS4_ROOT" \
    exec "Reply with only: ready"
