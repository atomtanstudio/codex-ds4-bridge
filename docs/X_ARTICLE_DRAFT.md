# Running Codex Against Local DeepSeek V4 Flash with DS4

I spent the day trying to answer a question that I suspect a lot of people with high-memory Apple Silicon machines are going to ask:

Can I run a serious local model through a familiar coding-agent interface?

The short answer is: yes, with caveats.

The real work here comes from Salvatore Sanfilippo / Antirez and his `ds4` project:

https://github.com/antirez/ds4

`ds4.c` is a focused, Metal-native inference engine for DeepSeek V4 Flash. It is not a generic GGUF runner, and that is part of what makes it interesting. It is a narrow, opinionated path for making one very large model feel practical on high-end Apple Silicon.

My contribution is much smaller: a companion bridge that lets Codex talk to a local `ds4-server`.

The repo I published is here:

https://github.com/atomtanstudio/codex-ds4-bridge

## What It Does

The bridge includes:

- a small Responses API proxy for Codex
- a tiny DS4 web UI for baseline testing
- Codex CLI launch scripts
- an isolated macOS app wrapper called `Codex DS4 Isolated.app`
- an app icon
- verification scripts to make sure the normal Codex install is not touched
- performance notes explaining the current limitations

The basic flow is:

```sh
git clone https://github.com/antirez/ds4.git
cd ds4
./download_model.sh q2
make
```

Then install the bridge harness:

```sh
git clone https://github.com/atomtanstudio/codex-ds4-bridge.git
cd codex-ds4-bridge
./scripts/install-into-ds4.sh /path/to/ds4
```

From there you can run the CLI path:

```sh
cd /path/to/ds4
./harness/start-codex-ds4-cli.sh
```

Or generate the isolated macOS app:

```sh
./scripts/create-macos-app.sh /path/to/ds4
```

That creates:

```text
/Applications/Codex DS4 Isolated.app
```

## Why Isolation Mattered

This was not smooth the first time.

My first wrapper launched Codex Desktop while sharing normal Codex state. That was the wrong approach. It interfered with the regular Codex install badly enough that I had to restore from Time Machine.

The working version isolates the DS4 experiment under:

```text
~/.codex-ds4/codex-home
~/.codex-ds4/electron-user-data
```

It intentionally does not fake `HOME`, because macOS Keychain expects the real user home. Faking it triggered a scary keychain reset prompt, which is exactly the kind of thing this project is trying to avoid.

The repo includes a verification script:

```sh
./scripts/verify-isolation.sh snapshot
./scripts/verify-isolation.sh check
```

The goal is simple: make the DS4 experiment separate from normal Codex.

## The Big Caveat: Prefill

This works, but it is not hosted-Codex fast.

The reason is prefill.

DS4 itself is reasonably quick. In the lightweight web UI, I saw a small prompt around `1.2k` tokens and generation around `28 tokens/sec` on a 128 GB M5 Max.

Codex Desktop is a different story. Even after disabling tool forwarding, the isolated Desktop app was still sending roughly `5.7k` to `8.6k` prompt tokens before my actual question. Full tool mode could push observed prompts beyond `20k` tokens.

On my machine, DS4 prefill was roughly:

```text
285-315 tokens/sec
```

That means a large Codex prompt can spend tens of seconds in prefill before the first visible token.

So this project has two practical modes today:

## Fast Chat Mode

This is the default.

The bridge does not forward Codex tool schemas to DS4. You get Codex's UI shell, dictation, threads, and a pleasant local chat interface, but not the full Codex agent experience.

This is useful if you want to talk to local DeepSeek V4 Flash from a polished interface.

## Full Tool Experiment

You can enable tool forwarding:

```sh
DS4_CODEX_FORWARD_TOOLS=1 ./harness/start-codex-proxy.sh
```

This is more Codex-like, but it is much slower. The tool schemas and agent context increase prompt size dramatically, and local prefill becomes the limiting factor.

## What I Think Comes Next

The obvious next step is a middle ground:

```text
Lean Agent Mode
```

Instead of forwarding every Codex tool or no tools, the proxy could forward a small curated allowlist: maybe shell, file edits, search, and patching. That might preserve enough agent behavior to be useful without making every turn chew through a giant tool universe.

I have not built that yet.

## Why Publish This?

Because there is a gap between the people pioneering local inference and the people who have the hardware but do not yet have the map.

I am not presenting this as a polished product. It is a proof of concept that worked on my machine, with all the caveats written down.

If you have the hardware and want to improve it, fork it. If you understand Codex config better than I do, improve it. If you can make Lean Agent Mode work well, please do.

And again: the core engine is Antirez's work. Start there:

https://github.com/antirez/ds4

Bridge repo:

https://github.com/atomtanstudio/codex-ds4-bridge
