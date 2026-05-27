import { createFileRoute } from "@tanstack/react-router";
import { IndexedDbWorkspacePage } from "@/components/IndexedDbWorkspacePage";
import { INDEXED_DB_ROUTE } from "@/lib/indexedDbRoute";
import { RoutedPage } from "./-publicRouteComponents";

function IndexedDbRouteComponent() {
  return (
    <RoutedPage pathname={INDEXED_DB_ROUTE}>
      <IndexedDbWorkspacePage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/indexedDB")({
  staticData: { permission: "public" },
  component: IndexedDbRouteComponent,
});
