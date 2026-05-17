import { createFileRoute } from "@tanstack/react-router";
import { LogoStaticSvgPage } from "#src/components/LogoStaticSvgPage.tsx";
import { validateLogoRouteSearch } from "#src/lib/logoRouteSearch.ts";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/logo/svg";

function LogoSvgRouteComponent() {
  const routeSearch = Route.useSearch();

  return (
    <RoutedPage pathname={pathname}>
      <LogoStaticSvgPage routeSearch={routeSearch} />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/logo/svg")({
  component: LogoSvgRouteComponent,
  validateSearch: validateLogoRouteSearch,
});
