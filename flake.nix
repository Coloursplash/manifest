{
  description = "manifest — local-first media tracker (Tauri + React)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, rust-overlay, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs { inherit system overlays; };

        # One pinned Rust toolchain with the extras rust-analyzer and clippy want.
        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          extensions = [ "rust-src" "rust-analyzer" "clippy" "rustfmt" ];
        };
      in
      {
        devShells.default = pkgs.mkShell {
          # Build-time tools available on PATH inside `nix develop`.
          packages = with pkgs; [
            rustToolchain
            nodejs_22
            cargo-tauri   # the `cargo tauri` / `tauri` CLI
            pkg-config
          ]
          # macOS: Tauri renders via the system WKWebView, so we mainly need
          # libiconv + a couple of frameworks rather than a Linux WebKitGTK stack.
          ++ lib.optionals stdenv.isDarwin [
            libiconv
          ];

          # Let cargo-tauri find our locally-pinned CLI rather than downloading one.
          shellHook = ''
            echo "manifest dev shell — rust $(rustc --version | cut -d' ' -f2), node $(node --version), tauri $(cargo tauri --version 2>/dev/null | head -1)"
          '';
        };
      });
}
