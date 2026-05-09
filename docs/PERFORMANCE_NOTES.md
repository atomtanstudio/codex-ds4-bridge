# Performance Notes

This bridge is useful, but the Codex Desktop path has real local-inference overhead.

## What Was Observed

On a 128 GB M5 Max using the q2 DS4 model:

| Path | Prompt size observed | Result |
| --- | ---: | --- |
| Lightweight DS4 web UI | about 1.2k tokens | quick first token |
| Codex Desktop chat-only bridge | about 5.7k to 8.6k tokens | noticeably slow prefill |
| Codex Desktop with tools | about 20k+ tokens | very slow prefill, extra tool-call turns |

Generation speed was roughly:

```text
23-31 tokens/sec
```

Prefill speed was roughly:

```text
285-315 tokens/sec
```

So the time-to-first-token problem is mostly prompt volume:

```text
time to first token ~= prompt tokens / prefill tokens per second
```

## Why the Lightweight UI Feels Faster

The lightweight UI sends a small `messages` array directly to `ds4-server`.

Codex Desktop sends a much larger envelope containing instructions, app/runtime context, conversation metadata, and optionally tool schemas. The bridge can stop forwarding tool schemas, but it cannot fully remove Codex's own base prompt without turning the app into a very thin DS4 chat shell.

## Modes

Default mode:

```sh
DS4_CODEX_FORWARD_TOOLS=0
```

This is fastest and best for local chat.

Experimental full-tool mode:

```sh
DS4_CODEX_FORWARD_TOOLS=1
```

This may preserve more Codex-like behavior, but it can be very slow on 128 GB machines.

## Future Work

Likely next improvement:

```text
Lean Agent Mode
```

Instead of forwarding all tools or no tools, the proxy could forward only a small allowlist of local coding tools. That may preserve some agent behavior while avoiding the largest prompt/tool-schema overhead.
