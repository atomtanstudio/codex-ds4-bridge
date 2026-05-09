# X Article Draft

I wanted local DeepSeek V4 Flash to be usable by people who have the hardware, but not necessarily the local-inference scar tissue.

The real work is Antirez's `ds4.c`: a focused, Metal-native DeepSeek V4 Flash engine for Apple Silicon. It is not a generic GGUF runner. It is a narrow, thoughtful bet on making one very large model run well locally.

I built a small companion bridge for Codex:

- starts `ds4-server`
- runs a tiny Responses API proxy for Codex CLI
- launches Codex CLI against `deepseek-v4-flash`
- optionally creates a separate `Codex DS4 Isolated.app`
- keeps DS4 Codex state out of your normal Codex install

The isolation mattered. My first desktop wrapper shared normal Codex Desktop state, and that was the wrong move. The safer version uses separate state under `~/.codex-ds4`:

- `~/.codex-ds4/codex-home`
- `~/.codex-ds4/electron-user-data`

The conservative default is:

```sh
DS4_CTX=32768
DS4_KV_MB=8192
```

That is intentionally lower than what DS4 can do. The goal is: get a 128 GB Apple Silicon machine running first, then raise context once the baseline is stable.

Basic flow:

```sh
git clone https://github.com/antirez/ds4.git
cd ds4
./download_model.sh q2
make
```

Then install the bridge harness and run:

```sh
./harness/start-codex-ds4-cli.sh
```

Proof that Codex is actually hitting DS4:

```sh
tail -f harness/logs/codex-proxy-requests.log
```

Look for:

```text
POST /v1/responses
```

Repo:

TODO: add GitHub URL

Huge credit to Antirez for building `ds4.c` and sharing the work.
