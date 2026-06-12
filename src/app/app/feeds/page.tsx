import dynamic from "next/dynamic";

const FeedsScreen = dynamic(
  () => import("@/components/feeds-screen").then((module) => module.FeedsScreen),
);

export default function FeedsPage() {
  return <FeedsScreen />;
}
