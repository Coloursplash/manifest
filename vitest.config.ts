import { defineConfig } from "vitest/config";

// Frontend unit tests run under jsdom so the localStorage/document-backed lib
// modules (media, libraries, accent, layout, sort) work unchanged. The Rust
// core is tested separately with `cargo test`.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/test/setup.ts"],
    globals: true,
    restoreMocks: true,
  },
});
