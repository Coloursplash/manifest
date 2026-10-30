import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { IconCheck } from "./icons";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

/** Where the menu goes: measured off the trigger in viewport coords, so it can
 *  hang below (`top`) or flip above (`bottom`) when the window is short. */
interface Pos {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  width: number;
  maxHeight: number;
}

const GAP = 6;
const EDGE = 12; // keep the menu off the window edge

/** A fully-themed replacement for a native <select>: a chunky trigger plus a
 *  `position: fixed` menu (measured off the trigger, so it never gets clipped
 *  by an overflow ancestor). The open list is ours, so it matches the app —
 *  unlike a native select's OS-drawn popup.
 *
 *  The trigger truncates rather than overflowing, so it can live in a narrow
 *  column, and `compact` reduces it to just its icon for an icons-only rail —
 *  the control keeps its slot instead of vanishing and reshuffling the layout.
 *
 *  Keyboard: focus stays on the trigger and drives the list through
 *  `aria-activedescendant` (↑/↓/Home/End, ⏎ to pick, Esc to close) — a native
 *  <select> is operable from the keyboard and so is this. */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  align = "left",
  ariaLabel,
  leading,
  compactIcon,
  compact = false,
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  /** Which edge of the trigger the menu lines up with. */
  align?: "left" | "right";
  ariaLabel?: string;
  /** Small muted prefix inside the trigger, e.g. "Sort". */
  leading?: ReactNode;
  /** Stands in for the whole trigger when `compact` — there's no room for both
   *  a glyph and a label, so the expanded trigger stays text-only. */
  compactIcon?: ReactNode;
  /** Icon-only trigger (the label moves into the tooltip / accessible name). */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>({ top: 0, width: 0, maxHeight: 0 });
  const [active, setActive] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const current = options.find((o) => o.value === value);
  const optionId = (i: number) => `${uid}-opt-${i}`;

  // With no visible value text the name has to carry it, or the control just
  // reads as "Sort" with no indication of what it's set to.
  const label = ariaLabel
    ? compact && current
      ? `${ariaLabel}: ${current.label}`
      : ariaLabel
    : undefined;
  const tip = current && ariaLabel ? `${ariaLabel}: ${current.label}` : ariaLabel;

  // Reopening always starts from what's currently selected.
  useEffect(() => {
    if (open) setActive(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function place() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    // Flip up only when there's genuinely more room there.
    const up = below < 180 && above > below;
    const side =
      align === "right"
        ? { right: Math.max(EDGE, window.innerWidth - r.right) }
        : { left: Math.max(EDGE, r.left) };
    setPos({
      ...side,
      ...(up ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
      width: r.width,
      maxHeight: Math.max(120, up ? above : below),
    });
  }

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    place();
    setOpen(true);
  }

  function pick(i: number) {
    const o = options[i];
    setOpen(false);
    if (o && o.value !== value) onChange(o.value);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const n = options.length;
    if (!open) {
      // ↑/↓ opens, like a native select — Enter/Space already click the button.
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        toggle();
      }
      return;
    }
    // An open menu owns the keyboard: focus sits on the trigger, which is not a
    // text field, so an unswallowed "g"/"t"/digit would fire an app hotkey and
    // change the view out from under the list.
    e.stopPropagation();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => (i + 1) % n);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => (i - 1 + n) % n);
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(n - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        pick(active);
        break;
      case "Escape":
        e.preventDefault(); // (propagation is already stopped: no app-wide Escape)
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div className="dropdown">
      <button
        ref={btnRef}
        className={`dropdown__btn ${compact ? "dropdown__btn--compact" : ""}`}
        onClick={toggle}
        onKeyDown={onKeyDown}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-label={label}
        title={tip}
      >
        {compact ? (
          <span className="dropdown__icon">{compactIcon}</span>
        ) : (
          <>
            {leading && <span className="dropdown__leading">{leading}</span>}
            <span className="dropdown__value">{current?.label ?? ""}</span>
            <span className={`dropdown__caret ${open ? "is-open" : ""}`}>▾</span>
          </>
        )}
      </button>

      {open && (
        <>
          <div className="dropdown__backdrop" onClick={() => setOpen(false)} />
          <div
            className="dropdown__menu"
            role="listbox"
            style={{
              top: pos.top,
              bottom: pos.bottom,
              left: pos.left,
              right: pos.right,
              minWidth: pos.width,
              maxHeight: pos.maxHeight || undefined,
            }}
          >
            {options.map((o, i) => (
              <button
                key={o.value}
                id={optionId(i)}
                role="option"
                aria-selected={o.value === value}
                className={
                  "dropdown__item" +
                  (o.value === value ? " is-selected" : "") +
                  (i === active ? " is-active" : "")
                }
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(i)}
              >
                <span className="dropdown__check">
                  {o.value === value ? <IconCheck size={13} /> : null}
                </span>
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
