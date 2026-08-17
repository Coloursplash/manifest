import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RatingCircles } from "./Rating";

// A mouse aims at half a circle; a keyboard can't, so pressing a circle takes
// its whole value and ←/→ nudge by a half point.
describe("RatingCircles keyboard", () => {
  it("gives the whole value when a circle is pressed, not the half", async () => {
    const user = userEvent.setup();
    const onSet = vi.fn();
    render(<RatingCircles value={null} onSet={onSet} />);

    screen.getByRole("button", { name: "Rate 6 out of 10" }).focus();
    await user.keyboard("{Enter}");
    expect(onSet).toHaveBeenCalledWith(6);
  });

  it("nudges a half point at a time with the arrows", async () => {
    const user = userEvent.setup();
    const onSet = vi.fn();
    render(<RatingCircles value={7} onSet={onSet} />);

    screen.getByRole("button", { name: "Rate 6 out of 10" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onSet).toHaveBeenLastCalledWith(8);
    await user.keyboard("{ArrowLeft}");
    expect(onSet).toHaveBeenLastCalledWith(6);
  });

  it("clamps at the top and clears off the bottom", async () => {
    const user = userEvent.setup();
    const onSet = vi.fn();
    const { rerender } = render(<RatingCircles value={10} onSet={onSet} />);

    screen.getByRole("button", { name: "Rate 10 out of 10" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onSet).toHaveBeenLastCalledWith(10);

    // Stepping down off 1 clears rather than writing a 0 score.
    rerender(<RatingCircles value={1} onSet={onSet} />);
    await user.keyboard("{ArrowLeft}");
    expect(onSet).toHaveBeenLastCalledWith(null);

    await user.keyboard("{Backspace}");
    expect(onSet).toHaveBeenLastCalledWith(null);
  });
});
