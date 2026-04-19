# Low-Risk Polish Cleanup

## Goal
Improve everyday usability with small, UI-safe polish changes that do not alter the app’s core flows.

## Scope
This pass covers four low-risk improvements:

1. Remove the prefilled login username so the form does not default to `admin`.
2. Make tapping the active bottom tab scroll the current screen back to the top.
3. Add lightweight search-term highlighting in result lists.
4. Add optional haptic feedback for supported client interactions.

It does not cover reader font-size controls, gesture overhauls, empty-state redesign, screens refactors, or test expansion beyond the affected surfaces.

## Current Problems

- [`src/app/login/page.tsx`](/Users/greg/Projects/Feedy/src/app/login/page.tsx) pre-fills the username field with `admin`.
- The bottom tab bar in [`src/components/app-shell.tsx`](/Users/greg/Projects/Feedy/src/components/app-shell.tsx) always navigates; it does not re-tap-scroll the active tab to the top.
- Search results in the timeline and saved views do not visually emphasize matched terms.
- There is no haptic feedback for supported taps or state changes.

## Proposed Design

### 1. Login form without a default username

Remove the `defaultValue="admin"` from the login form so the field starts empty.

The login screen should still explain which credentials to use, but the field itself should not prefill the username.

### 2. Active-tab re-tap scroll to top

Update the bottom tab navigation so tapping the currently active tab scrolls the current screen to the top instead of re-navigating.

The behavior should match the existing mobile shell style:

- if the tapped tab is already active, scroll to top
- if it is a different tab, continue navigating normally

This should not change route state or reset any filters.

### 3. Search highlighting

Add a small reusable text-highlighting helper for search matches.

Use it on the list surfaces that already support searching, especially:

- timeline item titles and summaries
- saved-item lists

The helper should:

- preserve the existing typography and layout
- only wrap matching substrings
- safely handle empty queries and special characters

The goal is subtle emphasis, not a new visual language.

### 4. Haptic feedback

Add optional `navigator.vibrate()` calls for client-supported interactions such as:

- successful tab re-taps
- actionable taps like bookmark toggles or pull-to-refresh completion, if the platform supports vibration

The implementation must be capability-checked so unsupported browsers simply ignore it.

## Architecture

The login change is a pure form tweak.

The tab scroll behavior belongs in the shared mobile shell so it works consistently across all `/app/*` tabs without per-screen duplication.

Search highlighting should live in a focused helper component or utility so the text emphasis logic does not spread through the large screen file.

Haptics should live behind a tiny helper function so the app can call it opportunistically without platform-specific branching in every component.

## Data Flow

### Login

1. User opens the login page.
2. The username field renders empty.
3. The user enters credentials explicitly.

### Tab re-tap

1. User taps the active bottom tab.
2. The shell detects that the tab is already active.
3. The page scrolls to the top without changing routes.

### Search highlighting

1. User types a search query.
2. The result renderer receives the query string.
3. Matching substrings are wrapped in a subtle highlight.

### Haptics

1. User performs a supported interaction.
2. The helper checks whether vibration is available.
3. If supported, the device vibrates briefly; otherwise nothing happens.

## Error Handling

- The login field should continue to submit normally even when empty.
- Active-tab scroll-to-top should fail silently if the browser rejects the scroll request.
- Search highlighting should fall back to plain text if the query is empty or not representable safely.
- Haptics must never throw or block the interaction if `navigator.vibrate()` is unavailable.

## Testing

Add focused checks for:

- the login page no longer rendering a default username
- active-tab re-tap behavior in the shared shell
- the search highlight helper wrapping matching text and leaving unmatched text alone
- the haptic helper being a no-op when vibration is unsupported

The tests should remain small and component-local so they do not require browser automation.

## Non-Goals

- No reader font-size controls yet
- No swipe gesture redesign
- No empty-state illustration pass
- No manifest orientation change
- No global screens refactor
- No larger test coverage campaign in this pass

## Success Criteria

- The login page no longer leaks a default username into the form.
- Retapping the active bottom tab scrolls the current view back to the top.
- Search results visibly emphasize the matching terms without disturbing layout.
- Supported devices get a subtle haptic cue where appropriate, and unsupported browsers behave exactly as before.
