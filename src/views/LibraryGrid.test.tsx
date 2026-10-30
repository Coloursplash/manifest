import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LibraryGrid, cardWidth } from "./LibraryGrid";
import { makeEntry } from "../test/entry";

// Mirrors the CSS the widths are computed against.
const MIN = 152;
const GAP = 22;

// A card renders its title twice (the Cover fallback + the caption); scope title
// lookups to the caption element so they resolve to one node.
const cardTitle = (t: string) => screen.queryByText(t, { selector: ".card__title" });

// jsdom has no layout, so the measured `--card-w` never lands in these tests —
// exercise the arithmetic directly. This is the number a shelf and an expanded
// grid now share, which is the whole point: opening a section must not resize
// a single cover.
describe("cardWidth", () => {
  it("matches what auto-fill would do: as many min-width cards as fit", () => {
    // 1200 = 7 columns (7×152 + 6×22 = 1196), the slack shared out
    expect(cardWidth(1200)).toBe(Math.floor((1200 - 6 * GAP) / 7));
    expect(cardWidth(1200)).toBeGreaterThanOrEqual(MIN);
  });

  it("never overflows the row, and never drops below the minimum", () => {
    for (let w = MIN; w <= 2400; w += 7) {
      const card = cardWidth(w);
      const cols = Math.max(1, Math.floor((w + GAP) / (MIN + GAP)));
      expect(card * cols + (cols - 1) * GAP).toBeLessThanOrEqual(w);
      if (w >= MIN) expect(card).toBeGreaterThanOrEqual(MIN);
    }
  });

  it("gives one full-width card when only one fits, and copes with no width", () => {
    expect(cardWidth(300)).toBe(300);
    expect(cardWidth(0)).toBe(MIN); // pre-layout / jsdom
  });
});

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

  // One rule for every category, In Progress included: mixed while collapsed,
  // split by medium once you open it.
  describe("per-medium grouping", () => {
    const MIXED = [
      makeEntry({ slug: "a-film", title: "A Film", medium: "film", status: "done" }),
      makeEntry({ slug: "a-game", title: "A Game", medium: "game", status: "done" }),
      makeEntry({ slug: "b-film", title: "B Film", medium: "film", status: "done" }),
    ];

    it("collapses to one mixed shelf, no sub-headers", () => {
      render(<LibraryGrid entries={MIXED} onOpen={vi.fn()} emptyHint="" />);

      expect(document.querySelectorAll(".shelf")).toHaveLength(1);
      expect(document.querySelector(".lib-subhead")).toBeFalsy();
      expect(cardTitle("A Film")).toBeInTheDocument();
      expect(cardTitle("A Game")).toBeInTheDocument();
    });

    it("splits into a grid per medium, in canonical order, when expanded", async () => {
      const user = userEvent.setup();
      render(<LibraryGrid entries={MIXED} onOpen={vi.fn()} emptyHint="" />);
      await user.click(screen.getByRole("button", { name: /Done/ }));

      const heads = [...document.querySelectorAll(".lib-subhead")].map((n) => n.textContent);
      expect(heads).toEqual(["Films", "Games"]); // MEDIA order, not entry order
      expect(document.querySelectorAll(".grid")).toHaveLength(2);
      expect(document.querySelectorAll(".shelf")).toHaveLength(0);
    });

    it("skips the sub-header when the category holds one medium", async () => {
      const user = userEvent.setup();
      render(
        <LibraryGrid
          entries={[makeEntry({ title: "Only Film", medium: "film", status: "done" })]}
          onOpen={vi.fn()}
          emptyHint=""
        />,
      );
      await user.click(screen.getByRole("button", { name: /Done/ }));

      expect(document.querySelector(".lib-subhead")).toBeFalsy();
      expect(document.querySelectorAll(".grid")).toHaveLength(1);
    });

    it("applies to In Progress too — it isn't special any more", async () => {
      const user = userEvent.setup();
      render(
        <LibraryGrid
          entries={[
            makeEntry({ slug: "f", title: "Film Now", medium: "film", status: "active" }),
            makeEntry({ slug: "g", title: "Game Now", medium: "game", status: "active" }),
          ]}
          onOpen={vi.fn()}
          emptyHint=""
        />,
      );
      // collapsed: one shelf for the whole category
      expect(document.querySelectorAll(".shelf")).toHaveLength(1);
      expect(document.querySelector(".lib-subhead")).toBeFalsy();

      await user.click(screen.getByRole("button", { name: /In Progress/ }));
      expect([...document.querySelectorAll(".lib-subhead")].map((n) => n.textContent)).toEqual([
        "Films",
        "Games",
      ]);
    });
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

  describe("Backlog / Wishlist split", () => {
    it("splits want entries by ownership for media that track it", () => {
      render(
        <LibraryGrid
          entries={[
            makeEntry({ title: "Bought It", medium: "game", status: "want", owned: true }),
            makeEntry({ title: "Want To Buy", medium: "game", status: "want" }),
          ]}
          onOpen={vi.fn()}
          emptyHint=""
          ownedMedia={["game"]}
        />,
      );
      expect(screen.getByRole("button", { name: /Backlog/ })).toHaveTextContent("1");
      expect(screen.getByRole("button", { name: /Wishlist/ })).toHaveTextContent("1");
    });

    it("treats an unmarked entry as unowned → Wishlist", () => {
      render(
        <LibraryGrid
          entries={[makeEntry({ title: "Unmarked", medium: "game", status: "want" })]}
          onOpen={vi.fn()}
          emptyHint=""
          ownedMedia={["game"]}
        />,
      );
      expect(screen.getByRole("button", { name: /Wishlist/ })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Backlog/ })).not.toBeInTheDocument();
    });

    it("leaves media that don't track ownership wholly in Backlog", () => {
      render(
        <LibraryGrid
          entries={[
            makeEntry({ title: "A Film", medium: "film", status: "want" }),
            makeEntry({ title: "An Album", medium: "music", status: "want", owned: true }),
          ]}
          onOpen={vi.fn()}
          emptyHint=""
          ownedMedia={["game"]}
        />,
      );
      expect(screen.getByRole("button", { name: /Backlog/ })).toHaveTextContent("2");
      expect(screen.queryByRole("button", { name: /Wishlist/ })).not.toBeInTheDocument();
    });

    it("never splits when no medium tracks ownership", () => {
      render(
        <LibraryGrid
          entries={[makeEntry({ title: "Unowned Game", medium: "game", status: "want" })]}
          onOpen={vi.fn()}
          emptyHint=""
          ownedMedia={[]}
        />,
      );
      expect(screen.getByRole("button", { name: /Backlog/ })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Wishlist/ })).not.toBeInTheDocument();
    });
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
