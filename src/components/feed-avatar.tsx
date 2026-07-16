import Image from "next/image";
import { memo, useState } from "react";

export const FeedAvatar = memo(function FeedAvatar({
	feedId,
	title,
	size = 48,
}: {
	feedId: string;
	title: string;
	size?: number;
}) {
	const [failed, setFailed] = useState(false);

	if (failed) {
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
			src={`/api/icons/${feedId}?v=3`}
			alt={title}
			width={size}
			height={size}
			className="rounded-2xl border border-subtle object-cover"
			style={{ width: size, height: size }}
			loading="lazy"
			decoding="async"
			unoptimized
			onError={() => setFailed(true)}
		/>
	);
});
