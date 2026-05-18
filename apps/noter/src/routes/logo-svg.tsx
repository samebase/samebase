import { createFileRoute } from "@tanstack/react-router";
import { LogoStaticSvgPage } from "@/components/logo/LogoStaticSvgPage";
import { validateLogoRouteSearch } from "@/lib/logoRouteSearch";
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
