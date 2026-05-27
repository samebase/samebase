import { createFileRoute } from "@tanstack/react-router";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamSuggestions,
  readRouteSearchParamMetadata,
  routeSearchString,
  routeSearchValueParam,
} from "@/lib/routeSearchParamMetadata";
import { VisualFixturePage } from "@/visualFixture";

const visualFixtureRouteSearchSchema = defineRouteSearchParams({
  mode: routeSearchValueParam(routeSearchString, {
    permission: "public",
    sampleValue: "route-url-editor",
    suggestion: "route",
    valueType: "freeform",
  }),
});

type VisualFixtureRouteSearch = InferRouteSearch<typeof visualFixtureRouteSearchSchema>;

const visualFixtureRouteSearchParamMetadata = readRouteSearchParamMetadata(
  visualFixtureRouteSearchSchema,
);

const visualFixtureRouteSearchParamSuggestions = readRouteSearchParamSuggestions(
  visualFixtureRouteSearchParamMetadata,
  "route",
);

function validateVisualFixtureRouteSearch(
  search: Record<string, unknown>,
): VisualFixtureRouteSearch {
  return visualFixtureRouteSearchSchema.parse(search);
}

function VisualFixtureRouteComponent() {
  const { mode } = Route.useSearch();

  return <VisualFixturePage mode={mode} />;
}

export const Route = createFileRoute("/visual-fixture")({
  staticData: {
    availableOn: ["local"],
    permission: "public",
    searchParamSuggestions: visualFixtureRouteSearchParamSuggestions,
  },
  component: VisualFixtureRouteComponent,
  validateSearch: validateVisualFixtureRouteSearch,
});
