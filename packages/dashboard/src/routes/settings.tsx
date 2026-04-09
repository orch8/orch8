import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../components/settings/SettingsPage.js";

export const Route = createFileRoute("/settings")({
  component: function SettingsRoute() {
    return (
      <div className="h-full">
        <h2 className="mb-4 type-section font-semibold">Settings</h2>
        <SettingsPage />
      </div>
    );
  },
});
