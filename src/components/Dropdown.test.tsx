import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dropdown } from "./Dropdown";

const OPTIONS = [
  { value: "a", label: "Apple" },
  { value: "b", label: "Banana" },
  { value: "c", label: "Cherry" },
] as const;

function setup(value: "a" | "b" | "c" = "a", compact = false) {
  const onChange = vi.fn();
  render(
    <Dropdown
      value={value}
      options={OPTIONS as any}
      onChange={onChange}
      leading="Sort"
      ariaLabel="Sort order"
      compactIcon={<i data-testid="icon" />}
      compact={compact}
    />,
  );
  return { onChange };
}

describe("Dropdown", () => {
  it("shows the current value's label and the leading prefix, menu closed initially", () => {
    setup("b");
    expect(screen.getByRole("button", { name: "Sort order" })).toHaveTextContent("Banana");
    expect(screen.getByText("Sort")).toBeInTheDocument();
    // options are not rendered until opened
    expect(screen.queryByRole("option", { name: "Cherry" })).not.toBeInTheDocument();
  });

  it("opens on click and reveals every option", async () => {
    const user = userEvent.setup();
    setup("a");
    const trigger = screen.getByRole("button", { name: "Sort order" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    for (const o of OPTIONS) {
      expect(screen.getByRole("option", { name: o.label })).toBeInTheDocument();
    }
  });

  it("fires onChange with the chosen value and closes the menu", async () => {
    const user = userEvent.setup();
    const { onChange } = setup("a");
    await user.click(screen.getByRole("button", { name: "Sort order" }));
    await user.click(screen.getByRole("option", { name: "Cherry" }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("c");
    // menu closed again
    expect(screen.queryByRole("option", { name: "Banana" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort order" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("marks the selected option and clicking the backdrop closes without a change", async () => {
    const user = userEvent.setup();
    const { onChange } = setup("b");
    await user.click(screen.getByRole("button", { name: "Sort order" }));

    // the selected item carries the is-selected class
    const selected = screen.getByRole("option", { name: "Banana" });
    expect(selected.className).toContain("is-selected");

    // backdrop is the div immediately preceding the menu
    const backdrop = document.querySelector(".dropdown__backdrop") as HTMLElement;
    await user.click(backdrop);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("option", { name: "Apple" })).not.toBeInTheDocument();
  });

  it("is operable from the keyboard: ↓ opens at the current value, ↓⏎ picks the next", async () => {
    const user = userEvent.setup();
    const { onChange } = setup("b");
    const trigger = screen.getByRole("button", { name: "Sort order" });
    trigger.focus();

    await user.keyboard("{ArrowDown}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    // the cursor starts on the selected option, not at the top of the list
    expect(screen.getByRole("option", { name: "Banana" }).className).toContain("is-active");

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("c");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("Escape closes the menu without choosing", async () => {
    const user = userEvent.setup();
    const { onChange } = setup("a");
    const trigger = screen.getByRole("button", { name: "Sort order" });
    trigger.focus();

    await user.keyboard("{ArrowDown}{ArrowDown}{Escape}");
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("compact hides the value text but keeps it in the accessible name", () => {
    setup("c", true);
    // no visible label to read, so the name has to carry the current value
    const trigger = screen.getByRole("button", { name: "Sort order: Cherry" });
    expect(trigger).not.toHaveTextContent("Cherry");
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });
});
