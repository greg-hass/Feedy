import dynamic from "next/dynamic";

const SavedScreen = dynamic(
  () => import("@/components/saved-screen").then((module) => module.SavedScreen),
);

export default function SavedPage() {
  return <SavedScreen />;
}
