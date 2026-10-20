import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedUserRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { UserSettingsPage } from "@/account/UserSettingsPage";
import { SETTINGS_ROUTE } from "@/account/settingsRoute";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import {
  SETTINGS_ROUTE_SEARCH_STATIC_DATA,
  validateSettingsRouteSearch,
} from "@/routeSearch/settings";

function SettingsRouteComponent() {
  return (
    <AuthenticatedUserRoutePage>
      <UserSettingsPage />
    </AuthenticatedUserRoutePage>
  );
}

export const Route = createFileRoute("/_authed/settings")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[SETTINGS_ROUTE],
    ...SETTINGS_ROUTE_SEARCH_STATIC_DATA,
  },
  component: SettingsRouteComponent,
  validateSearch: validateSettingsRouteSearch,
});
