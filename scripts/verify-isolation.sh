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
    for path in "$HOME/.codex" "$HOME/Library/Application Support/Codex"; do
        if [ -e "$path" ]; then
            find "$path" -type f -exec shasum -a 256 {} \; | sort
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
