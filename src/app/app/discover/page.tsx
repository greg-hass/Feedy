import dynamic from "next/dynamic";

const DiscoverScreen = dynamic(
  () => import("@/components/screens").then((module) => module.DiscoverScreen),
);

export default function DiscoverPage() {
  return <DiscoverScreen />;
}
