#!/usr/bin/env bash
# Build manifest from source and install it. macOS and Linux.
#
#   ./scripts/install.sh            # from a checkout
#   curl -fsSL https://raw.githubusercontent.com/Coloursplash/manifest/main/scripts/install.sh | bash
#
# Needs git, Rust (cargo) and Node 18+. On Linux, also the WebKitGTK 4.1 dev
# packages: https://v2.tauri.app/start/prerequisites/#linux
# Installs to /Applications (or ~/Applications) on macOS, ~/.local on Linux.
set -euo pipefail

REPO="https://github.com/Coloursplash/manifest.git"

die() { echo "error: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 not found. $2"; }

os="$(uname -s)"
case "$os" in
  Darwin | Linux) ;;
  *) die "unsupported OS: $os (macOS and Linux only)" ;;
esac

need git "Install git first."
need cargo "Install Rust: https://rustup.rs"
need npm "Install Node 18 or newer: https://nodejs.org"
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge 18 ] || die "Node $node_major is too old; need 18 or newer."

if [ "$os" = Darwin ]; then
  xcode-select -p >/dev/null 2>&1 || die "Xcode Command Line Tools missing. Run: xcode-select --install"
else
  need pkg-config "Install pkg-config and the Tauri prerequisites: https://v2.tauri.app/start/prerequisites/#linux"
  pkg-config --exists webkit2gtk-4.1 \
    || die "WebKitGTK 4.1 not found. Install the Tauri prerequisites: https://v2.tauri.app/start/prerequisites/#linux"
fi

# Build from this checkout if we're in one, otherwise from a fresh clone.
here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
if [ -n "$here" ] && [ -f "$here/../src-tauri/tauri.conf.json" ]; then
  src="$(cd "$here/.." && pwd)"
else
  src="$(mktemp -d)"
  trap 'rm -rf "$src"' EXIT
  echo "==> cloning $REPO"
  git clone --depth 1 "$REPO" "$src"
fi
cd "$src"

echo "==> installing npm dependencies"
npm ci

if [ "$os" = Darwin ]; then
  echo "==> building manifest.app (takes a few minutes the first time)"
  npx tauri build --bundles app
  app="src-tauri/target/release/bundle/macos/manifest.app"
  dest="/Applications"
  [ -w "$dest" ] || dest="$HOME/Applications"
  mkdir -p "$dest"
  rm -rf "$dest/manifest.app"
  cp -R "$app" "$dest/"
  echo "==> installed $dest/manifest.app"
else
  echo "==> building manifest (takes a few minutes the first time)"
  npx tauri build --no-bundle
  bin="$HOME/.local/bin"
  share="$HOME/.local/share"
  install -Dm755 src-tauri/target/release/manifest "$bin/manifest"
  install -Dm644 src-tauri/icons/128x128.png "$share/icons/hicolor/128x128/apps/manifest.png"
  mkdir -p "$share/applications"
  cat >"$share/applications/manifest.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=manifest
Comment=Local-first media tracker
Exec=$bin/manifest
Icon=manifest
Categories=Utility;
EOF
  echo "==> installed $bin/manifest"
  case ":$PATH:" in
    *":$bin:"*) ;;
    *) echo "    note: $bin is not on your PATH" ;;
  esac
fi
