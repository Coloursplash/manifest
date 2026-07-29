import { describe, it, expect, beforeEach } from "vitest";
import { getLayout, setLayout } from "./layout";

beforeEach(() => localStorage.clear());

describe("layout persistence", () => {
  it("defaults to 'grid'", () => {
    expect(getLayout()).toBe("grid");
  });
  it("round-trips 'timeline'", () => {
    expect(setLayout("timeline")).toBe("timeline");
    expect(getLayout()).toBe("timeline");
  });
  it("returns 'grid' for any non-'timeline' stored value", () => {
    localStorage.setItem("manifest-layout", "bogus");
    expect(getLayout()).toBe("grid");
  });
});
