import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MediaChooser } from "./MediaChooser";
import { MEDIUM_LABEL, type Medium } from "../lib/types";

function setup(order: Medium[], enabled: Medium[]) {
  const onReorder = vi.fn();
  const onToggle = vi.fn();
  render(
    <MediaChooser
      order={order}
      enabled={enabled}
      onReorder={onReorder}
      onToggle={onToggle}
    />,
  );
  return { onReorder, onToggle };
}

describe("MediaChooser", () => {
  it("renders every medium row in the given order", () => {
    setup(["book", "film", "game"], ["book", "film", "game"]);
    const labels = screen.getAllByText(
      (_t, el) => el?.className === "mediarow__label",
    );
    expect(labels.map((l) => l.textContent)).toEqual([
      MEDIUM_LABEL.book,
      MEDIUM_LABEL.film,
      MEDIUM_LABEL.game,
    ]);
  });

  it("an enabled row reads 'Show' and toggling it fires onToggle", async () => {
    const user = userEvent.setup();
    const { onToggle } = setup(["film", "book"], ["film", "book"]);
    const filmToggle = screen.getByRole("button", { name: /Films — shown/ });
    expect(filmToggle).toHaveTextContent("Show");
    await user.click(filmToggle);
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledWith("film");
  });

  it("a disabled (hidden) row reads 'Hide' and reflects aria-pressed", () => {
    setup(["film", "book"], ["film"]);
    const bookToggle = screen.getByRole("button", { name: /Books — hidden/ });
    expect(bookToggle).toHaveTextContent("Hide");
    expect(bookToggle).toHaveAttribute("aria-pressed", "false");
  });

  it("the last remaining enabled category cannot be turned off", async () => {
    const user = userEvent.setup();
    const { onToggle } = setup(["film", "book"], ["film"]);
    const filmToggle = screen.getByRole("button", { name: /Films — shown/ });
    expect(filmToggle).toBeDisabled();
    await user.click(filmToggle);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
