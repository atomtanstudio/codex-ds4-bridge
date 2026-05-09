# Verify Isolation

The isolated launcher is designed to keep DS4 experiments away from normal Codex state.

Normal Codex paths:

```text
~/.codex
~/Library/Application Support/Codex
```

DS4 bridge paths:

```text
~/.codex-ds4/codex-home
~/.codex-ds4/electron-user-data
```

The bridge keeps the real `HOME` so macOS Keychain can find the normal login keychain. Isolation comes from `CODEX_HOME`, Electron `--user-data-dir`, and XDG cache/config/state paths.

## Manual Verification Flow

Quit normal Codex first.

Take a snapshot:

```sh
./scripts/verify-isolation.sh snapshot
```

The script checks Codex config, local state, session storage, and app preferences. It intentionally skips browser cache directories so the snapshot is fast enough to use in practice.

Launch:

```text
/Applications/Codex DS4 Isolated.app
```

Send one small prompt.

Confirm DS4 traffic:

```sh
tail -n 20 /path/to/ds4/harness/logs/codex-proxy-requests.log
```

Look for:

```text
POST /v1/responses
```

Quit the isolated app.

Check normal Codex state:

```sh
./scripts/verify-isolation.sh check
```

Expected:

```text
Normal Codex state matched the snapshot.
```

If normal Codex state changed, do not publish success claims yet. Keep the generated after-snapshot and inspect the diff.
