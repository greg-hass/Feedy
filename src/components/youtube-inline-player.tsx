"use client";

import { useEffect, useRef } from "react";

const PLAYER_STORAGE_PREFIX = "feedy-youtube-progress";

declare global {
	interface Window {
		YT?: {
			Player: new (
				element: HTMLElement,
				options: {
					videoId: string;
					width?: string | number;
					height?: string | number;
					playerVars?: Record<string, string | number>;
					events?: {
						onReady?: (event: { target: YouTubePlayer }) => void;
						onStateChange?: (event: {
							data: number;
							target: YouTubePlayer;
						}) => void;
					};
				},
			) => YouTubePlayer;
			PlayerState?: {
				ENDED: number;
				PLAYING: number;
				PAUSED: number;
				BUFFERING: number;
			};
		};
		onYouTubeIframeAPIReady?: () => void;
		__feedyYouTubeIframeApi?: Promise<void>;
	}
}

type YouTubePlayer = {
	destroy: () => void;
	getCurrentTime: () => number;
	getDuration: () => number;
	mute: () => void;
	unMute: () => void;
	pauseVideo: () => void;
	seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
};

function getYouTubeProgressStorageKey(itemId: string, videoId: string) {
	return `${PLAYER_STORAGE_PREFIX}:${videoId}`;
}

export function getSavedYouTubeProgressSeconds(
	itemId: string,
	videoId: string,
) {
	if (typeof window === "undefined") {
		return 0;
	}

	const value = Number(
		window.localStorage.getItem(
			getYouTubeProgressStorageKey(itemId, videoId),
		) || "0",
	);
	return Number.isFinite(value) && value > 0 ? value : 0;
}

function loadYouTubeIframeApi() {
	if (typeof window === "undefined") {
		return Promise.resolve();
	}

	if (window.YT?.Player) {
		return Promise.resolve();
	}

	if (window.__feedyYouTubeIframeApi) {
		return window.__feedyYouTubeIframeApi;
	}

	window.__feedyYouTubeIframeApi = new Promise<void>((resolve) => {
		const existingScript = document.querySelector<HTMLScriptElement>(
			'script[src="https://www.youtube.com/iframe_api"]',
		);

		const previousReady = window.onYouTubeIframeAPIReady;
		window.onYouTubeIframeAPIReady = () => {
			previousReady?.();
			resolve();
		};

		if (existingScript) {
			return;
		}

		const script = document.createElement("script");
		script.src = "https://www.youtube.com/iframe_api";
		script.async = true;
		document.head.appendChild(script);
	});

	return window.__feedyYouTubeIframeApi;
}

export function YouTubeInlinePlayer({
	itemId,
	videoId,
	title,
	autoplay = true,
	startSeconds = 0,
	variant = "framed",
	className,
	onReady,
	onProgressChange,
	onMeaningfulPlayback,
	onPlaybackStateChange,
}: {
	itemId: string;
	videoId: string;
	title: string;
	autoplay?: boolean;
	startSeconds?: number;
	variant?: "framed" | "mount";
	className?: string;
	onReady?: () => void;
	onProgressChange?: (seconds: number) => void;
	onMeaningfulPlayback?: () => void;
	onPlaybackStateChange?: (
		state: "playing" | "paused" | "buffering" | "ended",
	) => void;
}) {
	const mountRef = useRef<HTMLDivElement | null>(null);
	const playerRef = useRef<YouTubePlayer | null>(null);
	const saveTimerRef = useRef<number | null>(null);
	const startSecondsRef = useRef(startSeconds);
	const readyCallbackRef = useRef(onReady);
	const progressCallbackRef = useRef(onProgressChange);
	const meaningfulCallbackRef = useRef(onMeaningfulPlayback);
	const playbackStateCallbackRef = useRef(onPlaybackStateChange);
	const meaningfulPlaybackTriggeredRef = useRef(startSeconds >= 20);
	const lastSavedSecondsRef = useRef(Math.max(0, Math.floor(startSeconds)));

	useEffect(() => {
		readyCallbackRef.current = onReady;
	}, [onReady]);

	useEffect(() => {
		progressCallbackRef.current = onProgressChange;
	}, [onProgressChange]);

	useEffect(() => {
		meaningfulCallbackRef.current = onMeaningfulPlayback;
	}, [onMeaningfulPlayback]);

	useEffect(() => {
		playbackStateCallbackRef.current = onPlaybackStateChange;
	}, [onPlaybackStateChange]);

	useEffect(() => {
		let cancelled = false;

		const clearTimer = () => {
			if (saveTimerRef.current != null) {
				window.clearInterval(saveTimerRef.current);
				saveTimerRef.current = null;
			}
		};

		const persistPosition = () => {
			if (!playerRef.current) {
				return;
			}

			try {
				const seconds = Math.max(
					0,
					Math.floor(playerRef.current.getCurrentTime()),
				);
				lastSavedSecondsRef.current = seconds;
				window.localStorage.setItem(
					getYouTubeProgressStorageKey(itemId, videoId),
					String(seconds),
				);
				progressCallbackRef.current?.(seconds);

				if (!meaningfulPlaybackTriggeredRef.current) {
					const duration = Math.max(0, playerRef.current.getDuration());
					const reachedTwentySeconds = seconds >= 20;
					const reachedTwentyPercent =
						duration > 0 && seconds / duration >= 0.2;

					if (reachedTwentySeconds || reachedTwentyPercent) {
						meaningfulPlaybackTriggeredRef.current = true;
						meaningfulCallbackRef.current?.();
					}
				}
			} catch {
				// Ignore transient player access failures.
			}
		};

		const startTimer = () => {
			if (saveTimerRef.current != null) {
				return;
			}

			saveTimerRef.current = window.setInterval(persistPosition, 1000);
		};

		const setup = async () => {
			await loadYouTubeIframeApi();
			if (cancelled || !mountRef.current || !window.YT?.Player) {
				return;
			}

			playerRef.current = new window.YT.Player(mountRef.current, {
				videoId,
				width: "100%",
				height: "100%",
				playerVars: {
					autoplay: autoplay ? 1 : 0,
					playsinline: 1,
					rel: 0,
					modestbranding: 1,
				},
				events: {
					onReady: ({ target }) => {
						const iframe = mountRef.current?.querySelector("iframe");
						if (iframe) {
							iframe.style.width = "100%";
							iframe.style.height = "100%";
							iframe.style.position = "absolute";
							iframe.style.top = "0";
							iframe.style.left = "0";
						}

						const startAt = startSecondsRef.current;
						if (startAt > 1) {
							target.seekTo(startAt, true);
							lastSavedSecondsRef.current = Math.floor(startAt);
							progressCallbackRef.current?.(Math.floor(startAt));
						}

						readyCallbackRef.current?.();
						startTimer();
					},
					onStateChange: ({ data, target }) => {
						if (data === window.YT?.PlayerState?.ENDED) {
							clearTimer();
							lastSavedSecondsRef.current = 0;
							window.localStorage.removeItem(
								getYouTubeProgressStorageKey(itemId, videoId),
							);
							progressCallbackRef.current?.(0);
							playbackStateCallbackRef.current?.("ended");
							return;
						}

						if (
							data === window.YT?.PlayerState?.PLAYING ||
							data === window.YT?.PlayerState?.PAUSED ||
							data === window.YT?.PlayerState?.BUFFERING
						) {
							try {
								const seconds = Math.max(
									0,
									Math.floor(target.getCurrentTime()),
								);
								lastSavedSecondsRef.current = seconds;
								progressCallbackRef.current?.(seconds);
							} catch {
								// Ignore transient player access failures.
							}
						}

						if (data === window.YT?.PlayerState?.PLAYING) {
							playbackStateCallbackRef.current?.("playing");
						} else if (data === window.YT?.PlayerState?.PAUSED) {
							playbackStateCallbackRef.current?.("paused");
						} else if (data === window.YT?.PlayerState?.BUFFERING) {
							playbackStateCallbackRef.current?.("buffering");
						}

						startTimer();
					},
				},
			});
		};

		void setup();

		return () => {
			cancelled = true;
			persistPosition();
			clearTimer();
			try {
				playerRef.current?.pauseVideo();
			} catch {
				// Ignore shutdown failures.
			}
			try {
				playerRef.current?.destroy();
			} catch {
				// Ignore shutdown failures.
			}
			playerRef.current = null;
		};
	}, [autoplay, itemId, videoId]);

	if (variant === "mount") {
		return (
			<div
				ref={mountRef}
				className={className ?? "h-full w-full"}
				aria-label={title}
			/>
		);
	}

	return (
		<div
			className={`aspect-video w-full bg-[var(--text-primary)]${className ? ` ${className}` : ""}`}
		>
			<div ref={mountRef} className="h-full w-full" aria-label={title} />
		</div>
	);
}
