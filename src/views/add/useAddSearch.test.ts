import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("../../lib/api", () => ({ searchMetadata: vi.fn() }));

import { searchMetadata } from "../../lib/api";
import type { Candidate, Medium } from "../../lib/types";
import { useAddSearch } from "./useAddSearch";

/** searchMetadata calls that resolve only when the test says so. */
function deferredSearches() {
  const pending: Array<{ q: string; resolve: (c: Candidate[]) => void }> = [];
  vi.mocked(searchMetadata).mockImplementation(
    (_m: Medium, q: string) => new Promise((resolve) => pending.push({ q, resolve })),
  );
  return pending;
}

const hit = (title: string): Candidate[] => [{ title }];

beforeEach(() => vi.useFakeTimers());

describe("useAddSearch", () => {
  it("drops a slow response for an older query", async () => {
    const pending = deferredSearches();
    const { result, rerender } = renderHook(({ q }) => useAddSearch("film", q, false), {
      initialProps: { q: "arr" },
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    rerender({ q: "arrival" });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(pending.map((p) => p.q)).toEqual(["arr", "arrival"]);

    // The newer search answers first, then the stale one straggles in.
    await act(async () => pending[1].resolve(hit("Arrival")));
    await act(async () => pending[0].resolve(hit("Arrested Development")));
    expect(result.current.results).toEqual(hit("Arrival"));
  });

  it("hides results the moment the category changes", async () => {
    const pending = deferredSearches();
    const { result, rerender } = renderHook(({ m }) => useAddSearch(m, "dune", false), {
      initialProps: { m: "film" as Medium },
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    await act(async () => pending[0].resolve(hit("Dune (film)")));
    expect(result.current.results).toEqual(hit("Dune (film)"));

    // ⇥ to Books: the film hits must not be on screen to be ⏎'d.
    rerender({ m: "book" });
    expect(result.current.results).toEqual([]);
    expect(result.current.searched).toBe(false);
  });

  it("doesn't search while blocked or empty", async () => {
    deferredSearches();
    renderHook(() => useAddSearch("film", "   ", false));
    renderHook(() => useAddSearch("film", "dune", true));
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(searchMetadata).not.toHaveBeenCalled();
  });
});
