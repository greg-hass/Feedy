type FolderNavigation = {
	folders: readonly { id: string; title: string }[];
	feeds: readonly { id: string; folderId: string | null }[];
};

/**
 * FNV-1a hash of the folder title, folded into a hue. Deterministic across
 * sessions and devices so a folder keeps its colour everywhere.
 */
export function folderDotHue(seed: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < seed.length; i++) {
		hash ^= seed.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash % 360;
}

export function folderDotColor(seed: string): string {
	return `hsl(${folderDotHue(seed)}, 62%, 52%)`;
}

let memoNavigation: FolderNavigation | null = null;
let memoMap: Map<string, string> | null = null;

/**
 * Maps feed id -> folder dot colour. Feeds without a folder (or with a folder
 * missing from the navigation payload) are omitted. Memoised on the navigation
 * object reference so a timeline of cards builds the map once per refresh.
 */
export function getFeedFolderColorMap(
	navigation: FolderNavigation | null | undefined,
): Map<string, string> {
	if (!navigation) {
		return new Map();
	}
	if (navigation === memoNavigation && memoMap) {
		return memoMap;
	}

	const titleById = new Map(navigation.folders.map((f) => [f.id, f.title]));
	const map = new Map<string, string>();
	for (const feed of navigation.feeds) {
		if (!feed.folderId) {
			continue;
		}
		const title = titleById.get(feed.folderId);
		if (title) {
			map.set(feed.id, folderDotColor(title));
		}
	}

	memoNavigation = navigation;
	memoMap = map;
	return map;
}
