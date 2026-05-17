import { createFileRoute } from "@tanstack/react-router";
import { LogoPreviewPage } from "#src/components/LogoPreviewPage.tsx";
import { validateLogoRouteSearch } from "#src/lib/logoRouteSearch.ts";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/logo";

function LogoThreeRouteComponent() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <RoutedPage pathname={pathname}>
      <LogoPreviewPage
        renderMode="three"
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

export const Route = createFileRoute("/logo")({
  component: LogoThreeRouteComponent,
  validateSearch: validateLogoRouteSearch,
});
