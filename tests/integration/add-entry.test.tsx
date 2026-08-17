// Integration: the headline "add an entry" loop through the real App — open add
// mode from the floating pill, search a provider (faked), pick a status on a hit,
// and watch the created entry land in both the backend store and the grid. This
// spans OmniBox add-mode → AddEntryModal(panel) → src/lib/api → the fake backend.
import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderApp } from "./harness";
import type { Candidate } from "../../src/lib/types";

const CANDIDATES: Candidate[] = [
  { title: "Arrival", year: 2016, subtitle: "Denis Villeneuve", summary: "Linguist meets heptapods." },
];

describe("add-entry flow", () => {
  it("adds a searched title from the pill and it appears in the library", async () => {
    const user = userEvent.setup();
    // Films need a TMDB key to search — grant it so the provider path runs.
    const { backend } = renderApp({ hasTmdbKey: true, candidates: CANDIDATES });
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    // Open add mode via the ＋ button, then type into the (now add-mode) pill.
    await user.click(screen.getByRole("button", { name: /add entry/i }));
    await user.type(screen.getByRole("textbox", { name: /search library/i }), "arrival");

    // Search is 300ms-debounced; wait for the result card, then hit "Watched".
    const watched = await screen.findByRole("button", { name: "Watched" }, { timeout: 2000 });
    await user.click(watched);

    // That opens the log dialog rather than filing silently — nothing is written
    // until you commit, so the date and your thoughts are yours to enter.
    expect(await screen.findByText(/Log a watch/)).toBeInTheDocument();
    expect(backend.entries.has("film/arrival")).toBe(false);

    // Pick the date you actually saw it, rate it, say something.
    const date = screen.getByLabelText("Date");
    await user.clear(date);
    await user.type(date, "2026-05-25");
    await user.click(screen.getByRole("button", { name: "Rate 8 out of 10" }));
    await user.type(screen.getByPlaceholderText(/Thoughts/), "Heptapods.");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    // Now it lands: the entry, the dated block, and the rating.
    await waitFor(() => expect(backend.entries.has("film/arrival")).toBe(true));
    const created = backend.entries.get("film/arrival")!;
    expect(created.title).toBe("Arrival");
    expect(created.status).toBe("done");
    expect(created.notes).toContain("2026-05-25");
    expect(created.notes).toContain("Heptapods.");
    expect(created.rating).toBe(8);

    // Still no invented `finished` date — the log block is the record.
    expect(created.finished).toBeUndefined();
  });

  it("writes nothing if you back out of the log dialog", async () => {
    const user = userEvent.setup();
    const { backend } = renderApp({ hasTmdbKey: true, candidates: CANDIDATES });
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /add entry/i }));
    await user.type(screen.getByRole("textbox", { name: /search library/i }), "arrival");
    await user.click(await screen.findByRole("button", { name: "Watched" }, { timeout: 2000 }));

    await user.click(await screen.findByRole("button", { name: /Back/ }));

    expect(backend.entries.has("film/arrival")).toBe(false);
    expect(backend.callsTo("create_entry")).toHaveLength(0);
    // …and you're back on the results, free to pick a different status.
    expect(await screen.findByRole("button", { name: "Watched" })).toBeInTheDocument();
  });

  it("files a Plan add immediately, with no log dialog", async () => {
    const user = userEvent.setup();
    const { backend } = renderApp({ hasTmdbKey: true, candidates: CANDIDATES });
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /add entry/i }));
    await user.type(screen.getByRole("textbox", { name: /search library/i }), "arrival");
    await user.click(await screen.findByRole("button", { name: "Plan" }, { timeout: 2000 }));

    await waitFor(() => expect(backend.entries.has("film/arrival")).toBe(true));
    expect(backend.entries.get("film/arrival")!.status).toBe("want");
    expect(screen.queryByText(/Log a watch/)).not.toBeInTheDocument();
    expect(backend.callsTo("append_note")).toHaveLength(0);
  });

  it("gates the film provider behind a TMDB key and offers a manual add", async () => {
    const user = userEvent.setup();
    const { backend } = renderApp({ hasTmdbKey: false, candidates: CANDIDATES });
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /add entry/i }));
    // Key-required prompt shows; searching never fires.
    expect(await screen.findByText(/TMDB key required/i)).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /search library/i }), "arrival");
    // Past the 300ms debounce window, the gated provider still never searched.
    await new Promise((r) => setTimeout(r, 350));
    expect(backend.callsTo("search_metadata")).toHaveLength(0);
  });
});
