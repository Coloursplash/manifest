// Integration: the everyday browse loop through the real App — boot, filter via
// the pill, filter by medium (rail + digit hotkey), switch layout, open an entry
// and change its status — asserting both the DOM and the fake backend's store.
import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderApp } from "./harness";
import { makeEntry } from "../../src/test/entry";

// Give each a cover URL: the fake echoes it, so <Cover> renders an <img alt> —
// not the title-text fallback it shows when a cover is missing (which would put
// the title in the DOM twice and break getByText).
const SEED = [
  makeEntry({ slug: "blade-runner", title: "Blade Runner", medium: "film", status: "done", year: 1982, cover: "http://x/br.jpg" }),
  makeEntry({ slug: "dune", title: "Dune", medium: "book", status: "active", year: 1965, cover: "http://x/dune.jpg" }),
];

describe("library flow", () => {
  it("boots past onboarding and shows the seeded library", async () => {
    renderApp({ entries: SEED });
    // Waits out the async getLibraryPath()/list_entries() boot.
    expect(await screen.findByText("Blade Runner")).toBeInTheDocument();
    expect(screen.getByText("Dune")).toBeInTheDocument();
  });

  it("filtering in the pill narrows the grid", async () => {
    const user = userEvent.setup();
    renderApp({ entries: SEED });
    await screen.findByText("Blade Runner");

    await user.type(screen.getByRole("textbox", { name: /search library/i }), "dune");

    await waitFor(() => expect(screen.queryByText("Blade Runner")).not.toBeInTheDocument());
    expect(screen.getAllByText("Dune").length).toBeGreaterThan(0);
  });

  it("the digit hotkey filters by medium, and 0 restores All", async () => {
    const user = userEvent.setup();
    renderApp({ entries: SEED }); // default enabled order → 1 = Films
    await screen.findByText("Blade Runner");

    await user.keyboard("1");
    await waitFor(() => expect(screen.queryByText("Dune")).not.toBeInTheDocument());
    expect(screen.getByText("Blade Runner")).toBeInTheDocument();

    await user.keyboard("0");
    expect(await screen.findByText("Dune")).toBeInTheDocument();
  });

  it("switches to the timeline layout with the 't' hotkey", async () => {
    const user = userEvent.setup();
    renderApp({ entries: SEED });
    await screen.findByText("Blade Runner");

    await user.keyboard("t");
    // Seeds have no dated log, so the timeline shows its empty hint — a definite
    // "we're on the timeline now" signal (the grid never renders this copy).
    expect(await screen.findByText(/nothing dated to show/i)).toBeInTheDocument();

    await user.keyboard("g");
    expect(await screen.findByText("Blade Runner")).toBeInTheDocument();
  });

  it("opens an entry and round-trips a status change to the backend", async () => {
    const user = userEvent.setup();
    const { backend } = renderApp({ entries: SEED });
    await user.click(await screen.findByText("Blade Runner"));

    // We're on the detail page now (its status chips are the film verbs).
    const watching = await screen.findByRole("button", { name: "Watching" });
    await user.click(watching);

    // The change actually hit the store (status is set via patch_entry), through
    // App's real upsert wiring.
    await waitFor(() => expect(backend.entries.get("film/blade-runner")?.status).toBe("active"));
    expect(backend.callsTo("patch_entry")).toContainEqual({
      id: "film/blade-runner",
      patch: { status: "active" },
    });
  });
});
