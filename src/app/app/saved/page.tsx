import dynamic from "next/dynamic";

const SavedScreen = dynamic(
  () => import("@/components/screens").then((module) => module.SavedScreen),
);

export default function SavedPage() {
  return <SavedScreen />;
}
