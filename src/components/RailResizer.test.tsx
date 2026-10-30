import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, within } from "@testing-library/react";

import { RailResizer } from "./RailResizer";
import { RAIL_MAX_WIDTH, RAIL_MIN_WIDTH, RAIL_WIDTH } from "../lib/rail";

function setup(width = 200, collapsed = false) {
  const fns = {
    onWidth: vi.fn(),
    onCommit: vi.fn(),
    onCollapsed: vi.fn(),
  };
  // Scope to this render's container — a test may mount two side by side.
  const { container } = render(
    <RailResizer width={width} collapsed={collapsed} {...fns} />,
  );
  return { ...fns, handle: within(container).getByRole("separator") };
}

/** press → move → release, in viewport x. (PointerEvent itself is polyfilled in
 *  src/test/setup.ts — jsdom has none.) */
function drag(handle: HTMLElement, from: number, to: number) {
  fireEvent.pointerDown(handle, { button: 0, clientX: from, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: to, pointerId: 1 });
  fireEvent.pointerUp(handle, { clientX: to, pointerId: 1 });
}

describe("RailResizer", () => {
  it("reports the new width live while dragging and commits it on release", () => {
    const { handle, onWidth, onCommit } = setup(200);
    drag(handle, 500, 560);

    expect(onWidth).toHaveBeenLastCalledWith(260);
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(260);
  });

  it("clamps to the usable range", () => {
    const { handle, onWidth } = setup(200);
    drag(handle, 500, 5000);
    expect(onWidth).toHaveBeenLastCalledWith(RAIL_MAX_WIDTH);
  });

  it("snaps closed when dragged nearly shut, leaving the stored width alone", () => {
    const { handle, onCollapsed, onWidth } = setup(200);
    fireEvent.pointerDown(handle, { button: 0, clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 400, pointerId: 1 }); // → 100px
    expect(onCollapsed).toHaveBeenCalledWith(true);
    expect(onWidth).not.toHaveBeenCalled();
  });

  it("reopens when a collapsed rail is dragged back out", () => {
    const { handle, onCollapsed } = setup(200, true);
    fireEvent.pointerDown(handle, { button: 0, clientX: 500, pointerId: 1 });
    // 62px collapsed + 120 = 182, past the snap threshold
    fireEvent.pointerMove(handle, { clientX: 620, pointerId: 1 });
    expect(onCollapsed).toHaveBeenCalledWith(false);
  });

  it("resizes with the arrow keys and toggles collapse with Enter", () => {
    const { handle, onCommit, onCollapsed } = setup(200);
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onCommit).toHaveBeenCalledWith(208);
    fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true });
    expect(onCommit).toHaveBeenLastCalledWith(200 - 32);

    fireEvent.keyDown(handle, { key: "Enter" });
    expect(onCollapsed).toHaveBeenCalledWith(true);
  });

  it("stops at the minimum, then collapses on the next step left", () => {
    const narrow = setup(RAIL_MIN_WIDTH + 4);
    fireEvent.keyDown(narrow.handle, { key: "ArrowLeft" });
    expect(narrow.onCommit).toHaveBeenCalledWith(RAIL_MIN_WIDTH);
    expect(narrow.onCollapsed).not.toHaveBeenCalled();

    const floored = setup(RAIL_MIN_WIDTH);
    fireEvent.keyDown(floored.handle, { key: "ArrowLeft" });
    expect(floored.onCollapsed).toHaveBeenCalledWith(true);
  });

  it("from collapsed, only ArrowRight does anything", () => {
    const { handle, onCollapsed, onCommit } = setup(200, true);
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(onCollapsed).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onCollapsed).toHaveBeenCalledWith(false);
  });

  it("double-click resets to the default width", () => {
    const { handle, onCommit } = setup(320);
    fireEvent.doubleClick(handle);
    expect(onCommit).toHaveBeenCalledWith(RAIL_WIDTH);
  });

  it("exposes its state to assistive tech", () => {
    const { handle } = setup(210);
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    expect(handle).toHaveAttribute("aria-valuenow", "210");
    expect(handle).toHaveAttribute("aria-valuemin", String(RAIL_MIN_WIDTH));
  });
});
