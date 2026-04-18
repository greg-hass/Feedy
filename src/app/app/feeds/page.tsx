import dynamic from "next/dynamic";

const FeedsScreen = dynamic(
  () => import("@/components/screens").then((module) => module.FeedsScreen),
);

export default function FeedsPage() {
  return <FeedsScreen />;
}
