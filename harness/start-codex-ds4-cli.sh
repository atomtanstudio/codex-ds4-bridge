#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
HARNESS="$ROOT/harness"
LOG_DIR="$HARNESS/logs"
WORKSPACE=${1:-$ROOT}
DS4_SERVER_URL="${DS4_SERVER_URL:-http://127.0.0.1:8000}"
DS4_PROXY_URL="${DS4_PROXY_URL:-http://127.0.0.1:8788}"
DS4_STATE_ROOT="${DS4_STATE_ROOT:-$HOME/.codex-ds4}"
DS4_CODEX_HOME="${DS4_CODEX_HOME:-$DS4_STATE_ROOT/codex-home}"
NORMAL_CODEX_HOME="$HOME/.codex"

CODEX_BIN="${CODEX_BIN:-}"
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

if [ "$DS4_CODEX_HOME" = "$NORMAL_CODEX_HOME" ]; then
    echo "Refusing to launch: DS4_CODEX_HOME points at normal Codex home ($NORMAL_CODEX_HOME)." >&2
    exit 1
fi

mkdir -p "$LOG_DIR" "$DS4_CODEX_HOME"

is_up() {
    curl -fsS "$1" >/dev/null 2>&1
}

wait_for() {
    label=$1
    url=$2
    limit=$3
    i=0
    while ! is_up "$url"; do
        i=$((i + 1))
        if [ "$i" -gt "$limit" ]; then
            echo "$label did not become ready at $url." >&2
            return 1
        fi
        sleep 1
    done
}

if ! is_up "$DS4_SERVER_URL/v1/models"; then
    echo "Starting DS4 server..."
    (
        cd "$ROOT"
        nohup env DS4_CTX="${DS4_CTX:-32768}" DS4_KV_MB="${DS4_KV_MB:-8192}" \
            ./harness/start-ds4-server.sh >>"$LOG_DIR/ds4-server.log" 2>&1 &
    )
fi

wait_for "DS4 server" "$DS4_SERVER_URL/v1/models" 120

if ! is_up "$DS4_PROXY_URL/v1/models"; then
    echo "Starting Codex DS4 proxy..."
    (
        cd "$HARNESS"
        nohup env DS4_BASE_URL="$DS4_SERVER_URL" \
            DS4_PROXY_REQUEST_LOG="$LOG_DIR/codex-proxy-requests.log" \
            ./start-codex-proxy.sh >>"$LOG_DIR/codex-proxy.log" 2>&1 &
    )
fi

wait_for "Codex DS4 proxy" "$DS4_PROXY_URL/v1/models" 30

export CODEX_OSS_BASE_URL="$DS4_PROXY_URL/v1"
export CODEX_HOME="$DS4_CODEX_HOME"

echo "Codex DS4 CLI"
echo "Workspace: $WORKSPACE"
echo "Model: deepseek-v4-flash via $CODEX_OSS_BASE_URL"
echo "Isolated CODEX_HOME: $CODEX_HOME"
echo

exec "$CODEX_BIN" \
    --oss \
    --local-provider lmstudio \
    -m deepseek-v4-flash \
    -C "$WORKSPACE"
