import { useRef, useState, type ReactNode } from "react";

import { IconCheck } from "./icons";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

/** A fully-themed replacement for a native <select>: a chunky trigger plus a
 *  `position: fixed` menu (measured off the trigger, so it never gets clipped
 *  by an overflow ancestor). The open list is ours, so it matches the app —
 *  unlike a native select's OS-drawn popup. */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  align = "left",
  ariaLabel,
  leading,
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  /** Which edge of the trigger the menu lines up with. */
  align?: "left" | "right";
  ariaLabel?: string;
  /** Small muted prefix inside the trigger, e.g. "Sort". */
  leading?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left?: number;
    right?: number;
    width: number;
  }>({ top: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      setPos(
        align === "right"
          ? { top: r.bottom + 6, right: window.innerWidth - r.right, width: r.width }
          : { top: r.bottom + 6, left: r.left, width: r.width },
      );
    }
    setOpen(true);
  }

  return (
    <div className="dropdown">
      <button
        ref={btnRef}
        className="dropdown__btn"
        onClick={toggle}
        aria-expanded={open}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        {leading && <span className="dropdown__leading">{leading}</span>}
        <span className="dropdown__value">{current?.label ?? ""}</span>
        <span className={`dropdown__caret ${open ? "is-open" : ""}`}>▾</span>
      </button>

      {open && (
        <>
          <div className="dropdown__backdrop" onClick={() => setOpen(false)} />
          <div
            className="dropdown__menu"
            style={{
              top: pos.top,
              left: pos.left,
              right: pos.right,
              minWidth: pos.width,
            }}
          >
            {options.map((o) => (
              <button
                key={o.value}
                className={`dropdown__item ${o.value === value ? "is-selected" : ""}`}
                onClick={() => {
                  setOpen(false);
                  onChange(o.value);
                }}
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
