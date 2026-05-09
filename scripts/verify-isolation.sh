#!/bin/sh
set -eu

MODE=${1:-}
SNAPSHOT=${2:-/tmp/codex-normal-state.sha256}

usage() {
    echo "Usage:" >&2
    echo "  $0 snapshot [snapshot-file]" >&2
    echo "  $0 check    [snapshot-file]" >&2
}

collect() {
    codex_home="$HOME/.codex"
    codex_app="$HOME/Library/Application Support/Codex"

    for path in \
        "$codex_home/config.toml" \
        "$codex_home/state_5.sqlite" \
        "$codex_home/models_cache.json" \
        "$codex_home/.codex-global-state.json"
    do
        if [ -e "$path" ]; then
            shasum -a 256 "$path"
        else
            echo "MISSING  $path"
        fi
    done

    for path in \
        "$codex_app/Local State" \
        "$codex_app/Preferences" \
        "$codex_app/Session Storage" \
        "$codex_app/SharedStorage" \
        "$codex_app/User" \
        "$codex_app/WindowState"
    do
        if [ -e "$path" ]; then
            find "$path" -type f -not -path '*/Cache/*' -not -path '*/Code Cache/*' -exec shasum -a 256 {} \; | sort
        else
            echo "MISSING  $path"
        fi
    done
}

case "$MODE" in
    snapshot)
        collect >"$SNAPSHOT"
        echo "Wrote normal Codex state snapshot:"
        echo "  $SNAPSHOT"
        ;;
    check)
        tmp=$(mktemp /tmp/codex-normal-state-after.XXXXXX)
        collect >"$tmp"
        if diff -u "$SNAPSHOT" "$tmp"; then
            echo "Normal Codex state matched the snapshot."
            rm -f "$tmp"
        else
            echo "Normal Codex state changed. Review the diff above." >&2
            echo "After snapshot kept at: $tmp" >&2
            exit 1
        fi
        ;;
    *)
        usage
        exit 1
        ;;
esac
