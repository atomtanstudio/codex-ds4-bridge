# Codex DS4 Bridge

Run Codex against local DeepSeek V4 Flash served by [`antirez/ds4`](https://github.com/antirez/ds4), with an optional isolated macOS app launcher.

## Credit Where It Belongs

This project is a companion bridge. The hard and important work is [`ds4.c`](https://github.com/antirez/ds4) by Salvatore Sanfilippo / Antirez: a focused Apple Silicon Metal inference engine for DeepSeek V4 Flash.

If this bridge is useful, it is because `ds4` already does the difficult part: loading the supported DeepSeek V4 Flash GGUFs, running the model locally, and exposing an OpenAI-style server. Please star, read, and credit the original project.

This repo only adds:

- a small Codex Responses API proxy
- a local web UI for quick testing
- Codex CLI launch scripts
- an isolated macOS app wrapper so experiments do not share normal Codex state
- setup notes aimed at people who have the hardware but do not live in local inference tooling every day

## Current Status

Reliable path:

- Codex CLI -> local proxy -> `ds4-server` -> DeepSeek V4 Flash

Experimental path:

- `Codex DS4 Isolated.app` -> isolated Codex Desktop process -> local proxy -> `ds4-server`

The Desktop model picker may still show the normal hosted model name. The proof is the proxy request log. If a Codex turn writes `POST /v1/responses` to `harness/logs/codex-proxy-requests.log`, that request went through the DS4 bridge.

## Hardware

This is for high-memory Apple Silicon Macs.

The upstream DS4 README lists:

- `./download_model.sh q2` for 128 GB RAM machines
- `./download_model.sh q4` for 256 GB or larger machines

This bridge defaults to a conservative context window:

```sh
DS4_CTX=32768
DS4_KV_MB=8192
```

That is intentionally modest. Get the baseline working first, then raise `DS4_CTX` later if your machine has headroom.

## Requirements

- macOS on Apple Silicon
- 128 GB unified memory for the q2 model
- Codex CLI / Codex Desktop installed
- Node.js 20 or newer
- `git`, `make`, `curl`
- enough free disk space for the model and KV cache

## Quick Start

Clone and build DS4 first:

```sh
git clone https://github.com/antirez/ds4.git
cd ds4
./download_model.sh q2
make
```

Clone this bridge somewhere else:

```sh
git clone https://github.com/YOUR_GITHUB_USER/codex-ds4-bridge.git
cd codex-ds4-bridge
```

Install the harness into your DS4 checkout:

```sh
./scripts/install-into-ds4.sh /path/to/ds4
```

Start Codex CLI through DS4:

```sh
cd /path/to/ds4
./harness/start-codex-ds4-cli.sh
```

That script starts `ds4-server` if needed, starts the Codex proxy if needed, and launches:

```sh
codex --oss --local-provider lmstudio -m deepseek-v4-flash
```

with:

```sh
CODEX_OSS_BASE_URL=http://127.0.0.1:8788/v1
CODEX_HOME=~/.codex-ds4/codex-home
model_provider=oss
oss_provider=lmstudio
```

## Optional: Create the Isolated macOS App

After installing the harness into DS4:

```sh
./scripts/create-macos-app.sh /path/to/ds4
```

That creates:

```text
/Applications/Codex DS4 Isolated.app
```

The app uses isolated state:

```text
~/.codex-ds4/codex-home
~/.codex-ds4/electron-user-data
```

It refuses to launch if those paths are accidentally pointed at your normal Codex state.

The launcher intentionally does not override `HOME`. macOS Keychain expects the real user home, and faking it can trigger scary keychain reset prompts.

## Verify It Is Really Using DS4

In another terminal:

```sh
tail -f /path/to/ds4/harness/logs/codex-proxy-requests.log
```

When Codex uses DS4, you should see:

```text
POST /v1/responses
```

You can also run a CLI smoke test after DS4 and the proxy are running:

```sh
./scripts/smoke-test-cli.sh /path/to/ds4
```

Expected answer:

```text
ready
```

## Verify Desktop Isolation

Before claiming the isolated Desktop app is safe on a machine, snapshot normal Codex state:

```sh
./scripts/verify-isolation.sh snapshot
```

Then launch `Codex DS4 Isolated.app`, send one small prompt, quit it, and run:

```sh
./scripts/verify-isolation.sh check
```

See [docs/VERIFY_ISOLATION.md](docs/VERIFY_ISOLATION.md).

## Local Web UI

The harness also includes a tiny web UI:

```sh
cd /path/to/ds4/harness
./start-ui.sh
```

Open:

```text
http://127.0.0.1:8787
```

## Safety Notes

Do not point DS4 experiments at your normal Codex home:

```text
~/.codex
~/Library/Application Support/Codex
```

This bridge uses `~/.codex-ds4` for the DS4 path so the regular Codex app can keep its own projects, model picker, and account state.

The scripts also avoid installing a DS4 profile into your normal `~/.codex/config.toml`.

## Troubleshooting

Check DS4:

```sh
curl http://127.0.0.1:8000/v1/models
```

Check the Codex proxy:

```sh
curl http://127.0.0.1:8788/v1/models
```

Watch logs:

```sh
tail -f /path/to/ds4/harness/logs/ds4-server.log
tail -f /path/to/ds4/harness/logs/codex-proxy.log
tail -f /path/to/ds4/harness/logs/codex-proxy-requests.log
```

## License

This bridge is MIT licensed.

`ds4` is a separate upstream project. Follow its license and model-weight instructions.
