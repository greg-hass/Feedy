import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const librarySource = readFileSync(
	new URL("../components/feed-library-components.tsx", import.meta.url),
	"utf8",
);
const formsSource = readFileSync(
	new URL("../components/forms.tsx", import.meta.url),
	"utf8",
);
const feedSettingsSource = readFileSync(
	new URL("../app/app/feeds/[feedId]/page.tsx", import.meta.url),
	"utf8",
);
const feedsScreenSource = readFileSync(
	new URL("../components/feeds-screen.tsx", import.meta.url),
	"utf8",
);
const folderDetailSource = readFileSync(
	new URL("../app/app/folders/[folderId]/page.tsx", import.meta.url),
	"utf8",
);
const feedAvatarSource = readFileSync(
	new URL("../components/feed-avatar.tsx", import.meta.url),
	"utf8",
);
const feedsScreenScrollSource = readFileSync(
	new URL("../components/use-list-scroll-restoration.ts", import.meta.url),
	"utf8",
);

describe("Feeds UI contracts", () => {
	it("offers pause or resume from feed swipe actions", () => {
		assert.match(librarySource, /getFeedPauseActionLabel/);
		assert.match(librarySource, /getFeedPausePatch/);
		assert.match(librarySource, /aria-label=\{`\$\{pauseLabel\}/);
	});

	it("reveals the full four-action feed toolbar", () => {
		assert.match(librarySource, /<SwipeRow\s+revealWidth=\{260\}/);
		assert.match(
			librarySource,
			/transform: open \? `translateX\(-\$\{revealWidth\}px\)` : undefined/,
		);
		// A dedicated move-to-folder action keeps folder changes out of the
		// edit-feed sheet: swipe → folder icon → pick folder → done.
		assert.match(
			librarySource,
			/Move \$\{feed\.label \|\| feed\.title\} to a folder/,
		);
	});

	it("keeps bulk-selection actions in the fixed bottom bar, not the header", () => {
		// The Move/Cancel controls live in a fixed bar above the nav so they
		// stay visible while scrolling and never fight the title row for space.
		assert.match(feedsScreenSource, /data-flat-selection-bar="true"/);
		assert.match(feedsScreenSource, /\{selectedCount\} selected/);
		assert.doesNotMatch(feedsScreenSource, /Move \{selectedCount/);
	});

	it("marks paused feeds without relying on color alone", () => {
		assert.match(librarySource, /aria-label="Paused"/);
		assert.match(librarySource, />Paused</);
	});

	it("removes mute-rule editing from both feed edit surfaces", () => {
		assert.doesNotMatch(formsSource, /Mute rules/);
		assert.doesNotMatch(formsSource, /splitMutePatterns/);
		assert.doesNotMatch(feedSettingsSource, /Mute rules/);
		assert.doesNotMatch(feedSettingsSource, /splitMutePatterns/);
	});

	it("keeps pause management on dedicated feed settings", () => {
		assert.match(feedSettingsSource, /getFeedPauseActionLabel/);
		assert.match(feedSettingsSource, /getFeedPausePatch/);
	});

	it("removes the obsolete swipe hint", () => {
		assert.doesNotMatch(feedsScreenSource, /Swipe a row left/);
		assert.doesNotMatch(feedsScreenSource, /feedy-swipe-hint-dismissed/);
	});

	it("uses tint-only active toolbar controls", () => {
		assert.match(
			feedsScreenSource,
			/variant=\{showAddFolder \? "active" : "default"\}/,
		);
		assert.match(
			feedsScreenSource,
			/variant=\{showAddFeed \? "active" : "default"\}/,
		);
		assert.doesNotMatch(feedsScreenSource, /variant="accent"/);
	});

	it("uses the persisted discovery icon before the cached fallback", () => {
		assert.match(feedAvatarSource, /iconHintUrl\?: string \| null/);
		assert.match(feedAvatarSource, /iconHintUrl && failedSrc !== iconHintUrl/);
		assert.match(feedAvatarSource, /\?v=4/);
	});

	it("restores feed and folder list position after returning", () => {
		assert.match(feedsScreenScrollSource, /sessionStorage/);
		assert.match(feedsScreenScrollSource, /window\.scrollTo\(\{ top: scrollY/);
		assert.match(feedsScreenSource, /storageKey: "feedy-feeds-scroll"/);
		assert.match(folderDetailSource, /storageKey: `feedy-folder-scroll:/);
		assert.match(feedsScreenScrollSource, /frozenStorageKeys\.has\(storageKey\)/);
		assert.match(
			librarySource,
			/freezeListScrollPosition\("feedy-feeds-scroll"\)/,
		);
	});

	it("opens New Folder in a fixed sheet instead of inline flow", () => {
		assert.match(formsSource, /export function AddFolderSheet/);
		assert.match(formsSource, /<Sheet[^>]*title="New folder"/);
		assert.match(feedsScreenSource, /<AddFolderSheet/);
		assert.doesNotMatch(
			feedsScreenSource,
			/<div className="mb-3">\s*<AddFolderForm/,
		);
	});

	it("submits create forms through onSubmit only", () => {
		assert.match(formsSource, /<Button\s+type="submit"/);
		assert.doesNotMatch(
			formsSource,
			/<Button onClick=\{\(\) => mutation\.mutate\(\)\}/,
		);
	});

	it("announces create-form errors", () => {
		assert.match(formsSource, /role="alert"/);
	});
});
