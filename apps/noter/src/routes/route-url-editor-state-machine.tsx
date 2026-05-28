import { RouteUrlEditorStateMachineResearchPage } from "@/components/RouteUrlEditorStateMachineResearchPage";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/research/route-url-editor-state-machine";

function RouteUrlEditorStateMachineRouteComponent() {
  return (
    <RoutedPage pathname={pathname}>
      <RouteUrlEditorStateMachineResearchPage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/research/route-url-editor-state-machine")({
  staticData: NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: RouteUrlEditorStateMachineRouteComponent,
});
