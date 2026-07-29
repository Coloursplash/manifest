import { describe, it, expect, beforeEach } from "vitest";
import { getAccent, applyAccent, initAccent, DEFAULT_ACCENT } from "./accent";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("style");
});

describe("getAccent", () => {
  it("returns the default when nothing is stored", () => {
    expect(getAccent()).toBe(DEFAULT_ACCENT);
  });
  it("returns the stored value", () => {
    localStorage.setItem("manifest-accent", "#3b9dff");
    expect(getAccent()).toBe("#3b9dff");
  });
});

describe("applyAccent", () => {
  it("persists and sets the --accent CSS var on :root", () => {
    applyAccent("#3b9dff");
    expect(getAccent()).toBe("#3b9dff");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#3b9dff");
  });

  it("derives a lighter hover shade and an ink colour", () => {
    applyAccent("#3b9dff");
    const hi = document.documentElement.style.getPropertyValue("--accent-hi");
    const ink = document.documentElement.style.getPropertyValue("--accent-ink");
    expect(hi).toMatch(/^#[0-9a-f]{6}$/);
    expect(hi).not.toBe("#3b9dff"); // lightened
    expect([ "#141414", "#f3f3f0" ]).toContain(ink);
  });

  it("picks dark ink on a bright accent and light ink on a dark accent", () => {
    applyAccent("#ffb400"); // bright amber
    expect(document.documentElement.style.getPropertyValue("--accent-ink")).toBe("#141414");
    applyAccent("#14224a"); // dark navy
    expect(document.documentElement.style.getPropertyValue("--accent-ink")).toBe("#f3f3f0");
  });

  it("expands 3-digit shorthand hex", () => {
    applyAccent("#fff");
    // white → dark ink
    expect(document.documentElement.style.getPropertyValue("--accent-ink")).toBe("#141414");
  });
});

describe("initAccent", () => {
  it("applies the stored accent and returns it", () => {
    localStorage.setItem("manifest-accent", "#31c48d");
    expect(initAccent()).toBe("#31c48d");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#31c48d");
  });
});
