// Small pure pieces of the add flow's keyboard handling and labels.

import { statusLabel, type Medium, type Status } from "../../lib/types";

/** A key the OmniBox pill offers the add panel; true means "consumed". */
export type AddKeyHandler = (e: React.KeyboardEvent) => boolean;

/** Button text for a quick status. "Plan" reads better than "Plan to watch"
 *  on a small cover overlay. */
export const quickLabel = (m: Medium, s: Status) => (s === "want" ? "Plan" : statusLabel(m, s));

/** Which status an Enter on a hit files under. Plain ⏎ is the headline action
 *  (log it); the modifiers reach the other two quick statuses. */
export function statusForEnter(e: { shiftKey: boolean; altKey: boolean }): Status {
  if (e.shiftKey) return "want";
  if (e.altKey) return "active";
  return "done";
}

/** How many cards fit on a row, read off the laid-out DOM — the grid is
 *  `auto-fill`, so the column count is whatever the width allows. Cards on the
 *  first row all share its `offsetTop`. (jsdom has no layout, so this is
 *  unit-tested directly rather than through the rendered app.) */
export function columnsOf(cards: Pick<HTMLElement, "offsetTop">[]): number {
  if (cards.length < 2) return 1;
  const top = cards[0].offsetTop;
  let n = 1;
  while (n < cards.length && cards[n].offsetTop === top) n++;
  return n;
}
