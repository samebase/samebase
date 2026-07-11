import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedUserRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { UserSettingsPage } from "@/components/UserSettingsPage";
import { SETTINGS_ROUTE } from "@/lib/settingsRoute";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function SettingsRouteComponent() {
  return (
    <AuthenticatedUserRoutePage>
      <UserSettingsPage />
    </AuthenticatedUserRoutePage>
  );
}

export const Route = createFileRoute("/settings")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[SETTINGS_ROUTE],
  component: SettingsRouteComponent,
});
