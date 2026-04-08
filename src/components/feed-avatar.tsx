import { memo } from "react";

export const FeedAvatar = memo(function FeedAvatar({
  feedId,
  title,
}: {
  feedId: string;
  title: string;
}) {
  return (
    <img
      src={`/api/icons/${feedId}?v=2`}
      alt={title}
      width={48}
      height={48}
      className="size-12 rounded-2xl border border-subtle object-cover"
      loading="lazy"
      decoding="async"
    />
  );
});
