# Accessibility and Robustness Cleanup

## Goal
Improve accessibility and app resilience without changing the normal UI flow.

## Scope
This pass covers two low-risk improvements:

1. Re-enable browser zoom by removing the viewport lock that blocks user scaling.
2. Add a global app error boundary so unhandled React errors fail gracefully instead of crashing the whole UI.

It does not change navigation, item cards, reader layout, or any timeline interaction behavior.

## Current Problems

- [`src/app/layout.tsx`](/Users/greg/Projects/Feedy/src/app/layout.tsx) sets `userScalable: false`, which blocks pinch zoom and browser zoom accessibility features.
- There is no `error.tsx` or `global-error.tsx` under [`src/app`](/Users/greg/Projects/Feedy/src/app), so an unhandled rendering error has no friendly app-level recovery surface.

## Proposed Design

### 1. Re-enable zoom

Update the root viewport config in [`src/app/layout.tsx`](/Users/greg/Projects/Feedy/src/app/layout.tsx) so users can zoom the interface normally.

The change should be limited to the viewport metadata. It should not alter layout sizing, typography, or any screen component logic.

### 2. Add a global error boundary

Create a root-level global error boundary for the App Router using the project’s existing visual language.

The fallback should:

- preserve the existing Feedy branding and dark UI style
- explain that something went wrong in plain language
- provide a retry action that remounts the app route
- avoid exposing stack traces or implementation details to users

The fallback should be intentionally minimal so it does not interfere with normal navigation or route rendering.

## Architecture

The browser zoom change lives entirely in the root viewport export, so it only affects how mobile browsers interpret the page scale and pinch gestures.

The global error boundary lives at the app root so it can catch unhandled rendering failures anywhere in the shell or route tree. It should be isolated from the rest of the UI, with a tiny fallback component that is easy to reason about and does not depend on the rest of the app state.

## Data Flow

### Normal rendering

1. Next.js loads the root layout.
2. The viewport metadata allows user scaling.
3. The app renders exactly as it does today.

### Error rendering

1. A route or component throws during rendering.
2. The global error boundary catches the failure.
3. The fallback screen renders a safe recovery state with a retry action.
4. When the user retries, the route is reloaded and the app attempts to render again.

## Error Handling

- The error boundary should be the only visible change when a fatal rendering error occurs.
- The fallback must be safe to render even if the error originated in a deeply nested route.
- The retry action should be the primary recovery path.
- Normal, non-error UI should remain unchanged.

## Testing

Add focused checks for:

- the viewport export allowing zoom again
- the global error boundary file existing at the app root
- the error fallback rendering a retry action and a short message

The tests should verify the public behavior of the files, not internal Next.js mechanics.

## Non-Goals

- No timeline, reader, or feed interaction redesign
- No keyboard shortcut system
- No bulk action UI
- No push notification or badge implementation
- No distributed semaphore redesign

## Success Criteria

- Users can zoom the interface again.
- Unhandled React errors fall back to a safe recovery screen instead of a blank crash.
- The normal UI remains visually and behaviorally unchanged outside of error states.
