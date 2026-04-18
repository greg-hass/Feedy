import dynamic from "next/dynamic";

const ImportExportScreen = dynamic(
  () => import("@/components/screens").then((module) => module.ImportExportScreen),
);

export default function ImportExportPage() {
  return <ImportExportScreen />;
}
