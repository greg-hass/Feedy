import dynamic from "next/dynamic";

const SettingsScreen = dynamic(
  () => import("@/components/settings-screen").then((module) => module.SettingsScreen),
);

export default function SettingsPage() {
  return <SettingsScreen />;
}
