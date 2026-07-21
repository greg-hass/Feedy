"use client";

import Image from "next/image";
import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import { YouTubeInlinePlayer } from "@/components/youtube-inline-player";

export type ResolvedMediaSource =
	| {
			kind: "native";
			src: string;
			type: string;
			poster?: string | null;
			youtubeVideoId?: string | null;
	  }
	| {
			kind: "youtube";
			youtubeVideoId: string;
			poster?: string | null;
	  }
	| {
			kind: "none";
	  };

function getMediaProgressStorageKey(itemId: string) {
	return `feedy-media-progress:${itemId}`;
}

function getSavedMediaProgressSeconds(itemId: string) {
	if (typeof window === "undefined") {
		return 0;
	}

	const value = Number(
		window.localStorage.getItem(getMediaProgressStorageKey(itemId)) || "0",
	);
	return Number.isFinite(value) && value > 0 ? value : 0;
}

function saveMediaProgressSeconds(itemId: string, seconds: number) {
	if (typeof window === "undefined") {
		return;
	}

	window.localStorage.setItem(
		getMediaProgressStorageKey(itemId),
		String(Math.max(0, Math.floor(seconds))),
	);
}

export async function fetchMediaSource(
	itemId: string,
): Promise<ResolvedMediaSource> {
	const response = await fetch(`/api/items/${itemId}/video`, {
		headers: {
			accept: "application/json",
		},
	});

	if (!response.ok) {
		return { kind: "none" };
	}

	return (await response.json()) as ResolvedMediaSource;
}

// ---------------------------------------------------------------------------
// Picture-in-Picture helpers
// ---------------------------------------------------------------------------

type WebkitVideoElement = HTMLVideoElement & {
	webkitSupportsPresentationMode?: (mode: string) => boolean;
	webkitSetPresentationMode?: (mode: string) => void;
	webkitPresentationMode?: string;
};

/** Try to enter PiP via standard API, falling back to webkit on iOS. */
function requestPipEnter(video: HTMLVideoElement) {
	const wv = video as WebkitVideoElement;
	try {
		if (
			typeof video.requestPictureInPicture === "function" &&
			!document.pictureInPictureElement
		) {
			void video.requestPictureInPicture().catch(() => {
				// Ignore PiP failures.
			});
		} else if (
			typeof wv.webkitSupportsPresentationMode === "function" &&
			wv.webkitSupportsPresentationMode("picture-in-picture") &&
			typeof wv.webkitSetPresentationMode === "function"
		) {
			wv.webkitSetPresentationMode("picture-in-picture");
		}
	} catch {
		// Ignore PiP failures.
	}
}

/** Try to exit PiP via standard API, falling back to webkit on iOS. */
function requestPipExit(video: HTMLVideoElement) {
	const wv = video as WebkitVideoElement;
	try {
		if (
			document.pictureInPictureElement &&
			typeof document.exitPictureInPicture === "function"
		) {
			void document.exitPictureInPicture().catch(() => {
				// Ignore exit-PiP failures.
			});
		} else if (typeof wv.webkitSetPresentationMode === "function") {
			wv.webkitSetPresentationMode("inline");
		}
	} catch {
		// Ignore exit-PiP failures.
	}
}

/**
 * Encapsulates all Picture-in-Picture logic: support detection, state
 * tracking, and user-gesture-initiated toggle.
 *
 * `enter` and `isActive` are stable (useCallback on a stable ref) so they
 * can be safely added to effect dependency arrays.
 */
function usePictureInPicture(videoRef: RefObject<HTMLVideoElement | null>) {
	const [supported] = useState(() => {
		if (typeof document === "undefined") {
			return false;
		}
		// Standard PiP API (desktop, iPadOS desktop-mode Safari).
		if (
			typeof document.pictureInPictureEnabled === "boolean" &&
			document.pictureInPictureEnabled
		) {
			return true;
		}
		// Webkit PiP API (iOS Safari) — probe a throwaway element.
		const probe = document.createElement("video") as WebkitVideoElement;
		return (
			typeof probe.webkitSupportsPresentationMode === "function" &&
			probe.webkitSupportsPresentationMode("picture-in-picture")
		);
	});
	const [active, setActive] = useState(false);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) {
			return;
		}

		const wv = video as WebkitVideoElement;
		const handleEnter = () => setActive(true);
		const handleLeave = () => setActive(false);
		const handleWebkitModeChange = () => {
			setActive(wv.webkitPresentationMode === "picture-in-picture");
		};

		video.addEventListener("enterpictureinpicture", handleEnter);
		video.addEventListener("leavepictureinpicture", handleLeave);
		video.addEventListener(
			"webkitpresentationmodechanged",
			handleWebkitModeChange,
		);

		return () => {
			video.removeEventListener("enterpictureinpicture", handleEnter);
			video.removeEventListener("leavepictureinpicture", handleLeave);
			video.removeEventListener(
				"webkitpresentationmodechanged",
				handleWebkitModeChange,
			);
		};
	}, [videoRef]);

	const enter = useCallback(() => {
		const video = videoRef.current;
		if (video) {
			requestPipEnter(video);
		}
	}, [videoRef]);

	const exit = useCallback(() => {
		const video = videoRef.current;
		if (video) {
			requestPipExit(video);
		}
	}, [videoRef]);

	const toggle = useCallback(() => {
		if (active) {
			exit();
		} else {
			enter();
		}
	}, [active, enter, exit]);

	const isActive = useCallback(() => {
		const video = videoRef.current;
		if (!video) {
			return false;
		}
		const wv = video as WebkitVideoElement;
		return (
			!!document.pictureInPictureElement ||
			wv.webkitPresentationMode === "picture-in-picture"
		);
	}, [videoRef]);

	return { supported, active, toggle, enter, isActive };
}

/** Restore saved playback position for a video element. */
function restoreSavedPosition(
	video: HTMLVideoElement,
	itemId: string,
	startSeconds: number,
) {
	const savedSeconds = Math.max(
		startSeconds,
		getSavedMediaProgressSeconds(itemId),
	);
	if (savedSeconds <= 1) {
		return;
	}

	const applyStart = () => {
		try {
			video.currentTime = savedSeconds;
		} catch {
			// Ignore seek failures until metadata is ready.
		}
	};

	if (video.readyState >= 1) {
		applyStart();
	} else {
		video.addEventListener("loadedmetadata", applyStart, { once: true });
	}
}

// ---------------------------------------------------------------------------
// Video progress tracking hook
// ---------------------------------------------------------------------------

/**
 * Tracks playback position, fires onMeaningfulPlayback, and auto-enters PiP
 * when the page is hidden (works on iPad; silently fails on iPhone which
 * requires a user gesture for PiP).
 */
function useVideoProgress(
	videoRef: RefObject<HTMLVideoElement | null>,
	opts: {
		itemId: string;
		src: string;
		startSeconds: number;
		onMeaningfulPlayback?: () => void;
		pipEnter: () => void;
		pipIsActive: () => boolean;
	},
) {
	const {
		itemId,
		src,
		startSeconds,
		onMeaningfulPlayback,
		pipEnter,
		pipIsActive,
	} = opts;
	const progressTimerRef = useRef<number | null>(null);
	const meaningfulPlaybackTriggeredRef = useRef(startSeconds >= 20);

	// Restore saved position on mount / source change.
	useEffect(() => {
		const video = videoRef.current;
		if (!video) {
			return;
		}
		restoreSavedPosition(video, itemId, startSeconds);
	}, [itemId, startSeconds, src, videoRef]);

	// Track progress, detect meaningful watch, auto-PiP on tab switch.
	useEffect(() => {
		const video = videoRef.current;
		if (!video) {
			return;
		}

		const clearTimer = () => {
			if (progressTimerRef.current != null) {
				window.clearInterval(progressTimerRef.current);
				progressTimerRef.current = null;
			}
		};

		const persistPosition = () => {
			const currentVideo = videoRef.current;
			if (!currentVideo) {
				return;
			}

			try {
				const seconds = Math.max(0, Math.floor(currentVideo.currentTime));
				saveMediaProgressSeconds(itemId, seconds);

				if (!meaningfulPlaybackTriggeredRef.current) {
					const duration = Math.max(0, currentVideo.duration || 0);
					const reachedTwentySeconds = seconds >= 20;
					const reachedTwentyPercent =
						duration > 0 && seconds / duration >= 0.2;

					if (reachedTwentySeconds || reachedTwentyPercent) {
						meaningfulPlaybackTriggeredRef.current = true;
						onMeaningfulPlayback?.();
					}
				}
			} catch {
				// Ignore transient video access failures.
			}
		};

		progressTimerRef.current = window.setInterval(persistPosition, 1000);

		const tryEnterPictureInPicture = () => {
			if (pipIsActive()) {
				return;
			}
			pipEnter();
		};

		const handleVisibilityChange = () => {
			if (document.visibilityState === "hidden") {
				tryEnterPictureInPicture();
			}
		};

		const handlePageHide = () => {
			tryEnterPictureInPicture();
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("pagehide", handlePageHide);

		return () => {
			persistPosition();
			clearTimer();
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("pagehide", handlePageHide);
			try {
				video.pause();
			} catch {
				// Ignore shutdown failures.
			}
		};
	}, [itemId, onMeaningfulPlayback, pipEnter, pipIsActive, videoRef]);
}

// ---------------------------------------------------------------------------
// Native video player component
// ---------------------------------------------------------------------------

function NativeVideoPlayer({
	itemId,
	title,
	src,
	poster,
	startSeconds = 0,
	onMeaningfulPlayback,
	onError,
	onPlaying,
}: {
	itemId: string;
	title: string;
	src: string;
	poster?: string | null;
	startSeconds?: number;
	onMeaningfulPlayback?: () => void;
	onError?: () => void;
	onPlaying?: () => void;
}) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const {
		supported: pipSupported,
		active: pipActive,
		toggle: pipToggle,
		enter: pipEnter,
		isActive: pipIsActive,
	} = usePictureInPicture(videoRef);

	useVideoProgress(videoRef, {
		itemId,
		src,
		startSeconds,
		onMeaningfulPlayback,
		pipEnter,
		pipIsActive,
	});

	return (
		<div className="relative">
			<video
				ref={videoRef}
				src={src}
				controls
				autoPlay
				playsInline
				poster={poster ?? undefined}
				preload="metadata"
				className="aspect-video w-full bg-[var(--text-primary)]"
				aria-label={title}
				onError={() => {
					onError?.();
				}}
				onPlaying={() => {
					onPlaying?.();
				}}
				onLoadedMetadata={() => {
					const video = videoRef.current;
					if (!video) {
						return;
					}

					const savedSeconds = Math.max(
						startSeconds,
						getSavedMediaProgressSeconds(itemId),
					);
					if (savedSeconds > 1) {
						try {
							video.currentTime = savedSeconds;
						} catch {
							// Ignore seek failures until the browser is ready.
						}
					}
				}}
			>
				<track kind="captions" />
			</video>
			{pipSupported ? (
				<button
					type="button"
					onClick={pipToggle}
					className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-lg bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70 active:scale-95"
					aria-label={
						pipActive ? "Exit picture in picture" : "Enter picture in picture"
					}
					title={pipActive ? "Exit PiP" : "Picture in Picture"}
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<rect x="2" y="4" width="20" height="16" rx="2" />
						<rect
							x="12"
							y="11"
							width="8"
							height="7"
							rx="1"
							fill="currentColor"
							stroke="none"
						/>
					</svg>
				</button>
			) : null}
		</div>
	);
}

function NativeMediaSurface({
	itemId,
	title,
	src,
	poster,
	startSeconds,
	youtubeVideoId,
	onMeaningfulPlayback,
}: {
	itemId: string;
	title: string;
	src: string;
	poster?: string | null;
	startSeconds: number;
	youtubeVideoId?: string | null;
	onMeaningfulPlayback?: () => void;
}) {
	const [nativeSourceFailed, setNativeSourceFailed] = useState(false);
	const [nativeSourcePlaying, setNativeSourcePlaying] = useState(false);

	useEffect(() => {
		if (!youtubeVideoId || nativeSourceFailed || nativeSourcePlaying) {
			return;
		}

		const timeout = window.setTimeout(() => {
			setNativeSourceFailed(true);
		}, 600);

		return () => window.clearTimeout(timeout);
	}, [nativeSourceFailed, nativeSourcePlaying, youtubeVideoId]);

	if (nativeSourceFailed && youtubeVideoId) {
		return (
			<YouTubeInlinePlayer
				itemId={itemId}
				videoId={youtubeVideoId}
				title={title}
				startSeconds={startSeconds}
				onMeaningfulPlayback={onMeaningfulPlayback}
			/>
		);
	}

	return (
		<div className="relative aspect-video w-full overflow-hidden bg-[var(--text-primary)]">
			<NativeVideoPlayer
				itemId={itemId}
				title={title}
				src={src}
				poster={poster ?? null}
				startSeconds={startSeconds}
				onMeaningfulPlayback={onMeaningfulPlayback}
				onError={() => {
					if (youtubeVideoId) {
						setNativeSourceFailed(true);
					}
				}}
				onPlaying={() => {
					setNativeSourcePlaying(true);
				}}
			/>
			{!nativeSourcePlaying ? (
				<div className="absolute inset-0 flex items-center justify-center bg-[var(--text-primary)]/90">
					{poster ? (
						<Image
							src={poster}
							alt=""
							fill
							sizes="(max-width: 448px) 100vw, 448px"
							unoptimized
							className="object-cover opacity-55"
							loading="eager"
						/>
					) : null}
					<div className="relative z-10 h-10 w-10 animate-spin rounded-full border-2 border-[var(--surface)]/20 border-t-[var(--surface)]/90" />
				</div>
			) : null}
		</div>
	);
}

export function MediaSurface({
	source,
	itemId,
	title,
	startSeconds = 0,
	poster,
	onMeaningfulPlayback,
}: {
	source: ResolvedMediaSource;
	itemId: string;
	title: string;
	startSeconds?: number;
	poster?: string | null;
	onMeaningfulPlayback?: () => void;
}) {
	if (source.kind === "native") {
		return (
			<NativeMediaSurface
				key={`${itemId}:${source.youtubeVideoId ?? source.src}`}
				itemId={itemId}
				title={title}
				src={source.src}
				poster={source.poster ?? poster ?? null}
				startSeconds={startSeconds}
				youtubeVideoId={source.youtubeVideoId ?? null}
				onMeaningfulPlayback={onMeaningfulPlayback}
			/>
		);
	}

	if (source.kind === "youtube") {
		return (
			<YouTubeInlinePlayer
				itemId={itemId}
				videoId={source.youtubeVideoId}
				title={title}
				startSeconds={startSeconds}
				onMeaningfulPlayback={onMeaningfulPlayback}
			/>
		);
	}

	return null;
}
