# Timeline New Articles Pill

## Goal

Replace the large timeline refresh dialog with a compact, temporary notification that scrolls to the correct boundary of newly arrived articles without unexpected timeline movement.

## Presentation

- Display a compact floating pill below the fixed Timeline toolbar.
- Use the label `↑ 1 new article` or `↑ N new articles`.
- Use the existing surface, border, shadow, and green-tinted text language.
- Do not show explanatory body text, a filled primary button, or a separate Dismiss button.
- Keep the pill above timeline content without changing document flow.

## Jump Target

- Capture timeline item IDs immediately before refresh.
- After refreshed data arrives, identify the contiguous new prefix.
- Use the oldest item in that new prefix as the jump target. This is the boundary directly above the timeline content that existed before refresh.
- Store the exact target ID with the notification count.
- On tap, query only for the stored target row.
- If the stored row is not mounted, do nothing and dismiss the pill. Do not fall back to the top, another article, or a calculated pixel offset.
- When the row exists, smooth-scroll it into start alignment and dismiss the pill.

## Lifetime

- Auto-dismiss the pill 5 seconds after it appears.
- Clear and restart the timer when a later refresh replaces the current notification.
- Clear the timer when the user taps the pill or when the component unmounts.
- The notification must not take focus or interrupt scrolling.

## Accessibility

- Render the pill as a button with an explicit accessible label containing the new article count.
- Announce its appearance through a polite live region.
- Respect reduced-motion preferences by using an immediate scroll instead of smooth scrolling when requested.

## Testing

- Verify singular and plural labels.
- Verify the pill auto-dismisses after 5 seconds and cleans up its timer.
- Verify replacement notifications restart the timer.
- Verify taps scroll only to the captured boundary ID.
- Verify a missing target does not cause fallback scrolling.
- Run lint, the full test suite, and the production build.
