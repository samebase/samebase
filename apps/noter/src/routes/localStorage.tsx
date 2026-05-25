import { createFileRoute } from "@tanstack/react-router";
import { LocalStorageWorkspacePage } from "@/components/LocalStorageWorkspacePage";
import { LOCAL_STORAGE_PUBLIC_LAYOUT_CHROME } from "@/lib/publicLayoutRouteChromeConfigs";
import { RoutedPage } from "./-publicRouteComponents";

function LocalStorageRouteComponent() {
  return (
    <RoutedPage pathname="/localStorage">
      <LocalStorageWorkspacePage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/_public/localStorage")({
  staticData: {
    permission: "public",
    publicLayoutRouteChrome: LOCAL_STORAGE_PUBLIC_LAYOUT_CHROME,
  },
  component: LocalStorageRouteComponent,
});
