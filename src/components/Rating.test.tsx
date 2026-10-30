import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RatingCircles } from "./Rating";

// Every score is its own button — the left half of a circle scores odd, the
// right half even — so this is testable without a layout engine, which the old
// getBoundingClientRect version wasn't.
describe("RatingCircles mouse", () => {
  it("scores odd from a circle's left half and even from its right", async () => {
    const user = userEvent.setup();
    const onSet = vi.fn();
    render(<RatingCircles value={null} onSet={onSet} />);

    await user.click(screen.getByRole("button", { name: "Rate 7 out of 10" }));
    expect(onSet).toHaveBeenLastCalledWith(7);

    await user.click(screen.getByRole("button", { name: "Rate 8 out of 10" }));
    expect(onSet).toHaveBeenLastCalledWith(8);
  });

  it("offers all ten scores", () => {
    render(<RatingCircles value={null} onSet={vi.fn()} />);
    for (let n = 1; n <= 10; n++) {
      expect(screen.getByRole("button", { name: `Rate ${n} out of 10` })).toBeInTheDocument();
    }
  });

  it("previews the hovered score and reverts on leave", async () => {
    const user = userEvent.setup();
    render(<RatingCircles value={4} onSet={vi.fn()} />);

    await user.hover(screen.getByRole("button", { name: "Rate 9 out of 10" }));
    expect(screen.getByText("9")).toBeInTheDocument();

    await user.unhover(screen.getByRole("button", { name: "Rate 9 out of 10" }));
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("the ✕ clears, and only shows once there's a score", () => {
    const onSet = vi.fn();
    const { rerender } = render(<RatingCircles value={null} onSet={onSet} />);
    expect(screen.queryByRole("button", { name: "Clear rating" })).not.toBeInTheDocument();

    rerender(<RatingCircles value={5} onSet={onSet} />);
    screen.getByRole("button", { name: "Clear rating" }).click();
    expect(onSet).toHaveBeenCalledWith(null);
  });
});

describe("RatingCircles keyboard", () => {
  it("is one tab stop, landing on the current score", async () => {
    const user = userEvent.setup();
    render(<RatingCircles value={7} onSet={vi.fn()} />);

    await user.tab();
    expect(screen.getByRole("button", { name: "Rate 7 out of 10" })).toHaveFocus();
    // …and not eleven: the next tab leaves the widget (the ✕ is next)
    await user.tab();
    expect(screen.getByRole("button", { name: "Clear rating" })).toHaveFocus();
  });

  it("sets exactly the score that's pressed, odd ones included", async () => {
    const user = userEvent.setup();
    const onSet = vi.fn();
    render(<RatingCircles value={null} onSet={onSet} />);

    screen.getByRole("button", { name: "Rate 5 out of 10" }).focus();
    await user.keyboard("{Enter}");
    expect(onSet).toHaveBeenCalledWith(5);
  });

  it("nudges a point at a time with the arrows, taking focus along", async () => {
    const user = userEvent.setup();
    const onSet = vi.fn();
    render(<RatingCircles value={7} onSet={onSet} />);

    screen.getByRole("button", { name: "Rate 7 out of 10" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onSet).toHaveBeenLastCalledWith(8);
    expect(screen.getByRole("button", { name: "Rate 8 out of 10" })).toHaveFocus();

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
