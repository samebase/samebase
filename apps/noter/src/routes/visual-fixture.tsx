import { createFileRoute } from "@tanstack/react-router";
import {
  readRouteSearchParamSuggestions,
  type RouteSearchParamMetadataByKey,
} from "@/lib/routeSearchParamMetadata";
import { VisualFixturePage } from "@/visualFixture";

type VisualFixtureRouteSearch = {
  mode?: string;
};

const visualFixtureRouteSearchParamMetadata = {
  mode: { permission: "public", suggestion: "route", valueKind: "value" },
} as const satisfies RouteSearchParamMetadataByKey<VisualFixtureRouteSearch>;

const visualFixtureRouteSearchParamSuggestions = readRouteSearchParamSuggestions(
  visualFixtureRouteSearchParamMetadata,
  "route",
);

function validateVisualFixtureRouteSearch(
  search: Record<string, unknown>,
): VisualFixtureRouteSearch {
  const mode = search.mode;
  if (typeof mode !== "string") {
    return {};
  }

  return { mode };
}

function VisualFixtureRouteComponent() {
  const { mode } = Route.useSearch();
  return <VisualFixturePage mode={mode} />;
}

export const Route = createFileRoute("/visual-fixture")({
  staticData: {
    permission: "public",
    searchParamSuggestions: visualFixtureRouteSearchParamSuggestions,
  },
  component: VisualFixtureRouteComponent,
  validateSearch: validateVisualFixtureRouteSearch,
});
