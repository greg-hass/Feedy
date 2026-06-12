import dynamic from "next/dynamic";

const FoldersScreen = dynamic(
  () => import("@/components/folders-screen").then((module) => module.FoldersScreen),
);

export default function FoldersPage() {
  return <FoldersScreen />;
}
