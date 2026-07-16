# Flat layout design QA

final result: passed

## Comparison setup

- Source visual truth: `/Users/greg/Downloads/Feedy 4.png` and `/Users/greg/Downloads/Feedy 5.png`
- Normal-state implementation: `/private/tmp/Feedy-flat-layout/output/playwright/folders-after-normal.png` and `/private/tmp/Feedy-flat-layout/output/playwright/folders-after-gutter-fix.png`
- Selection-state implementation: `/private/tmp/Feedy-flat-layout/output/playwright/folders-after-selected-final.png` and `/private/tmp/Feedy-flat-layout/output/playwright/folders-gutter-fix-selected.png`
- Navigation regression evidence: `/private/tmp/Feedy-flat-layout/output/playwright/folder-article-back-preserved.png`
- Shared tab-bar evidence: `/private/tmp/Feedy-flat-layout/output/playwright/tab-bar-card.png` and `/private/tmp/Feedy-flat-layout/output/playwright/tab-bar-flat.png`
- Browser viewport: 390 x 844 CSS pixels; dark theme; Flat layout selected

The normal and selected source states were each inspected together with their corresponding rendered implementation screenshot. The focused comparison covered the folder header/back control, the `Feeds in folder` toolbar, feed-row gutters, selection state, separators, and the article transition below the library.

## Comparison history

- P1: Folder-detail feed rows had an extra nested panel gutter, so the library header and feed content did not align with the rest of the Flat app. Fix: route the section through the shared `panel` styling so Flat mobile padding is normalized. Post-fix evidence: `folders-after-normal.png`.
- P1: Selecting feeds exposed rounded, elevated cards. Fix: mark selectable rows as Flat surfaces, add pressed-state semantics, remove card geometry in Flat, and retain only a subtle selected-row tint plus the checkbox. Post-fix evidence: `folders-after-selected-final.png`.
- P2: Folder back control used the accent-filled variant instead of matching reader view. Fix: use the reader’s default `IconButton` variant with an accent-colored arrow. Post-fix evidence: both final screenshots.
- P1 follow-up: the section gutter was normalized, but the folder header and row components still retained their own horizontal padding, leaving their content farther right than article text. Fix: explicitly set Flat folder-library header and row padding to zero. Post-fix evidence: `folders-after-gutter-fix.png` and `folders-gutter-fix-selected.png`; live DOM measured row left edge x16 and horizontal padding 0px.
- P2: Flat used a separate tab-bar override, making the navigation flat while Card used the glass/card treatment. Fix: remove the Flat-only override so both layouts use the shared rounded glass tab bar.
- P1: opening a folder article marked it read, then the folder query’s default unread filter removed it on return. Fix: folder detail requests `stateFilter=ALL`, preserving read articles in the folder view.

## Required fidelity surfaces

- Fonts and typography: folder title, section label, feed metadata, action labels, and article copy retain the established Flat hierarchy and wrapping.
- Spacing and layout rhythm: folder-library header and rows now start at the same 16px content edge as article text, with flat separators, no rounded selection containers, and no card shadows.
- Colors and visual tokens: accent green remains reserved for the arrow, Move action, unread badges, checkbox, and selected-row tint; the back button border now uses the reader/default token.
- Image quality and asset fidelity: feed avatars and article media remain the existing live assets with unchanged cropping and quality.
- Copy and content: `Feeds in folder`, source count, Move/Cancel, feed metadata, and article content remain intact.

## Runtime checks

- Opened Feeds, entered the A.I. folder, and confirmed the library header/feed rows start at the same x16 edge as article text; measured row/header padding is 0px.
- Entered Select mode and confirmed both rows remain flat; selected one feed and confirmed `aria-pressed="true"`, zero border radius, no box shadow, and only a subtle accent tint.
- Confirmed the back button is visible beside `A.I.` with reader-style default border and emerald arrow.
- Opened `Please Stop Making Me Opt Out of AI` from the A.I. folder, returned with the reader back button, and confirmed the same article remained in the folder after it was marked read.
- Compared Card and Flat tab bars live: both used the same `rounded-[34px]` class and computed `34px` radius, glass background, border, shadow, and `blur(20px) saturate(1.8)` backdrop filter. Flat was restored as the selected layout.
- Confirmed the live isolated stack at `http://192.168.1.163:4002` reports database and Redis healthy, with all four `feedy-flat` services healthy.
- Browser console still reports three pre-existing CSP errors from feed content attempting to load an HTTP `.mp4` as an image; unrelated to this UI change.

No actionable P0, P1, or P2 visual issues remain.
