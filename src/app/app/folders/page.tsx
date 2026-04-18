import dynamic from "next/dynamic";

const FoldersScreen = dynamic(
  () => import("@/components/screens").then((module) => module.FoldersScreen),
);

export default function FoldersPage() {
  return <FoldersScreen />;
}
