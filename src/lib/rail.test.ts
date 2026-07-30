import { describe, it, expect } from "vitest";

import { getRailCollapsed, setRailCollapsed } from "./rail";

describe("rail collapse persistence", () => {
  it("defaults to expanded (false)", () => {
    expect(getRailCollapsed()).toBe(false);
  });

  it("persists and reads back the collapsed flag", () => {
    expect(setRailCollapsed(true)).toBe(true);
    expect(getRailCollapsed()).toBe(true);
    setRailCollapsed(false);
    expect(getRailCollapsed()).toBe(false);
  });
});
