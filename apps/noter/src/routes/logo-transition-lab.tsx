import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS } from "@/lib/logoRouteSearch";
import { LogoTransitionLabPage } from "@/components/logo/LogoTransitionLabPage";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/logo/transition";

function LogoTransitionLabRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <LogoTransitionLabPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/logo/transition")({
  staticData: {
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    searchParamSuggestions: LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LogoTransitionLabRouteComponent,
});
