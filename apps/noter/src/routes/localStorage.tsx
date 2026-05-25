import { createFileRoute } from "@tanstack/react-router";
import { LocalStorageWorkspacePage } from "@/components/LocalStorageWorkspacePage";
import { RoutedPage } from "./-publicRouteComponents";

function LocalStorageRouteComponent() {
  return (
    <RoutedPage pathname="/localStorage">
      <LocalStorageWorkspacePage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/localStorage")({
  ssr: false,
  staticData: { permission: "public" },
  component: LocalStorageRouteComponent,
});
