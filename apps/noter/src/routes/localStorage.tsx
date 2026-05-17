import { createFileRoute } from "@tanstack/react-router";
import { Layout } from "#src/Layout.tsx";
import { LocalStorageWorkspacePage } from "#src/components/LocalStorageWorkspacePage.tsx";
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
