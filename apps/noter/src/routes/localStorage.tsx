import { createFileRoute } from "@tanstack/react-router";
import { Layout } from "@/Layout";
import { LocalStorageWorkspacePage } from "@/components/LocalStorageWorkspacePage";
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

export const Route = createFileRoute("/_public/localStorage")({
  component: LocalStorageRouteComponent,
});
