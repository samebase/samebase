import { createFileRoute } from "@tanstack/react-router";
import { LogoPreviewPage } from "@/components/LogoPreviewPage";
import { validateLogoRouteSearch } from "@/lib/logoRouteSearch";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/logo/raster";

function LogoRasterRouteComponent() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <RoutedPage pathname={pathname}>
      <LogoPreviewPage
        renderMode="raster"
        replaceRouteSearch={(nextSearch) => {
          void navigate({
            replace: true,
            search: nextSearch,
          });
        }}
        routeSearch={routeSearch}
      />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/logo/raster")({
  component: LogoRasterRouteComponent,
  validateSearch: validateLogoRouteSearch,
});
