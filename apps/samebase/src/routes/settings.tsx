import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthenticatedUserRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { UserSettingsPage } from "@/components/UserSettingsPage";
import { SETTINGS_ROUTE } from "@/lib/settingsRoute";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import {
  POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM,
  SETTINGS_ROUTE_SEARCH_STATIC_DATA,
  validateSettingsRouteSearch,
} from "@/routeSearch/settings";
import { applySearchPatch } from "@/routing/searchFlags";

function SettingsRouteComponent() {
  return (
    <AuthenticatedUserRoutePage>
      <UserSettingsPage />
    </AuthenticatedUserRoutePage>
  );
}

export const Route = createFileRoute("/settings")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[SETTINGS_ROUTE],
    ...SETTINGS_ROUTE_SEARCH_STATIC_DATA,
  },
  beforeLoad: ({ search }) => {
    if (search[POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM]) {
      throw redirect({
        hash: true,
        replace: true,
        search: applySearchPatch(search, {
          [POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM]: null,
        }),
        to: "/settings",
      });
    }
  },
  component: SettingsRouteComponent,
  validateSearch: validateSettingsRouteSearch,
});
