// Integration: the headline "add an entry" loop through the real App — open add
// mode from the floating pill, search a provider (faked), pick a status on a hit,
// and watch the created entry land in both the backend store and the grid. This
// spans OmniBox add-mode → views/add/AddPanel → src/lib/api → the fake backend.
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
    await waitFor(() => expect(backend.entries.get("film/arrival")?.rating).toBe(8));
    const created = backend.entries.get("film/arrival")!;
    expect(created.title).toBe("Arrival");
    expect(created.status).toBe("done");
    expect(created.logs).toMatchObject([{ date: "2026-05-25", body: "Heptapods." }]);

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
    expect(backend.callsTo("add_log")).toHaveLength(0);
  });

  // The keyboard model: type the title, ⏎ locks it in and hands focus to the
  // grid, the arrows walk the grid, ⏎ on a hit logs it.
  describe("keyboard", () => {
    const THREE: Candidate[] = [
      { title: "Arrival", year: 2016, cover: "a.jpg" },
      { title: "Sicario", year: 2015, cover: "b.jpg" },
      { title: "Dune", year: 2021, cover: "c.jpg" },
    ];
    const card = (title: string) =>
      screen.getByText(title, { selector: ".scard__title" }).closest(".scard")!;

    /** N → type → wait for hits. */
    async function search(user: ReturnType<typeof userEvent.setup>) {
      await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
      await user.keyboard("n");
      expect(screen.getByRole("textbox", { name: /search library/i })).toHaveFocus();
      await user.keyboard("arrival");
      await screen.findByText("Arrival (2016)", {}, { timeout: 2000 });
    }

    it("⏎ locks the title in and focuses the first hit; arrows move along the row", async () => {
      const user = userEvent.setup();
      renderApp({ hasTmdbKey: true, candidates: THREE });
      await search(user);

      await user.keyboard("{Enter}");
      expect(card("Arrival (2016)")).toHaveFocus();

      await user.keyboard("{ArrowRight}");
      expect(card("Sicario (2015)")).toHaveFocus();
      await user.keyboard("{ArrowRight}");
      expect(card("Dune (2021)")).toHaveFocus();
      // Clamped at the end rather than wrapping round.
      await user.keyboard("{ArrowRight}");
      expect(card("Dune (2021)")).toHaveFocus();

      await user.keyboard("{ArrowLeft}");
      expect(card("Sicario (2015)")).toHaveFocus();
    });

    it("Esc from the grid puts the caret back in the title, add mode still open", async () => {
      const user = userEvent.setup();
      renderApp({ hasTmdbKey: true, candidates: THREE });
      await search(user);

      await user.keyboard("{Enter}");
      await user.keyboard("{Escape}");
      expect(screen.getByRole("textbox", { name: /search library/i })).toHaveFocus();
      // Still adding — the hits are on screen and the title survived.
      expect(screen.getByText("Arrival (2016)")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: /search library/i })).toHaveValue("arrival");
    });

    it("⇥ steps through the categories and re-runs the search there", async () => {
      const user = userEvent.setup();
      const { backend } = renderApp({ hasTmdbKey: true, candidates: THREE });
      await search(user);

      // Films is first; ⇥ moves to the next enabled medium and searches it.
      await user.keyboard("{Tab}");
      await waitFor(() => {
        const searches = backend.callsTo("search_metadata");
        expect(searches[searches.length - 1].medium).toBe("tv");
      });
      // The strip tracks it (the rail has a "TV" button too, so scope to the
      // panel's category tabs), and focus never left the title field.
      expect(document.querySelector(".tab--on")).toHaveTextContent("TV");
      expect(screen.getByRole("textbox", { name: /search library/i })).toHaveFocus();
    });

    it("⇥ from the grid keeps you on the grid once the new hits land", async () => {
      const user = userEvent.setup();
      renderApp({ hasTmdbKey: true, candidates: THREE });
      await search(user);

      await user.keyboard("{Enter}{ArrowRight}");
      expect(card("Sicario (2015)")).toHaveFocus();

      // The old hits belong to Films, so they're dropped on the way out — focus
      // catches the new category's first hit rather than falling to <body>.
      await user.keyboard("{Tab}");
      await waitFor(() => expect(card("Arrival (2016)")).toHaveFocus(), { timeout: 2000 });
    });

    it("⏎ on a hit opens the log dialog, and ⌘⏎ commits it", async () => {
      const user = userEvent.setup();
      const { backend } = renderApp({ hasTmdbKey: true, candidates: THREE });
      await search(user);

      await user.keyboard("{Enter}{ArrowRight}{Enter}");
      expect(await screen.findByText(/Log a watch/)).toBeInTheDocument();
      expect(screen.getByText("Sicario (2015)")).toBeInTheDocument();
      // Nothing is written until you commit.
      expect(backend.callsTo("create_entry")).toHaveLength(0);

      // Focus follows in, so you can just write.
      expect(screen.getByPlaceholderText(/Thoughts/)).toHaveFocus();
      await user.keyboard("Tense.");
      await user.keyboard("{Meta>}{Enter}{/Meta}");

      await waitFor(() => expect(backend.entries.get("film/sicario")?.logs).toHaveLength(1));
      const made = backend.entries.get("film/sicario")!;
      expect(made.status).toBe("done");
      expect(made.logs[0].body).toBe("Tense.");
    });

    it("⇧⏎ files a Plan without a dialog and leaves you on the grid", async () => {
      const user = userEvent.setup();
      const { backend } = renderApp({ hasTmdbKey: true, candidates: THREE });
      await search(user);

      await user.keyboard("{Enter}");
      await user.keyboard("{Shift>}{Enter}{/Shift}");

      await waitFor(() => expect(backend.entries.has("film/arrival")).toBe(true));
      expect(backend.entries.get("film/arrival")!.status).toBe("want");
      expect(screen.queryByText(/Log a watch/)).not.toBeInTheDocument();
      expect(backend.callsTo("add_log")).toHaveLength(0);
    });
  });

  // You don't watch a season on a Tuesday. Logging one from the add flow has to
  // record the stretch, not make you pick a day and invent the rest.
  it("logs a TV show over a range of dates, not a single day", async () => {
    const user = userEvent.setup();
    const { backend } = renderApp({
      hasTmdbKey: true,
      candidates: [{ title: "Severance", year: 2022, cover: "s.jpg" }],
    });
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    // Filter the library to TV first, so the add flow opens on that category.
    await user.keyboard("2");
    await user.keyboard("n");
    await user.keyboard("severance");
    await screen.findByText("Severance (2022)", {}, { timeout: 2000 });
    await user.keyboard("{Enter}{Enter}");

    // The log dialog asks for a stretch, not a date.
    expect(await screen.findByText(/Log a watch/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Date")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("From"));
    await user.type(screen.getByLabelText("From"), "2026-01-05");
    await user.clear(screen.getByLabelText("To"));
    await user.type(screen.getByLabelText("To"), "2026-02-10");
    await user.type(screen.getByPlaceholderText(/Thoughts/), "Took our time.");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    await waitFor(() => expect(backend.entries.get("tv/severance")?.finished).toBe("2026-02-10"));
    const made = backend.entries.get("tv/severance")!;
    expect(made.logs).toMatchObject([
      { date: "2026-01-05", end: "2026-02-10", body: "Took our time." },
    ]);
    // The dates you typed are the entry's own too — TV has somewhere to show them.
    expect(made.started).toBe("2026-01-05");
    expect(made.finished).toBe("2026-02-10");
  });

  it("still logs a film as the one sitting it was", async () => {
    const user = userEvent.setup();
    const { backend } = renderApp({ hasTmdbKey: true, candidates: CANDIDATES });
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    await user.keyboard("n");
    await user.keyboard("arrival");
    await screen.findByText("Arrival (2016)", {}, { timeout: 2000 });
    await user.keyboard("{Enter}{Enter}");

    expect(await screen.findByText(/Log a watch/)).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Log it" }));

    await waitFor(() => expect(backend.entries.get("film/arrival")?.logs).toHaveLength(1));
    const made = backend.entries.get("film/arrival")!;
    expect(made.logs[0].end).toBeUndefined();
    // No `finished` key: a film has no Dates section to show it in, and an
    // invisible date is exactly the phantom-timeline-row bug from before.
    expect(made.finished).toBeUndefined();
    expect(made.started).toBeUndefined();
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

  it("a double-click on Plan files it once", async () => {
    const user = userEvent.setup();
    const { backend } = renderApp({ hasTmdbKey: true, candidates: CANDIDATES });
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /add entry/i }));
    await user.type(screen.getByRole("textbox", { name: /search library/i }), "arrival");
    await user.dblClick(await screen.findByRole("button", { name: "Plan" }, { timeout: 2000 }));

    await waitFor(() => expect(backend.entries.has("film/arrival")).toBe(true));
    expect(backend.callsTo("create_entry")).toHaveLength(1);
    expect(screen.queryByText(/failed|exists/i)).not.toBeInTheDocument();
  });

  it("retrying a failed log doesn't create the entry twice", async () => {
    const user = userEvent.setup();
    const { backend } = renderApp({
      hasTmdbKey: true,
      candidates: CANDIDATES,
      failOnce: ["add_log"],
    });
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /add entry/i }));
    await user.type(screen.getByRole("textbox", { name: /search library/i }), "arrival");
    await user.click(await screen.findByRole("button", { name: "Watched" }, { timeout: 2000 }));
    await user.click(screen.getByRole("button", { name: "Log it" }));

    // The log step failed: the dialog stays open and says so.
    expect(await screen.findByText(/add_log failed/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Log it" }));

    await waitFor(() => expect(backend.entries.get("film/arrival")?.logs).toHaveLength(1));
    expect(backend.callsTo("create_entry")).toHaveLength(1);
  });
});
