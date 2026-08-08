import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedUserRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { UserSettingsPage } from "@/components/UserSettingsPage";
import { SETTINGS_ROUTE } from "@/lib/settingsRoute";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import {
  SETTINGS_ROUTE_SEARCH_STATIC_DATA,
  validateSettingsRouteSearch,
} from "@/routeSearch/settings";
import { useAuthorizationErrorNotice } from "@/lib/useAuthorizationErrorNotice";
import { clearAuthorizationErrorSearch } from "@/routeSearch/authorizationError";
import { useCallback } from "react";

const SETTINGS_AUTHORIZATION_SOURCES = ["github-user", "google-sign-in", "github-sign-in"] as const;

function SettingsRouteComponent() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const consumeAuthorizationError = useCallback(() => {
    void navigate({
      hash: true,
      replace: true,
      resetScroll: false,
      search: clearAuthorizationErrorSearch,
      to: ".",
    });
  }, [navigate]);
  const authorizationError = useAuthorizationErrorNotice({
    allowedProviders: SETTINGS_AUTHORIZATION_SOURCES,
    onConsume: consumeAuthorizationError,
    search,
    scopeKey: "user-settings",
  });
  return (
    <AuthenticatedUserRoutePage>
      <UserSettingsPage authorizationError={authorizationError} />
    </AuthenticatedUserRoutePage>
  );
}

export const Route = createFileRoute("/settings")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[SETTINGS_ROUTE],
    ...SETTINGS_ROUTE_SEARCH_STATIC_DATA,
  },
  component: SettingsRouteComponent,
  validateSearch: validateSettingsRouteSearch,
});
