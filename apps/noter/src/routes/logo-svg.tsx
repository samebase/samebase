import { createFileRoute } from "@tanstack/react-router";
import { LogoStaticSvgPage } from "@/components/LogoStaticSvgPage";
import { ensureLogoRouteDevModeSearch } from "@/lib/logoRouteDevMode";
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

export const Route = createFileRoute(pathname)({
  beforeLoad: ({ location, search }) => {
    ensureLogoRouteDevModeSearch({
      hash: location.hash,
      pathname,
      search,
    });
  },
  component: LogoSvgRouteComponent,
  validateSearch: validateLogoRouteSearch,
});
