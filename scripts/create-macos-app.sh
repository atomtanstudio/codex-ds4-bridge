#!/bin/sh
set -eu

BRIDGE_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DS4_ROOT=${1:-$(pwd)}
APP_NAME=${APP_NAME:-Codex DS4 Isolated}
APP_PATH=${APP_PATH:-/Applications/$APP_NAME.app}
ICON_SOURCE=${ICON_SOURCE:-$BRIDGE_ROOT/assets/CodexDS4.icns}

DS4_ROOT=$(CDPATH= cd -- "$DS4_ROOT" && pwd)

if [ ! -x "$DS4_ROOT/harness/start-codex-ds4-isolated-desktop.sh" ]; then
    echo "Missing $DS4_ROOT/harness/start-codex-ds4-isolated-desktop.sh" >&2
    echo "Install the harness first:" >&2
    echo "  $BRIDGE_ROOT/scripts/install-into-ds4.sh \"$DS4_ROOT\"" >&2
    exit 1
fi

quote() {
    printf "'%s'" "$(printf "%s" "$1" | sed "s/'/'\\\\''/g")"
}

CONTENTS="$APP_PATH/Contents"
MACOS="$CONTENTS/MacOS"
RESOURCES="$CONTENTS/Resources"

mkdir -p "$MACOS" "$RESOURCES"

cat >"$CONTENTS/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>$APP_NAME</string>
  <key>CFBundleExecutable</key>
  <string>codex-ds4-isolated-launcher</string>
  <key>CFBundleIconFile</key>
  <string>CodexDS4</string>
  <key>CFBundleIdentifier</key>
  <string>local.codex-ds4-isolated</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$APP_NAME</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

cat >"$MACOS/codex-ds4-isolated-launcher" <<EOF
#!/bin/sh
set -eu

SCRIPT=$(quote "$DS4_ROOT/harness/start-codex-ds4-isolated-desktop.sh")
WORKSPACE=$(quote "$DS4_ROOT")
LOG_DIR="\$WORKSPACE/harness/logs"
LOG_FILE="\$LOG_DIR/codex-ds4-isolated-app.log"

mkdir -p "\$LOG_DIR"

quote() {
    printf "'%s'" "\$(printf "%s" "\$1" | sed "s/'/'\\\\''/g")"
}

COMMAND="exec /bin/sh \$(quote "\$SCRIPT") \$(quote "\$WORKSPACE") >>\$(quote "\$LOG_FILE") 2>&1"

exec /usr/bin/osascript - "\$COMMAND" <<'APPLESCRIPT'
on run argv
    set cmd to item 1 of argv
    tell application "Terminal"
        activate
        do script cmd
    end tell
end run
APPLESCRIPT
EOF

chmod +x "$MACOS/codex-ds4-isolated-launcher"

if [ -f "$ICON_SOURCE" ]; then
    cp "$ICON_SOURCE" "$RESOURCES/CodexDS4.icns"
fi

if command -v codesign >/dev/null 2>&1; then
    codesign --force --deep --sign - "$APP_PATH" >/dev/null 2>&1 || true
fi

touch "$APP_PATH"

echo "Created:"
echo "  $APP_PATH"
echo
echo "This app uses isolated Codex state under ~/.codex-ds4."
