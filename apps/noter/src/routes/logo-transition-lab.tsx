import { createFileRoute } from "@tanstack/react-router";
import { LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS } from "@/lib/logoRouteSearch";
import { LogoTransitionLabPage } from "@/components/logo/LogoTransitionLabPage";
import { RoutedPage } from "./-publicRouteComponents";

function LogoTransitionLabRouteComponent() {
  return (
    <RoutedPage pathname="/logo/transition">
      <LogoTransitionLabPage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/_public/logo/transition")({
  staticData: {
    permission: "public",
    searchParamSuggestions: LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LogoTransitionLabRouteComponent,
});
