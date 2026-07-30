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

        # buildRustPackage bound to the same pinned toolchain the dev shell uses,
        # so `nix flake check` tests against exactly what we develop against.
        rustPlatform = pkgs.makeRustPlatform {
          cargo = rustToolchain;
          rustc = rustToolchain;
        };

        # Native libs the crate links against. On darwin the base SDK (incl.
        # WebKit) comes from stdenv — same as the dev shell, which builds with
        # just libiconv. On Linux, Tauri needs the WebKitGTK stack.
        backendBuildInputs = with pkgs;
          lib.optionals stdenv.isDarwin [ libiconv ]
          ++ lib.optionals stdenv.isLinux [
            glib
            gtk3
            webkitgtk_4_1
            libsoup_3
            openssl
          ];
      in
      {
        checks = {
          # Backend: the Rust unit + integration test suites, run offline in a
          # sandbox with crates vendored from Cargo.lock. This is a test-only
          # derivation — it never links/installs the release app binary (which
          # would need a windowing system); it just compiles and runs `cargo
          # test`. Note `nix flake check` only sees git-tracked files, so newly
          # added tests must be `git add`ed to be picked up.
          backend = rustPlatform.buildRustPackage {
            pname = "manifest-backend-tests";
            version = "0.1.0";
            src = ./src-tauri;
            cargoLock.lockFile = ./src-tauri/Cargo.lock;

            nativeBuildInputs = [ pkgs.pkg-config ];
            buildInputs = backendBuildInputs;

            # `tauri::generate_context!` (in lib.rs) reads `frontendDist`
            # (`../dist`) at compile time. We don't build the real frontend for
            # a backend test run — a stub index.html satisfies the macro.
            preBuild = ''
              mkdir -p ../dist
              printf '<!doctype html><meta charset="utf-8"><title>manifest</title>' > ../dist/index.html
            '';

            # Compile the tests but not the release binary, then run them.
            buildPhase = ''
              runHook preBuild
              cargo test --no-run --offline
              runHook postBuild
            '';
            checkPhase = ''
              runHook preCheck
              cargo test --offline
              runHook postCheck
            '';
            installPhase = "touch $out";
            doCheck = true;
          };

          # Frontend: the Vitest suite (unit + integration), deps fetched from
          # package-lock.json. Vitest's `run` exits non-zero on failure, so a
          # green build == green tests.
          frontend = pkgs.buildNpmPackage {
            pname = "manifest-frontend-tests";
            version = "0.1.0";
            src = ./.;
            npmDepsHash = "sha256-rbF4Od8CjIYzJ3IER3Gc6LNA7Cpkq0GJALCjnHHCkbA=";
            # No native build; we only need node_modules to run the tests.
            dontNpmBuild = true;
            doCheck = true;
            checkPhase = ''
              runHook preCheck
              npm test
              runHook postCheck
            '';
            installPhase = "touch $out";
          };
        };


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
