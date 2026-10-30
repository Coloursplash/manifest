import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NoteEditor } from "./NoteEditor";

function setup(medium: "film" | "book" = "book") {
  const onSubmit = vi.fn(() => Promise.resolve());
  render(
    <NoteEditor
      medium={medium}
      mode="add"
      initial={{ date: "2026-03-19", tags: [], body: "" }}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit, user: userEvent.setup() };
}

describe("NoteEditor", () => {
  it("won't submit without a date", async () => {
    const { onSubmit, user } = setup("film");
    await user.clear(screen.getByLabelText("Date"));
    expect(screen.getByRole("button", { name: /Just watched it/ })).toBeDisabled();
    expect(screen.getByText("Pick a date.")).toBeInTheDocument();
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("refuses a stretch that runs backwards instead of silently dropping the start", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText("From"), "2026-04-01");
    expect(screen.getByText("The start is after the end.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Just read it/ })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("normalises a typed tag the way the backend stores it", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByPlaceholderText("+ tag"), "#Book Club{Enter}");
    expect(screen.getByText(/#book-club/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Just read it/ }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tags: ["book-club"] }));
  });
});
