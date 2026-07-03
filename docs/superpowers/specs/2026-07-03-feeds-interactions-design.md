# Feeds Interaction Improvements

## Goal

Make the Feeds screen visually consistent with the Latest toolbar, simplify feed editing around naming and folder placement, add a quick pause workflow, and remove the initial layout jitter when opening New Folder or Select.

## Feeds Toolbar

- Keep the existing Select, New Folder, and Add Feed control shapes and accessible labels.
- Use the existing active toolbar treatment when a control's surface is open: green icon/text, a green-tinted border, and a subtle green-tinted background.
- Do not use solid green fills for selected or active toolbar controls.
- Open New Folder in a bottom sheet rather than inserting the form above the feed list.
- Keep the feed list mounted and stationary while toolbar sheets open.

## Selection Mode

- Preserve the existing bulk-selection and bulk-move behavior.
- Keep the page header and feed-row geometry stable when selection mode opens.
- Avoid replacing or rebuilding more of the feed tree than is required to expose selection controls.
- Selection controls follow the same tint-only active styling as the Latest toolbar.

## Swipe Hint and Feed Actions

- Remove the “Swipe a row left for edit and delete actions” banner and its local-storage state.
- Add Pause or Resume to each feed row's swipe-left actions alongside Edit and Delete.
- Pause and resume update the existing `excludeFromTimeline` feed field; no schema migration is required.
- Invalidate navigation and timeline queries after the mutation so the UI updates immediately.
- A paused feed remains in its existing folder and remains directly browsable from Feeds.
- A paused feed does not appear in Latest.
- Display a compact pause icon and accessible paused label on paused feed rows.

## Feed Editing

- The quick edit sheet prioritizes the editable label and folder picker.
- Save is the visually primary action.
- Pin and reordering controls remain available as secondary actions.
- Pause is primarily available through the row swipe action.
- Remove mute-rule controls and mute-rule form state from the quick edit sheet.
- Remove mute-rule controls and mute-rule form state from the dedicated feed settings page.
- Retain a compact Pause or Resume control on the dedicated feed settings page so the state is manageable without swipe gestures.
- Existing stored mute-rule data is left intact; this change removes its editing UI rather than deleting persisted data.

## Motion and Performance

- New Folder uses a fixed overlay sheet so opening it does not move the search panel or feed list.
- Selection mode reuses stable list structure and dimensions to avoid the initial visual jump.
- Avoid expensive synchronous work in click handlers. Existing derived collections remain memoized.
- Respect the existing reduced-motion behavior and avoid adding decorative animation.

## Accessibility and Failure Handling

- Pause/Resume actions expose explicit accessible names and pressed/state information where applicable.
- The paused row indicator includes screen-reader text rather than relying on icon or color alone.
- Mutations use the existing API and query invalidation patterns.
- A failed pause, resume, save, or move operation leaves the sheet/action available for retry and uses the existing mutation error presentation pattern where one exists.

## Validation

- Add focused tests for pause/resume request payloads and paused-row rendering.
- Add assertions that the swipe hint and mute-rule controls are absent.
- Add coverage for tint-only active toolbar styling and stable New Folder/selection surfaces where practical.
- Run `npm run lint`.
- Run `npm run test`.
- Run `npm run build`.
- Validate Docker Compose configuration and verify the application containers start and report healthy.

## Scope

This change does not add an auto-generated Paused folder, delete stored mute rules, alter subscriptions, introduce dependencies, or change the database schema.
