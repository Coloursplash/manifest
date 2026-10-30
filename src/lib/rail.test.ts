import { describe, it, expect } from "vitest";

import {
  RAIL_MAX_WIDTH,
  RAIL_MIN_WIDTH,
  RAIL_WIDTH,
  clampRailWidth,
  getRailCollapsed,
  getRailWidth,
  setRailCollapsed,
  setRailWidth,
} from "./rail";

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

describe("rail width persistence", () => {
  it("defaults to the standard width", () => {
    expect(getRailWidth()).toBe(RAIL_WIDTH);
  });

  it("persists a width and reads it back", () => {
    expect(setRailWidth(240)).toBe(240);
    expect(getRailWidth()).toBe(240);
  });

  it("clamps to the usable range, rounding to whole pixels", () => {
    expect(clampRailWidth(10)).toBe(RAIL_MIN_WIDTH);
    expect(clampRailWidth(9000)).toBe(RAIL_MAX_WIDTH);
    expect(clampRailWidth(200.4)).toBe(200);
    // stored values are clamped on the way in *and* on the way out
    expect(setRailWidth(9000)).toBe(RAIL_MAX_WIDTH);
    expect(getRailWidth()).toBe(RAIL_MAX_WIDTH);
  });

  it("falls back to the default when the stored value is junk", () => {
    localStorage.setItem("manifest-rail-width", "not-a-number");
    expect(getRailWidth()).toBe(RAIL_WIDTH);
    localStorage.setItem("manifest-rail-width", "0");
    expect(getRailWidth()).toBe(RAIL_WIDTH);
  });
});
