import { createFileRoute } from "@tanstack/react-router";
import { LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS } from "@/lib/logoRouteSearch";
import { LogoTransitionLabPage } from "@/components/logo/LogoTransitionLabPage";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { RoutedPage } from "./-publicRouteComponents";

function LogoTransitionLabRouteComponent() {
  return (
    <RoutedPage pathname="/logo/transition">
      <LogoTransitionLabPage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/logo/transition")({
  staticData: {
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH["/logo/transition"],
    searchParamSuggestions: LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LogoTransitionLabRouteComponent,
});
