import { LogoRasterSeamLabPage } from "@/components/LogoRasterSeamLabPage";
import { validateLogoRouteSearch } from "@/lib/logoRouteSearch";
import { createFileRoute } from "@tanstack/react-router";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/logo/raster-seams";

function LogoRasterSeamsRouteComponent() {
  const routeSearch = Route.useSearch();

  return (
    <RoutedPage pathname={pathname}>
      <LogoRasterSeamLabPage routeSearch={routeSearch} />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/logo/raster-seams")({
  component: LogoRasterSeamsRouteComponent,
  validateSearch: validateLogoRouteSearch,
});
