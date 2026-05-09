#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
HARNESS="$ROOT/harness"
LOG_DIR="$HARNESS/logs"
WORKSPACE=${1:-$ROOT}
REAL_HOME="${REAL_HOME:-$HOME}"
DS4_SERVER_URL="${DS4_SERVER_URL:-http://127.0.0.1:8000}"
DS4_PROXY_URL="${DS4_PROXY_URL:-http://127.0.0.1:8788}"
DS4_STATE_ROOT="${DS4_STATE_ROOT:-$REAL_HOME/.codex-ds4}"
DS4_CODEX_HOME="${DS4_CODEX_HOME:-$DS4_STATE_ROOT/codex-home}"
DS4_ELECTRON_USER_DATA="${DS4_ELECTRON_USER_DATA:-$DS4_STATE_ROOT/electron-user-data}"
CODEX_APP_BIN="${CODEX_APP_BIN:-/Applications/Codex.app/Contents/MacOS/Codex}"
NORMAL_CODEX_HOME="$REAL_HOME/.codex"
NORMAL_ELECTRON_USER_DATA="$REAL_HOME/Library/Application Support/Codex"

if [ "$DS4_CODEX_HOME" = "$NORMAL_CODEX_HOME" ]; then
    echo "Refusing to launch: DS4_CODEX_HOME points at normal Codex home ($NORMAL_CODEX_HOME)." >&2
    exit 1
fi

if [ "$DS4_ELECTRON_USER_DATA" = "$NORMAL_ELECTRON_USER_DATA" ]; then
    echo "Refusing to launch: DS4_ELECTRON_USER_DATA points at normal Codex Desktop state ($NORMAL_ELECTRON_USER_DATA)." >&2
    exit 1
fi

mkdir -p "$LOG_DIR" "$DS4_CODEX_HOME" "$DS4_ELECTRON_USER_DATA"

is_up() {
    /usr/bin/curl -fsS "$1" >/dev/null 2>&1
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
        /bin/sleep 1
    done
}

write_isolated_config() {
    config_file="$DS4_CODEX_HOME/config.toml"
    if [ -f "$config_file" ]; then
        return 0
    fi

    umask 077
    {
        printf '%s\n' '# Isolated Codex DS4 config.'
        printf '%s\n' '# This file intentionally lives outside ~/.codex.'
        printf '%s\n' 'model = "deepseek-v4-flash"'
        printf '%s\n' 'model_reasoning_effort = "high"'
        printf '%s\n' 'oss_provider = "lmstudio"'
        printf '\n'
        printf '%s\n' '[profiles.ds4]'
        printf '%s\n' 'model = "deepseek-v4-flash"'
        printf '%s\n' 'model_reasoning_effort = "high"'
        printf '%s\n' 'oss_provider = "lmstudio"'
    } >"$config_file"
}

if [ ! -x "$CODEX_APP_BIN" ]; then
    echo "Codex.app executable not found at $CODEX_APP_BIN." >&2
    exit 1
fi

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
write_isolated_config

export CODEX_OSS_BASE_URL="$DS4_PROXY_URL/v1"
export CODEX_HOME="$DS4_CODEX_HOME"
export XDG_CONFIG_HOME="$DS4_STATE_ROOT/xdg-config"
export XDG_CACHE_HOME="$DS4_STATE_ROOT/xdg-cache"
export XDG_STATE_HOME="$DS4_STATE_ROOT/xdg-state"

mkdir -p "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME"

echo "Codex DS4 isolated desktop"
echo "Workspace: $WORKSPACE"
echo "Model endpoint: $CODEX_OSS_BASE_URL"
echo "Isolated CODEX_HOME: $CODEX_HOME"
echo "Isolated Electron user data: $DS4_ELECTRON_USER_DATA"
echo

exec "$CODEX_APP_BIN" \
    --user-data-dir="$DS4_ELECTRON_USER_DATA" \
    "$WORKSPACE"
