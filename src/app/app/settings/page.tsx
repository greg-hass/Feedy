import dynamic from "next/dynamic";

const SettingsScreen = dynamic(
  () => import("@/components/screens").then((module) => module.SettingsScreen),
);

export default function SettingsPage() {
  return <SettingsScreen />;
}
