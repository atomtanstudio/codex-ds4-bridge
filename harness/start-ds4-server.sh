#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

if [ ! -x ./ds4-server ]; then
    echo "Missing ./ds4-server. Build ds4 first with: make" >&2
    exit 1
fi

if [ ! -e ds4flash.gguf ]; then
    echo "Missing ds4flash.gguf. Download the q2 model first:" >&2
    echo "  ./download_model.sh q2" >&2
    exit 1
fi

# Conservative defaults for 128 GB Apple Silicon machines.
# Raise DS4_CTX later once the baseline is working.
CTX=${DS4_CTX:-32768}
KV_DIR=${DS4_KV_DIR:-/tmp/ds4-kv}
KV_MB=${DS4_KV_MB:-8192}
PORT=${DS4_PORT:-8000}

exec ./ds4-server \
    --ctx "$CTX" \
    --port "$PORT" \
    --kv-disk-dir "$KV_DIR" \
    --kv-disk-space-mb "$KV_MB"
