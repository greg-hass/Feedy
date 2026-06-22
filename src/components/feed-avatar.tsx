import Image from "next/image";
import { memo } from "react";

export const FeedAvatar = memo(function FeedAvatar({
	feedId,
	title,
	size = 48,
}: {
	feedId: string;
	title: string;
	size?: number;
}) {
	return (
		<Image
			src={`/api/icons/${feedId}?v=2`}
			alt={title}
			width={size}
			height={size}
			className="rounded-2xl border border-subtle object-cover"
			style={{ width: size, height: size }}
			loading="lazy"
			decoding="async"
			unoptimized
		/>
	);
});