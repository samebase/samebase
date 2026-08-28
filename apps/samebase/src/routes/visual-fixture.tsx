import { createFileRoute } from "@tanstack/react-router";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchStaticData,
  routeSearchFiniteNumber,
  routeSearchString,
  routeSearchValueParam,
} from "@/routing/searchParamMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { VisualFixturePage } from "@/visualFixture";

const pathname = "/visual-fixture";
const RouteSearchSchema_visualFixture = defineRouteSearchParams({
  elevation: routeSearchValueParam(routeSearchFiniteNumber, {
    access: "access_public",
    sampleValue: "45",
    suggestion: "hidden",
    valueType: "freeform",
  }),
  mode: routeSearchValueParam(routeSearchString, {
    access: "access_public",
    sampleValue: "route-url-editor",
    suggestion: "route",
    valueType: "freeform",
  }),
  rotation: routeSearchValueParam(routeSearchFiniteNumber, {
    access: "access_public",
    sampleValue: "90",
    suggestion: "hidden",
    valueType: "freeform",
  }),
});

type VisualFixtureRouteSearch = InferRouteSearch<typeof RouteSearchSchema_visualFixture>;

const visualFixtureRouteSearchParamMetadata = readRouteSearchParamMetadata(
  RouteSearchSchema_visualFixture,
);

const visualFixtureRouteSearchStaticData = readRouteSearchStaticData(
  visualFixtureRouteSearchParamMetadata,
);

function validateVisualFixtureRouteSearch(
  search: Record<string, unknown>,
): VisualFixtureRouteSearch {
  return RouteSearchSchema_visualFixture.parse(search);
}

function VisualFixtureRouteComponent() {
  const { mode } = Route.useSearch();

  return (
    <AppWorkspaceRouteChrome
      left={null}
      leftToggleVisibility="hidden"
      right={null}
      rightToggleVisibility="hidden"
    >
      <VisualFixturePage mode={mode} />
    </AppWorkspaceRouteChrome>
  );
}

function VisualFixturePendingComponent() {
  return (
    <div
      data-testid="visual-fixture-pending"
      style={{
        background: "#f5f5f4",
        inset: 0,
        minHeight: "100dvh",
        position: "fixed",
      }}
    />
  );
}

export const Route = createFileRoute("/visual-fixture")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    ...visualFixtureRouteSearchStaticData,
  },
  component: VisualFixtureRouteComponent,
  pendingComponent: VisualFixturePendingComponent,
  pendingMs: 0,
  validateSearch: validateVisualFixtureRouteSearch,
});
