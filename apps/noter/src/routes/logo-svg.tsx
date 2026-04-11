import { createFileRoute } from "@tanstack/react-router";
import { LogoStaticSvgPage, validateLogoRouteSearch } from "@noter-md/logo";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/logo-svg";

function LogoSvgRouteComponent() {
  const routeSearch = Route.useSearch();

  return (
    <RoutedPage pathname={pathname}>
      <LogoStaticSvgPage routeSearch={routeSearch} />
    </RoutedPage>
  );
}

export const Route = createFileRoute(pathname)({
  component: LogoSvgRouteComponent,
  validateSearch: validateLogoRouteSearch,
});
