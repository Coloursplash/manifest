import { defineConfig } from "vitest/config";

// Frontend unit tests run under jsdom so the localStorage/document-backed lib
// modules (media, libraries, accent, layout, sort) work unchanged. The Rust
// core is tested separately with `cargo test`.
export default defineConfig({
  test: {
    environment: "jsdom",
    // Unit tests live next to the code they cover (src/**/*.test.*); integration
    // suites that exercise several modules together live under tests/integration/.
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
      "tests/integration/**/*.test.tsx",
    ],
    setupFiles: ["src/test/setup.ts"],
    globals: true,
    restoreMocks: true,
  },
});
