import { describe, it, expect, vi } from "vitest";
import { createRef, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OmniBox, type OmniBoxHandle } from "./OmniBox";
import type { Command } from "./CommandPalette";

// The filter value is controlled by the parent (in the app, App's `query`), so
// wrap OmniBox in local state to exercise real typing/accumulation.
function Harness({ list, initial = "" }: { list: Command[]; initial?: string }) {
  const [filter, setFilter] = useState(initial);
  return <OmniBox filter={filter} onFilter={setFilter} commands={list} />;
}

function commands(): { list: Command[]; grid: any; add: any } {
  const grid = vi.fn();
  const add = vi.fn();
  const list: Command[] = [
    { id: "add", title: "Add entry", group: "Actions", perform: add },
    { id: "grid", title: "Grid view", group: "View", perform: grid },
    { id: "timeline", title: "Timeline view", group: "View", perform: vi.fn() },
  ];
  return { list, grid, add };
}

describe("OmniBox", () => {
  it("filters the library as plain text (no command dropdown)", async () => {
    const user = userEvent.setup();
    const { list } = commands();
    render(<Harness list={list} />);

    const box = screen.getByRole("textbox");
    await user.type(box, "blade");
    expect(box).toHaveValue("blade");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("enters command mode on '>' and lists commands without touching the filter", async () => {
    const user = userEvent.setup();
    const onFilter = vi.fn();
    const { list } = commands();
    render(<OmniBox filter="" onFilter={onFilter} commands={list} />);

    await user.type(screen.getByRole("textbox"), ">");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Add entry/ })).toBeInTheDocument();
    // ">" is a command, not a filter value
    expect(onFilter).not.toHaveBeenCalledWith(">");
  });

  it("fuzzy-filters commands after the '>'", async () => {
    const user = userEvent.setup();
    const { list } = commands();
    render(<OmniBox filter="" onFilter={vi.fn()} commands={list} />);

    await user.type(screen.getByRole("textbox"), ">grid");
    expect(screen.getByRole("option", { name: /Grid view/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Add entry/ })).not.toBeInTheDocument();
  });

  it("runs a command on click", async () => {
    const user = userEvent.setup();
    const { list, grid } = commands();
    render(<OmniBox filter="" onFilter={vi.fn()} commands={list} />);

    await user.type(screen.getByRole("textbox"), ">grid");
    await user.click(screen.getByRole("option", { name: /Grid view/ }));
    expect(grid).toHaveBeenCalledOnce();
    // dropdown closes (back to filter mode)
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("runs the active command on Enter", async () => {
    const user = userEvent.setup();
    const { list, add } = commands();
    render(<OmniBox filter="" onFilter={vi.fn()} commands={list} />);

    await user.type(screen.getByRole("textbox"), ">");
    await user.keyboard("{Enter}"); // first item (Add entry) active by default
    expect(add).toHaveBeenCalledOnce();
  });

  it("Escape exits command mode and restores the underlying filter", async () => {
    const user = userEvent.setup();
    const ref = createRef<OmniBoxHandle>();
    const { list } = commands();
    // A live filter of "dune"; ⌘K (commandMode) enters ">" over it.
    render(<OmniBox ref={ref} filter="dune" onFilter={vi.fn()} commands={list} />);

    ref.current!.commandMode();
    await user.keyboard("so");
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // the field falls back to the live filter text, not blank
    expect(screen.getByRole("textbox")).toHaveValue("dune");
  });

  it("commandMode() on the ref opens command mode with an empty (un-doubled) field", async () => {
    const ref = createRef<OmniBoxHandle>();
    const { list } = commands();
    render(<OmniBox ref={ref} filter="" onFilter={vi.fn()} commands={list} />);

    ref.current!.commandMode();
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    // the ">" lives in the icon, not the text — so the field is empty
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("does not keep the '>' character in the field when entering command mode", async () => {
    const user = userEvent.setup();
    const { list } = commands();
    render(<OmniBox filter="" onFilter={vi.fn()} commands={list} />);

    const box = screen.getByRole("textbox");
    await user.type(box, ">gr");
    // command mode is on (dropdown), but the text is just "gr" — no leading ">"
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(box).toHaveValue("gr");
  });
});
