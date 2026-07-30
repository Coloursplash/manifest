// Integration: the command bar (VSCode-style ">") through the real App — typing
// a leading ">" flips the pill into command mode, fuzzy-searches the real
// buildCommands() list, and running a command drives real App state. Spans
// OmniBox command-mode → paletteCommands → App wiring.
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderApp } from "./harness";
import { makeEntry } from "../../src/test/entry";

const SEED = [
  makeEntry({ slug: "akira", title: "Akira", medium: "anime", status: "done", cover: "http://x/akira.jpg" }),
];

describe("command bar", () => {
  it("runs 'Timeline view' from > command mode and switches layout", async () => {
    const user = userEvent.setup();
    renderApp({ entries: SEED });
    await screen.findByText("Akira");

    const box = screen.getByRole("textbox", { name: /search library/i });
    await user.type(box, ">timeline");

    // The command list is a listbox; the Timeline command is the match.
    const option = await screen.findByRole("option", { name: /timeline view/i });
    await user.click(option);

    // Layout switched to the timeline (its empty hint appears; the grid's cards
    // are gone).
    expect(await screen.findByText(/nothing dated to show/i)).toBeInTheDocument();
  });

  it("jumps to an entry from command mode via Enter", async () => {
    const user = userEvent.setup();
    renderApp({ entries: SEED });
    await screen.findByText("Akira");

    const box = screen.getByRole("textbox", { name: /search library/i });
    // Entries are commands too; fuzzy-search to the only match and run it.
    await user.type(box, ">akira");
    await screen.findByRole("option", { name: /akira/i });
    await user.keyboard("{Enter}");

    // On the detail page now: its back-to-library control appears.
    expect(await screen.findByRole("button", { name: /library/i })).toBeInTheDocument();
  });
});
