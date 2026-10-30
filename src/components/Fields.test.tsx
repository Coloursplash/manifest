import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NumberField } from "./Fields";

describe("NumberField", () => {
  it("writes nothing when you tab through without changing it", async () => {
    const onCommit = vi.fn();
    render(<NumberField label="Season" value={2} onCommit={onCommit} />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Season"));
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits a change once, on ⏎ or blur", async () => {
    const onCommit = vi.fn();
    render(<NumberField label="Season" value={2} onCommit={onCommit} />);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Season"));
    await user.type(screen.getByLabelText("Season"), "3{Enter}");
    await user.tab();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(3);
  });

  it("clears to null when emptied", async () => {
    const onCommit = vi.fn();
    render(<NumberField label="Season" value={2} onCommit={onCommit} />);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Season"));
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith(null);
  });
});
