import { createFileRoute } from "@tanstack/react-router";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchAcceptedKeys,
  readRouteSearchParamAccess,
  readRouteSearchParamSuggestions,
  readRouteSearchParamMetadata,
  routeSearchFiniteNumber,
  routeSearchString,
  routeSearchValueParam,
} from "@/lib/routeSearchParamMetadata";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
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

const visualFixtureRouteSearchParamSuggestions = readRouteSearchParamSuggestions(
  visualFixtureRouteSearchParamMetadata,
  "route",
);

const visualFixtureRouteSearchParamAccess = readRouteSearchParamAccess(
  visualFixtureRouteSearchParamMetadata,
);

const visualFixtureRouteSearchKeys = readRouteSearchAcceptedKeys(RouteSearchSchema_visualFixture);

function validateVisualFixtureRouteSearch(
  search: Record<string, unknown>,
): VisualFixtureRouteSearch {
  return RouteSearchSchema_visualFixture.parse(search);
}

function VisualFixtureRouteComponent() {
  const { mode } = Route.useSearch();

  return <VisualFixturePage mode={mode} />;
}

export const Route = createFileRoute("/visual-fixture")({
  staticData: {
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    acceptedSearchKeys: visualFixtureRouteSearchKeys,
    searchParamAccess: visualFixtureRouteSearchParamAccess,
    searchParamSuggestions: visualFixtureRouteSearchParamSuggestions,
  },
  component: VisualFixtureRouteComponent,
  validateSearch: validateVisualFixtureRouteSearch,
});
