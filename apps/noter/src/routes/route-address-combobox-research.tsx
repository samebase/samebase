import { RouteAddressComboboxResearchPage } from "@/components/RouteUrlEditor/RouteAddressComboboxResearchPage";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/research/route-address-combobox";

function RouteAddressComboboxResearchRouteComponent() {
  return (
    <RoutedPage pathname={pathname}>
      <RouteAddressComboboxResearchPage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/research/route-address-combobox")({
  staticData: NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: RouteAddressComboboxResearchRouteComponent,
});
