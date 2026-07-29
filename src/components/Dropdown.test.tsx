import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dropdown } from "./Dropdown";

const OPTIONS = [
  { value: "a", label: "Apple" },
  { value: "b", label: "Banana" },
  { value: "c", label: "Cherry" },
] as const;

function setup(value: "a" | "b" | "c" = "a") {
  const onChange = vi.fn();
  render(
    <Dropdown
      value={value}
      options={OPTIONS as any}
      onChange={onChange}
      leading="Sort"
      ariaLabel="Sort order"
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
    expect(screen.queryByRole("button", { name: "Cherry" })).not.toBeInTheDocument();
  });

  it("opens on click and reveals every option", async () => {
    const user = userEvent.setup();
    setup("a");
    const trigger = screen.getByRole("button", { name: "Sort order" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    for (const o of OPTIONS) {
      expect(screen.getByRole("button", { name: o.label })).toBeInTheDocument();
    }
  });

  it("fires onChange with the chosen value and closes the menu", async () => {
    const user = userEvent.setup();
    const { onChange } = setup("a");
    await user.click(screen.getByRole("button", { name: "Sort order" }));
    await user.click(screen.getByRole("button", { name: "Cherry" }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("c");
    // menu closed again
    expect(screen.queryByRole("button", { name: "Banana" })).not.toBeInTheDocument();
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
    const selected = screen.getByRole("button", { name: "Banana" });
    expect(selected.className).toContain("is-selected");

    // backdrop is the div immediately preceding the menu
    const backdrop = document.querySelector(".dropdown__backdrop") as HTMLElement;
    await user.click(backdrop);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Apple" })).not.toBeInTheDocument();
  });
});
