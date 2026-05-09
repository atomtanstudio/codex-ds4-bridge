# DS4 Local Harness

These files are meant to live inside an [`antirez/ds4`](https://github.com/antirez/ds4) checkout as:

```text
ds4/harness/
```

Install them with:

```sh
./scripts/install-into-ds4.sh /path/to/ds4
```

## Start DS4

From the DS4 repository root:

```sh
./harness/start-ds4-server.sh
```

Defaults:

```sh
DS4_CTX=32768
DS4_KV_MB=8192
DS4_PORT=8000
DS4_KV_DIR=/tmp/ds4-kv
```

Raise context later:

```sh
DS4_CTX=100000 ./harness/start-ds4-server.sh
```

## Start Codex CLI with DS4

```sh
./harness/start-codex-ds4-cli.sh
```

This uses isolated Codex state under:

```text
~/.codex-ds4/codex-home
```

## Start the Codex Proxy Only

```sh
cd harness
./start-codex-proxy.sh
```

The proxy listens on:

```text
http://127.0.0.1:8788/v1
```

## Start the Test UI

```sh
cd harness
./start-ui.sh
```

Open:

```text
http://127.0.0.1:8787
```

## Verify Codex Traffic

```sh
tail -f harness/logs/codex-proxy-requests.log
```

Look for:

```text
POST /v1/responses
```
