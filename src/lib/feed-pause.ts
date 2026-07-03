export function getFeedPausePatch(isPaused: boolean) {
	return {
		excludeFromTimeline: !isPaused,
	};
}

export function getFeedPauseActionLabel(isPaused: boolean) {
	return isPaused ? "Resume" : "Pause";
}
