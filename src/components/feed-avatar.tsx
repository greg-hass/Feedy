import Image from "next/image";
import { memo, useState } from "react";

export const FeedAvatar = memo(function FeedAvatar({
	feedId,
	title,
	iconHintUrl,
	size = 48,
}: {
	feedId: string;
	title: string;
	iconHintUrl?: string | null;
	size?: number;
}) {
	const [failedSrc, setFailedSrc] = useState<string | null>(null);
	const cachedIconSrc = `/api/icons/${feedId}?v=4`;
	const imageSrc =
		iconHintUrl && failedSrc !== iconHintUrl ? iconHintUrl : cachedIconSrc;

	if (failedSrc === cachedIconSrc) {
		return (
			<div
				data-flat-avatar="true"
				className="flex shrink-0 items-center justify-center rounded-2xl border border-subtle bg-[var(--surface-strong)] text-sm font-semibold text-secondary"
				style={{ width: size, height: size }}
			>
				{title.trim().charAt(0).toUpperCase() || "F"}
			</div>
		);
	}

	return (
		<Image
			data-flat-avatar="true"
			src={imageSrc}
			alt={title}
			width={size}
			height={size}
			className="rounded-2xl border border-subtle object-cover"
			style={{ width: size, height: size }}
			loading="lazy"
			decoding="async"
			unoptimized
			onError={() => setFailedSrc(imageSrc)}
		/>
	);
});
