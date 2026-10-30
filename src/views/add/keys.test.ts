import { describe, it, expect } from "vitest";

import { columnsOf } from "./keys";

// ↑/↓ move by a whole row, so the arrow keys need to know how many cards the
// `auto-fill` grid actually put on one. jsdom reports every offsetTop as 0, so
// this is the one piece of the keyboard nav that can't be driven through the
// rendered app — pin it directly with laid-out positions.
const row = (tops: number[]) => tops.map((offsetTop) => ({ offsetTop }));

describe("columnsOf", () => {
  it("counts the cards sharing the first row's top", () => {
    // 4 across, 6 hits → 4 on row one, 2 on row two.
    expect(columnsOf(row([0, 0, 0, 0, 260, 260]))).toBe(4);
  });

  it("handles a single full row", () => {
    expect(columnsOf(row([0, 0, 0]))).toBe(3);
  });

  it("treats an empty or single result as one column", () => {
    expect(columnsOf(row([]))).toBe(1);
    expect(columnsOf(row([0]))).toBe(1);
  });

  it("reads one column when every card is on its own row", () => {
    expect(columnsOf(row([0, 260, 520]))).toBe(1);
  });
});
