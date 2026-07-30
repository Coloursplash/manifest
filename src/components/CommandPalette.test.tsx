import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CommandPalette, type Command } from "./CommandPalette";

function baseCommands(): { commands: Command[]; add: any; grid: any; sortName: any } {
  const add = vi.fn();
  const grid = vi.fn();
  const sortName = vi.fn();
  const commands: Command[] = [
    { id: "add", title: "Add entry", group: "Actions", perform: add },
    { id: "settings", title: "Open settings", group: "Actions", perform: vi.fn() },
    { id: "grid", title: "Grid view", group: "View", perform: grid },
    {
      id: "sort",
      title: "Sort by…",
      group: "View",
      children: () => [{ id: "sort.name", title: "Name A–Z", perform: sortName }],
    },
  ];
  return { commands, add, grid, sortName };
}

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    const { commands } = baseCommands();
    render(<CommandPalette open={false} onClose={vi.fn()} commands={commands} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists commands grouped when open", () => {
    const { commands } = baseCommands();
    render(<CommandPalette open onClose={vi.fn()} commands={commands} />);
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.getByText("View")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Add entry/ })).toBeInTheDocument();
  });

  it("fuzzy-filters as you type", async () => {
    const user = userEvent.setup();
    const { commands } = baseCommands();
    render(<CommandPalette open onClose={vi.fn()} commands={commands} />);
    await user.type(screen.getByLabelText("Command palette search"), "grid");
    expect(screen.getByRole("option", { name: /Grid view/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Add entry/ })).not.toBeInTheDocument();
  });

  it("runs a command's perform and closes on click", async () => {
    const user = userEvent.setup();
    const { commands, grid } = baseCommands();
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} commands={commands} />);
    await user.click(screen.getByRole("option", { name: /Grid view/ }));
    expect(grid).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("runs the active item on Enter (arrow keys move the selection)", async () => {
    const user = userEvent.setup();
    const { commands, add } = baseCommands();
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} commands={commands} />);
    // first item (Add entry) is active by default
    await user.keyboard("{Enter}");
    expect(add).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("drills into a submenu and back out", async () => {
    const user = userEvent.setup();
    const { commands, sortName } = baseCommands();
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} commands={commands} />);

    await user.click(screen.getByRole("option", { name: /Sort by/ }));
    // now inside the submenu: child visible, parent gone, breadcrumb present
    expect(await screen.findByRole("option", { name: /Name A–Z/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Add entry/ })).not.toBeInTheDocument();

    // Escape pops the level rather than closing the palette
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("option", { name: /Add entry/ })).toBeInTheDocument();
    expect(sortName).not.toHaveBeenCalled();
  });

  it("Escape at the root closes the palette", async () => {
    const user = userEvent.setup();
    const { commands } = baseCommands();
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} commands={commands} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows the empty state when nothing matches", async () => {
    const user = userEvent.setup();
    const { commands } = baseCommands();
    render(
      <CommandPalette open onClose={vi.fn()} commands={commands} emptyText="Nada." />,
    );
    await user.type(screen.getByLabelText("Command palette search"), "zzzzzz");
    expect(screen.getByText("Nada.")).toBeInTheDocument();
  });
});
