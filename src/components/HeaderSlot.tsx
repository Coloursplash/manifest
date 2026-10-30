import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Host element ids, rendered by App inside `.omnibar`. */
export const HEADER_SLOT_ID = { left: "header-left", right: "header-right" } as const;

/** Puts a view's own page actions (Back, Trash) on the app header row — the one
 *  with the search pill — instead of stacking a second bar underneath it.
 *
 *  A portal rather than props, because the *markup* belongs to the header but
 *  the *state* belongs to the view: Trash owns a confirm, a busy flag and an
 *  error, and lifting all that into App just to move a button would be worse.
 *
 *  The host is App's element, mounted in the same commit as this component, so
 *  it can't be looked up during render — the layout effect gets it in before
 *  paint, so the buttons don't flash in late. */
export function HeaderSlot({
  side,
  children,
}: {
  side: keyof typeof HEADER_SLOT_ID;
  children: ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setHost(document.getElementById(HEADER_SLOT_ID[side]));
  }, [side]);
  return host ? createPortal(children, host) : null;
}
