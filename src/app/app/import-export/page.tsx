import dynamic from "next/dynamic";

const ImportExportScreen = dynamic(
  () => import("@/components/import-export-screen").then((module) => module.ImportExportScreen),
);

export default function ImportExportPage() {
  return <ImportExportScreen />;
}
