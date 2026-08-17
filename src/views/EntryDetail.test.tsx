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
