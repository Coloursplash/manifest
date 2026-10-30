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

// jsdom ships no PointerEvent and no pointer capture. Without the constructor,
// `fireEvent.pointerDown` silently degrades to a bare Event and drops `button`
// and `clientX`, so any pointer-driven UI (rail resize, MediaChooser reorder)
// looks inert under test. MouseEvent already carries everything we read.
if (!("PointerEvent" in globalThis)) {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  (globalThis as any).PointerEvent = PointerEventPolyfill;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
}

// Unmount React trees and reset the DOM/localStorage between tests.
afterEach(() => {
  cleanup();
  localStorage.clear();
});
