import Image from "next/image";

export function FeedAvatar({
  feedId,
  title,
}: {
  feedId: string;
  title: string;
}) {
  return (
    <Image
      src={`/api/icons/${feedId}`}
      alt={title}
      width={48}
      height={48}
      className="size-12 rounded-2xl border border-subtle object-cover"
      unoptimized
    />
  );
}
