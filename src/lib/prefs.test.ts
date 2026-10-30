import { describe, it, expect, vi, afterEach } from "vitest";

import { readJson, readPref, writePref } from "./prefs";
import { getAccent, DEFAULT_ACCENT } from "./accent";
import { getRailWidth, RAIL_WIDTH } from "./rail";
import { getSort } from "./sort";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("prefs", () => {
  it("treats unavailable storage as unset, and a failed write as harmless", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(readPref("x")).toBeNull();
    expect(() => writePref("x", "1")).not.toThrow();
    // …so the app still boots with its defaults.
    expect(getSort()).toBe("title");
    expect(getRailWidth()).toBe(RAIL_WIDTH);
  });

  it("reads junk JSON as unset", () => {
    localStorage.setItem("j", "{not json");
    expect(readJson("j")).toBeUndefined();
    expect(readJson("missing")).toBeUndefined();
  });

  it("ignores a stored accent that isn't a hex colour", () => {
    localStorage.setItem("manifest-accent", "url(evil)");
    expect(getAccent()).toBe(DEFAULT_ACCENT);
    localStorage.setItem("manifest-accent", "#3b9dff");
    expect(getAccent()).toBe("#3b9dff");
  });
});
