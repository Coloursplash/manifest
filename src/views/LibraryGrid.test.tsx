import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LibraryGrid } from "./LibraryGrid";
import { makeEntry } from "../test/entry";

// A card renders its title twice (the Cover fallback + the caption); scope title
// lookups to the caption element so they resolve to one node.
const cardTitle = (t: string) => screen.queryByText(t, { selector: ".card__title" });

describe("LibraryGrid", () => {
  it("shows the empty hint when there are no entries", () => {
    render(<LibraryGrid entries={[]} onOpen={vi.fn()} emptyHint="Nothing here yet" />);
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
  });

  it("groups entries into status sections and hides empty ones", () => {
    render(
      <LibraryGrid
        entries={[
          makeEntry({ title: "Now Playing", status: "active" }),
          makeEntry({ title: "Someday", status: "want" }),
          makeEntry({ title: "Finished It", status: "done" }),
        ]}
        onOpen={vi.fn()}
        emptyHint=""
      />,
    );
    // one section header per non-empty status bucket
    expect(screen.getByRole("button", { name: /In Progress/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Backlog/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Done/ })).toBeInTheDocument();
    // no dropped/unsorted entries → those sections are absent
    expect(screen.queryByRole("button", { name: /Dropped/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unsorted/ })).not.toBeInTheDocument();
  });

  it("statusless entries fall into an Unsorted section", () => {
    render(
      <LibraryGrid entries={[makeEntry({ title: "Loose" })]} onOpen={vi.fn()} emptyHint="" />,
    );
    expect(screen.getByRole("button", { name: /Unsorted/ })).toBeInTheDocument();
  });

  it("shows the entry count in each section header", () => {
    render(
      <LibraryGrid
        entries={[
          makeEntry({ status: "want" }),
          makeEntry({ status: "want" }),
        ]}
        onOpen={vi.fn()}
        emptyHint=""
      />,
    );
    expect(screen.getByRole("button", { name: /Backlog/ })).toHaveTextContent("2");
  });

  it("shows every category as a shelf by default, with all cards visible", () => {
    render(
      <LibraryGrid
        entries={[
          makeEntry({ title: "Active One", status: "active" }),
          makeEntry({ title: "Backlog One", status: "want" }),
        ]}
        onOpen={vi.fn()}
        emptyHint=""
      />,
    );
    // nothing is hidden now — both categories render their cards in a shelf
    expect(cardTitle("Active One")).toBeInTheDocument();
    expect(cardTitle("Backlog One")).toBeInTheDocument();
    // …and start collapsed: a one-row shelf, not the full grid
    expect(screen.getByRole("button", { name: /Backlog/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(document.querySelector(".shelf")).toBeTruthy();
    expect(document.querySelector(".grid")).toBeFalsy();
  });

  it("clicking a section header expands the shelf into a grid and persists", async () => {
    const user = userEvent.setup();
    render(
      <LibraryGrid
        entries={[makeEntry({ title: "Backlog One", status: "want" })]}
        onOpen={vi.fn()}
        emptyHint=""
      />,
    );
    const head = screen.getByRole("button", { name: /Backlog/ });
    expect(head).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(".shelf")).toBeTruthy();

    await user.click(head);
    expect(head).toHaveAttribute("aria-expanded", "true");
    // now a full wrapping grid, card still visible
    expect(document.querySelector(".grid")).toBeTruthy();
    expect(cardTitle("Backlog One")).toBeInTheDocument();

    // persisted to localStorage under the bucket key (still "watchlist")
    const saved = JSON.parse(localStorage.getItem("manifest-sections") ?? "{}");
    expect(saved.watchlist).toBe(true);
  });

  it("caps a big shelf with a +N more tile that expands the category", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 30 }, (_, i) =>
      makeEntry({ title: `Want ${i}`, status: "want" }),
    );
    render(<LibraryGrid entries={many} onOpen={vi.fn()} emptyHint="" />);

    // 30 items, preview caps at 24 → a "+6 more" tile
    const more = screen.getByRole("button", { name: /more/i });
    expect(more).toHaveTextContent("+6");

    await user.click(more);
    expect(screen.getByRole("button", { name: /Backlog/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(document.querySelector(".grid")).toBeTruthy();
  });

  it("clicking a card calls onOpen with the entry id", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const entry = makeEntry({ title: "Open Me", status: "active" });
    render(<LibraryGrid entries={[entry]} onOpen={onOpen} emptyHint="" />);

    await user.click(cardTitle("Open Me")!);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith(entry.id);
  });

  it("restores expanded state from localStorage on mount", () => {
    // force the Done section expanded even though it defaults to a shelf
    localStorage.setItem("manifest-sections", JSON.stringify({ done: true }));
    render(
      <LibraryGrid
        entries={[makeEntry({ title: "Done Card", status: "done" })]}
        onOpen={vi.fn()}
        emptyHint=""
      />,
    );
    // rendered as the full grid, not a shelf
    expect(document.querySelector(".grid")).toBeTruthy();
    expect(cardTitle("Done Card")).toBeInTheDocument();
  });
});
