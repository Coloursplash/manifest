import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EntryDetail } from "./EntryDetail";
import { makeEntry } from "../test/entry";
import type { Entry } from "../lib/types";

// The view talks to the backend through ../lib/api; mock it so we can assert the
// exact commands each interaction fires. Cover also pulls cacheCover/coverSrc
// from here, so they must be stubbed too.
vi.mock("../lib/api", () => ({
  patchEntry: vi.fn((_id: string, patch: Record<string, unknown>) =>
    Promise.resolve({ ...base, ...patch } as Entry),
  ),
  appendNote: vi.fn(() => Promise.resolve(base)),
  updateNote: vi.fn(() => Promise.resolve(base)),
  deleteNote: vi.fn(() => Promise.resolve(base)),
  deleteEntry: vi.fn(() => Promise.resolve()),
  cacheCover: vi.fn(() => Promise.resolve("")),
  coverSrc: (p: string) => p,
}));

import { patchEntry, appendNote, deleteEntry } from "../lib/api";

let base: Entry;

function renderDetail(overrides: Partial<Entry> = {}, showOwned = false) {
  base = makeEntry({ medium: "film", title: "Blade Runner 2049", ...overrides });
  const onChanged = vi.fn();
  const onDeleted = vi.fn();
  const onBack = vi.fn();
  render(
    <EntryDetail
      entry={base}
      onBack={onBack}
      onChanged={onChanged}
      onDeleted={onDeleted}
      showOwned={showOwned}
    />,
  );
  return { onChanged, onDeleted, onBack };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("status chips", () => {
  it("clicking a status sets it via patchEntry and reports the updated entry", async () => {
    const user = userEvent.setup();
    const { onChanged } = renderDetail({ status: undefined });

    await user.click(screen.getByRole("button", { name: /Watching/ }));

    expect(patchEntry).toHaveBeenCalledWith(base.id, { status: "active" });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("clicking the already-active status clears it (toggle off)", async () => {
    const user = userEvent.setup();
    renderDetail({ status: "active" });

    await user.click(screen.getByRole("button", { name: /Watching/ }));

    expect(patchEntry).toHaveBeenCalledWith(base.id, { status: null });
  });
});

describe("owned toggle", () => {
  it("is hidden for media that don't track ownership", () => {
    renderDetail({ medium: "film", status: "want" });
    expect(screen.queryByRole("button", { name: /Owned/ })).not.toBeInTheDocument();
  });

  it("marks an unowned entry as owned", async () => {
    const user = userEvent.setup();
    const { onChanged } = renderDetail({ medium: "game", status: "want" }, true);

    const toggle = screen.getByRole("button", { name: /Owned/ });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);

    expect(patchEntry).toHaveBeenCalledWith(base.id, { owned: true });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("clears the key rather than writing owned = false when toggled off", async () => {
    const user = userEvent.setup();
    renderDetail({ medium: "game", status: "want", owned: true }, true);

    const toggle = screen.getByRole("button", { name: /Owned/ });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await user.click(toggle);

    expect(patchEntry).toHaveBeenCalledWith(base.id, { owned: null });
  });
});

describe("stray dates on single-sitting media", () => {
  it("shows nothing when a film has no dates", () => {
    renderDetail({ medium: "film" });
    expect(screen.queryByText("Dates")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Finished")).not.toBeInTheDocument();
  });

  it("surfaces a finished date a film shouldn't have, and clears it", async () => {
    const user = userEvent.setup();
    // Films have no Progress section, so this key used to be invisible in the
    // UI while still putting a row on the timeline.
    renderDetail({ medium: "film", status: "done", finished: "2026-07-30" });

    expect(screen.getByText("Dates")).toBeInTheDocument();
    expect(screen.getByLabelText("Finished")).toHaveValue("2026-07-30");

    await user.click(screen.getByRole("button", { name: "Clear Finished" }));
    expect(patchEntry).toHaveBeenCalledWith(base.id, { finished: null });
  });

  it("offers a clear button on dated progress fields too", async () => {
    const user = userEvent.setup();
    renderDetail({ medium: "book", started: "2026-03-01" });

    await user.click(screen.getByRole("button", { name: "Clear Started" }));
    expect(patchEntry).toHaveBeenCalledWith(base.id, { started: null });
  });
});

describe("rating", () => {
  it("clicking a rating circle patches a numeric rating", async () => {
    const user = userEvent.setup();
    renderDetail({ medium: "film" });
    // the rating circles are the buttons inside .rcircles
    const circles = document.querySelectorAll(".rcirc");
    expect(circles.length).toBe(5);

    await user.click(circles[4] as HTMLElement);

    expect(patchEntry).toHaveBeenCalledOnce();
    const [, patch] = (patchEntry as any).mock.calls[0];
    expect(typeof patch.rating).toBe("number");
  });
});

describe("log flow", () => {
  it("reveals the editor and a bare 'Just watched it' appends an empty-body note", async () => {
    const user = userEvent.setup();
    const { onChanged } = renderDetail();

    // no editor until you click the add button
    expect(screen.queryByPlaceholderText("Thoughts (optional)")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Log a watch/ }));
    expect(screen.getByPlaceholderText("Thoughts (optional)")).toBeInTheDocument();

    // empty body → the submit reads "Just watched it"
    await user.click(screen.getByRole("button", { name: "Just watched it" }));

    expect(appendNote).toHaveBeenCalledOnce();
    const [id, date, tags, body] = (appendNote as any).mock.calls[0];
    expect(id).toBe(base.id);
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(tags).toEqual([]);
    expect(body).toBe("");
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("typing a body switches the submit to 'Log with note' and passes the text", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole("button", { name: /Log a watch/ }));

    await user.type(
      screen.getByPlaceholderText("Thoughts (optional)"),
      "The sound design shakes the room.",
    );
    await user.click(screen.getByRole("button", { name: "Log with note" }));

    const [, , tags, body] = (appendNote as any).mock.calls[0];
    expect(tags).toEqual([]);
    expect(body).toBe("The sound design shakes the room.");
  });

  it("toggling the #rewatch chip includes the repeat tag", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole("button", { name: /Log a watch/ }));

    await user.click(screen.getByRole("button", { name: "#rewatch" }));
    await user.click(screen.getByRole("button", { name: "Just watched it" }));

    const [, , tags] = (appendNote as any).mock.calls[0];
    expect(tags).toEqual(["rewatch"]);
  });

  it("renders existing log blocks and an empty-state hint", () => {
    const { onChanged } = renderDetail({
      notes: "2026-07-09 #rewatch\nSecond viewing.",
    });
    expect(screen.getByText("2026-07-09")).toBeInTheDocument();
    expect(screen.getByText("Second viewing.")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("shows 'Nothing logged yet.' when there are no notes", () => {
    renderDetail({ notes: undefined });
    expect(screen.getByText("Nothing logged yet.")).toBeInTheDocument();
  });
});

describe("progress fields", () => {
  it("committing a Started date patches it (film has none; use a book)", async () => {
    renderDetail({ medium: "book" });

    // Progress section only exists for non-single media. Date inputs commit on
    // change, so drive it directly.
    const started = screen.getByLabelText("Started");
    fireEvent.change(started, { target: { value: "2026-05-01" } });

    await waitFor(() =>
      expect(patchEntry).toHaveBeenCalledWith(base.id, { started: "2026-05-01" }),
    );
  });
});

describe("trash", () => {
  it("confirms before deleting and calls onDeleted on confirm", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { onDeleted } = renderDetail();

    await user.click(screen.getByRole("button", { name: /Trash/ }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(deleteEntry).toHaveBeenCalledWith(base.id);
    expect(onDeleted).toHaveBeenCalledOnce();
  });

  it("does nothing when the confirm is dismissed", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onDeleted } = renderDetail();

    await user.click(screen.getByRole("button", { name: /Trash/ }));

    expect(deleteEntry).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

// The whole point: a film is a sitting, a book or a season is a stretch. The
// log editor has to ask the right question per medium.
describe("logging something you got through over time", () => {
  it("asks a film for one date", async () => {
    const user = userEvent.setup();
    renderDetail({ medium: "film" });
    await user.click(screen.getByRole("button", { name: /Log a watch/ }));

    expect(screen.getByLabelText("Date")).toBeInTheDocument();
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
  });

  it("asks a book for a From → To stretch", async () => {
    const user = userEvent.setup();
    renderDetail({ medium: "book" });
    await user.click(screen.getByRole("button", { name: /Log a read/ }));

    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
    expect(screen.queryByLabelText("Date")).not.toBeInTheDocument();
  });

  it("writes the span chronologically and fills the entry's own dates", async () => {
    const user = userEvent.setup();
    renderDetail({ medium: "book" });
    await user.click(screen.getByRole("button", { name: /Log a read/ }));

    await user.clear(screen.getByLabelText("From"));
    await user.type(screen.getByLabelText("From"), "2026-03-01");
    await user.clear(screen.getByLabelText("To"));
    await user.type(screen.getByLabelText("To"), "2026-03-19");
    await user.click(screen.getByRole("button", { name: "Just read it" }));

    // date = start, end = finish — the block reads 2026-03-01..2026-03-19.
    const [, date, , , end] = (appendNote as any).mock.calls[0];
    expect(date).toBe("2026-03-01");
    expect(end).toBe("2026-03-19");
    // …and the dates you typed become the entry's own, since it had none.
    expect(patchEntry).toHaveBeenCalledWith(base.id, {
      started: "2026-03-01",
      finished: "2026-03-19",
    });
  });

  it("logs a single day when Started is left blank", async () => {
    const user = userEvent.setup();
    renderDetail({ medium: "book" });
    await user.click(screen.getByRole("button", { name: /Log a read/ }));
    await user.click(screen.getByRole("button", { name: "Just read it" }));

    const [, date, , , end] = (appendNote as any).mock.calls[0];
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(end).toBeUndefined();
    // Only `finished` — there's no start to record.
    expect(patchEntry).toHaveBeenCalledWith(base.id, { finished: date });
  });

  it("never overwrites dates the entry already has (a reread)", async () => {
    const user = userEvent.setup();
    renderDetail({ medium: "book", started: "2024-01-01", finished: "2024-02-01" });
    await user.click(screen.getByRole("button", { name: /Log a read/ }));

    await user.clear(screen.getByLabelText("From"));
    await user.type(screen.getByLabelText("From"), "2026-03-01");
    await user.click(screen.getByRole("button", { name: "Just read it" }));

    expect(appendNote).toHaveBeenCalledOnce();
    expect(patchEntry).not.toHaveBeenCalled();
  });

  it("leaves a film's dates alone — it has nowhere to show them", async () => {
    const user = userEvent.setup();
    renderDetail({ medium: "film" });
    await user.click(screen.getByRole("button", { name: /Log a watch/ }));
    await user.click(screen.getByRole("button", { name: "Just watched it" }));

    expect(appendNote).toHaveBeenCalledOnce();
    expect(patchEntry).not.toHaveBeenCalled();
  });

  it("shows an existing span on the block, and re-opens it in both fields", async () => {
    const user = userEvent.setup();
    renderDetail({ medium: "book", notes: "2026-03-01..2026-03-19\nSlowly." });

    expect(screen.getByText("2026-03-01 → 2026-03-19")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("From")).toHaveValue("2026-03-01");
    expect(screen.getByLabelText("To")).toHaveValue("2026-03-19");
  });
});
