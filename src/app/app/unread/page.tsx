import dynamic from "next/dynamic";

const UnreadScreen = dynamic(
  () => import("@/components/screens").then((module) => module.UnreadScreen),
);

export default function UnreadPage() {
  return <UnreadScreen />;
}
