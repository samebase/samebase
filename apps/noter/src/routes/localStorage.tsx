import { createFileRoute } from "@tanstack/react-router";
import { Layout } from "@/Layout";
import { LocalStorageWorkspacePage } from "@/components/LocalStorageWorkspacePage";
import { LOCAL_STORAGE_PUBLIC_ROUTE_ID } from "@/lib/localStorageRoute";
import { RoutedPage } from "./-publicRouteComponents";

function LocalStorageRouteComponent() {
  return (
    <RoutedPage pathname="/localStorage">
      <Layout dataTestId="local-storage-route">
        <LocalStorageWorkspacePage />
      </Layout>
    </RoutedPage>
  );
}

export const Route = createFileRoute(LOCAL_STORAGE_PUBLIC_ROUTE_ID)({
  component: LocalStorageRouteComponent,
});
