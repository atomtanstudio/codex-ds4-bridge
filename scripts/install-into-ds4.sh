#!/bin/sh
set -eu

BRIDGE_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DS4_ROOT=${1:-}

if [ -z "$DS4_ROOT" ]; then
    echo "Usage: $0 /path/to/ds4" >&2
    exit 1
fi

DS4_ROOT=$(CDPATH= cd -- "$DS4_ROOT" && pwd)

if [ ! -f "$DS4_ROOT/download_model.sh" ] || [ ! -f "$DS4_ROOT/Makefile" ]; then
    echo "$DS4_ROOT does not look like an antirez/ds4 checkout." >&2
    exit 1
fi

mkdir -p "$DS4_ROOT/harness"
cp -R "$BRIDGE_ROOT/harness/." "$DS4_ROOT/harness/"
chmod +x "$DS4_ROOT"/harness/*.sh

echo "Installed Codex DS4 bridge harness into:"
echo "  $DS4_ROOT/harness"
echo
echo "Next:"
echo "  cd \"$DS4_ROOT\""
echo "  ./download_model.sh q2"
echo "  make"
echo "  ./harness/start-codex-ds4-cli.sh"
