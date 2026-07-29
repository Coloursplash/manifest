// Test setup, loaded before every test file (see vitest.config.ts `setupFiles`).
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// The UI reaches the backend only through the Tauri `invoke`/`convertFileSrc`
// bridge, which doesn't exist under jsdom. Stub the core module so components
// render; individual tests spy on `src/lib/api` for command-level assertions.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve(null)),
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Unmount React trees and reset the DOM/localStorage between tests.
afterEach(() => {
  cleanup();
  localStorage.clear();
});
