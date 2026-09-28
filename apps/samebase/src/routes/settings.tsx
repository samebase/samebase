import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedUserRoutePage } from "@/appShell/AuthenticatedAppRoutePage";
import { AuthorizationErrorNotice } from "@/auth/AuthorizationErrorNotice";
import { UserSettingsPage } from "@/account/UserSettingsPage";
import { formatAuthorizationErrorMessage } from "@/auth/authorizationErrorMessage";
import { SETTINGS_ROUTE } from "@/account/settingsRoute";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import {
  SETTINGS_ROUTE_SEARCH_STATIC_DATA,
  validateSettingsRouteSearch,
} from "@/routeSearch/settings";
import { useAuthorizationErrorNotice } from "@/auth/useAuthorizationErrorNotice";
import { clearAuthorizationErrorSearch } from "@/routeSearch/authorizationError";
import { useCallback } from "react";

const SETTINGS_AUTHORIZATION_SOURCES = ["google-sign-in", "github-sign-in"] as const;

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
  const authorizationNotice = authorizationError ? (
    <AuthorizationErrorNotice>
      {formatAuthorizationErrorMessage(authorizationError)}
    </AuthorizationErrorNotice>
  ) : null;
  return (
    <AuthenticatedUserRoutePage signInTopNotice={authorizationNotice}>
      <UserSettingsPage authorizationNotice={authorizationNotice} />
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
