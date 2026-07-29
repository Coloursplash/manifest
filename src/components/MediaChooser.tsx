import { useEffect, useRef, useState } from "react";

import { IconGrip } from "./icons";
import { MEDIUM_LABEL, type Medium } from "../lib/types";

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/** Nearest scrollable ancestor, or null (→ fall back to the document). */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if (/(auto|scroll|overlay)/.test(oy) && node.scrollHeight > node.clientHeight)
      return node;
    node = node.parentElement;
  }
  return null;
}

/** A draggable list of every media category with a show/hide toggle each. Grab
 *  a row anywhere (except the toggle) and drag to reorder — the held row follows
 *  the cursor and its neighbours slide aside; the order is committed on release.
 *  Shared by Settings and the first-run wizard.
 *
 *  We don't reshuffle the array mid-drag (that resets the drag baseline and makes
 *  it "break"); the held row gets a live translate and the others a slot-sized
 *  shift, then we splice once on pointer-up. Pointer events, not HTML5 DnD, since
 *  Tauri's webview swallows native drag events. When the cursor nears an edge of
 *  the scroll container we auto-scroll it, folding the scroll offset into the
 *  drag math so the row stays put under the cursor. ≥1 category stays enabled. */
export function MediaChooser({
  order,
  enabled,
  onReorder,
  onToggle,
}: {
  order: Medium[];
  enabled: Medium[];
  onReorder: (order: Medium[]) => void;
  onToggle: (m: Medium) => void;
}) {
  const [items, setItems] = useState<Medium[]>(order);
  const [drag, setDrag] = useState<{ index: number; pointerY: number } | null>(
    null,
  );
  const startY = useRef(0);
  const startScroll = useRef(0);
  const stride = useRef(48); // row height + gap; measured on drag start
  const scroller = useRef<HTMLElement | null>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const raf = useRef(0);
  const active = useRef(false);
  const pointerY = useRef(0);

  // Adopt external changes (toggles, another surface) only when idle.
  useEffect(() => {
    if (!drag) setItems(order);
  }, [order, drag]);

  // While dragging, kill text selection app-wide — the pointer can range over
  // other text (elsewhere in Settings) mid-drag.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    document.body.classList.add("is-reordering");
    return () => document.body.classList.remove("is-reordering");
  }, [dragging]);

  // Cancel any pending auto-scroll frame if we unmount mid-drag.
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const scrollTopOf = () =>
    (scroller.current ?? document.scrollingElement)?.scrollTop ?? 0;

  // Auto-scroll the container while the cursor sits in its top/bottom margin.
  function autoScroll() {
    if (!active.current) return;
    const el = scroller.current;
    const rect = el
      ? el.getBoundingClientRect()
      : ({ top: 0, bottom: window.innerHeight } as DOMRect);
    const y = pointerY.current;
    const EDGE = 56;
    const MAX = 16;
    let v = 0;
    if (y > rect.bottom - EDGE) v = Math.min(MAX, (y - (rect.bottom - EDGE)) / 3);
    else if (y < rect.top + EDGE) v = -Math.min(MAX, (rect.top + EDGE - y) / 3);
    if (v !== 0) {
      const tgt = el ?? document.scrollingElement;
      if (tgt) {
        const before = tgt.scrollTop;
        tgt.scrollTop += v;
        // Re-render so the held row tracks the new scroll offset.
        if (tgt.scrollTop !== before) setDrag((d) => (d ? { ...d } : d));
      }
    }
    raf.current = requestAnimationFrame(autoScroll);
  }

  function onDown(e: React.PointerEvent<HTMLLIElement>, index: number) {
    if (e.button !== 0) return;
    e.preventDefault(); // don't start a text selection on the row
    e.currentTarget.setPointerCapture(e.pointerId);
    const rows = rowRefs.current;
    const a = rows[0]?.getBoundingClientRect();
    const b = rows[1]?.getBoundingClientRect();
    if (a && b) stride.current = b.top - a.top;
    else if (rows[index]) stride.current = rows[index]!.offsetHeight + 6;
    scroller.current = findScrollParent(e.currentTarget);
    startY.current = e.clientY;
    startScroll.current = scrollTopOf();
    pointerY.current = e.clientY;
    active.current = true;
    setDrag({ index, pointerY: e.clientY });
    raf.current = requestAnimationFrame(autoScroll);
  }

  function onMove(e: React.PointerEvent<HTMLLIElement>) {
    if (!drag) return;
    pointerY.current = e.clientY;
    setDrag({ index: drag.index, pointerY: e.clientY });
  }

  function onUp(e: React.PointerEvent<HTMLLIElement>) {
    if (!drag) return;
    active.current = false;
    cancelAnimationFrame(raf.current);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const to = targetIndex(drag.index, drag.pointerY);
    if (to !== drag.index) {
      const next = [...items];
      const [m] = next.splice(drag.index, 1);
      next.splice(to, 0, m);
      setItems(next); // optimistic — avoids a flash before the prop round-trips
      onReorder(next);
    }
    setDrag(null);
  }

  /** Displacement of the held row in list-content space, folding in how far the
   *  container has scrolled since the drag began, clamped to the list bounds. */
  function effDy(index: number, py: number): number {
    const raw = py - startY.current + (scrollTopOf() - startScroll.current);
    return clamp(
      raw,
      -index * stride.current,
      (items.length - 1 - index) * stride.current,
    );
  }
  function targetIndex(index: number, py: number): number {
    return clamp(
      index + Math.round(effDy(index, py) / stride.current),
      0,
      items.length - 1,
    );
  }

  const target = drag ? targetIndex(drag.index, drag.pointerY) : 0;

  /** How far a non-held row shifts to open a gap for the held one. */
  function shiftFor(j: number): number {
    if (!drag || j === drag.index) return 0;
    if (drag.index < target && j > drag.index && j <= target) return -stride.current;
    if (drag.index > target && j >= target && j < drag.index) return stride.current;
    return 0;
  }

  return (
    <ul className="mediachooser">
      {items.map((m, i) => {
        const on = enabled.includes(m);
        const last = on && enabled.length === 1;
        const held = drag?.index === i;
        const style: React.CSSProperties = held
          ? {
              transform: `translateY(${effDy(i, drag!.pointerY)}px) scale(1.02)`,
              zIndex: 5,
            }
          : {
              transform: `translateY(${shiftFor(i)}px)`,
              transition: "transform 0.16s ease",
            };
        return (
          <li
            key={m}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            className={
              "mediarow" + (on ? "" : " is-off") + (held ? " is-held" : "")
            }
            style={style}
            onPointerDown={(e) => onDown(e, i)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => {
              active.current = false;
              cancelAnimationFrame(raf.current);
              setDrag(null);
            }}
          >
            <span className="mediarow__grip" aria-hidden="true">
              <IconGrip size={16} />
            </span>
            <span className="mediarow__label">{MEDIUM_LABEL[m]}</span>
            <button
              className={`mediarow__toggle ${on ? "is-on" : ""}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => !last && onToggle(m)}
              disabled={last}
              title={
                last
                  ? "Keep at least one category enabled"
                  : on
                    ? "Shown in the rail — click to hide"
                    : "Hidden — click to show"
              }
              aria-pressed={on}
              aria-label={`${MEDIUM_LABEL[m]} — ${on ? "shown" : "hidden"}`}
            >
              {on ? "Show" : "Hide"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
