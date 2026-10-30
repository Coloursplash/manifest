import { useRef, useState } from "react";

import {
  RAIL_COLLAPSED_WIDTH,
  RAIL_MAX_WIDTH,
  RAIL_MIN_WIDTH,
  RAIL_SNAP,
  RAIL_WIDTH,
  clampRailWidth,
} from "../lib/rail";

/** The grab-strip on the rail's right edge. Drag to set the sidebar width; drag
 *  it nearly shut and the rail snaps to icons-only (drag back out to reopen), so
 *  the collapse button and the handle agree on one state rather than fighting.
 *
 *  Pointer events, not HTML5 DnD — Tauri's webview swallows native drag events
 *  (same reason MediaChooser uses them). The width is only *persisted* on
 *  release; while dragging we report it live so the layout tracks the cursor
 *  without hammering localStorage every frame.
 *
 *  It's a real focusable separator too: ←/→ resize by a step (⇧ = coarse),
 *  Enter/Space toggles collapsed, double-click resets to the default width. */
export function RailResizer({
  width,
  collapsed,
  onWidth,
  onCommit,
  onCollapsed,
}: {
  width: number;
  collapsed: boolean;
  /** Live during a drag — update state, don't persist. */
  onWidth: (px: number) => void;
  /** End of an interaction — persist this width. */
  onCommit: (px: number) => void;
  onCollapsed: (collapsed: boolean) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startW = useRef(0);
  // Last width we reported, so pointerup can commit it without waiting for the
  // prop to round-trip through App.
  const live = useRef(width);

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection, no focus flicker
    e.currentTarget.setPointerCapture?.(e.pointerId);
    startX.current = e.clientX;
    startW.current = collapsed ? RAIL_COLLAPSED_WIDTH : width;
    live.current = width;
    setDragging(true);
    document.body.classList.add("is-resizing");
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const next = startW.current + (e.clientX - startX.current);
    if (next < RAIL_SNAP) {
      // Shut. Keep the stored width untouched so reopening restores it.
      if (!collapsed) onCollapsed(true);
      return;
    }
    if (collapsed) onCollapsed(false);
    live.current = clampRailWidth(next);
    onWidth(live.current);
  }

  function end(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragging(false);
    document.body.classList.remove("is-resizing");
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* already released */
    }
    onCommit(live.current);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 32 : 8;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onCollapsed(!collapsed);
      return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    if (collapsed) {
      // From shut, only "open" is meaningful.
      if (dir > 0) onCollapsed(false);
      return;
    }
    const next = width + dir * step;
    // Stepping left off the minimum collapses — the drag's pull-past-it gesture
    // has no keyboard equivalent, so the floor itself is the trigger.
    if (next < RAIL_MIN_WIDTH) {
      if (width <= RAIL_MIN_WIDTH) onCollapsed(true);
      else onCommit(RAIL_MIN_WIDTH);
      return;
    }
    onCommit(clampRailWidth(next));
  }

  return (
    <div
      className={`rail__resize ${dragging ? "is-active" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={collapsed ? RAIL_COLLAPSED_WIDTH : width}
      aria-valuemin={RAIL_MIN_WIDTH}
      aria-valuemax={RAIL_MAX_WIDTH}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
      onDoubleClick={() => {
        if (collapsed) onCollapsed(false);
        live.current = RAIL_WIDTH;
        onCommit(RAIL_WIDTH);
      }}
    />
  );
}
