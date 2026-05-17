import { createFileRoute } from "@tanstack/react-router";
import { LogoSingleCubeStudyPage } from "#src/components/LogoSingleCubeStudyPage.tsx";
import { validateLogoRouteSearch } from "#src/lib/logoRouteSearch.ts";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/logo/single-cube";

function LogoIsoStudyRouteComponent() {
  const routeSearch = Route.useSearch();

  return (
    <RoutedPage pathname={pathname}>
      <LogoSingleCubeStudyPage routeSearch={routeSearch} />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/logo/single-cube")({
  component: LogoIsoStudyRouteComponent,
  validateSearch: validateLogoRouteSearch,
});
