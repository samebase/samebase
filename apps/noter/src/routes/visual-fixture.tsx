import { createFileRoute } from "@tanstack/react-router";
import {
  readRouteSearchParamSuggestions,
  readRouteSearchParamMetadata,
  routeSearchValueParam,
} from "@/lib/routeSearchParamMetadata";
import { VisualFixturePage } from "@/visualFixture";
import { z } from "zod";

function readOptionalMode(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

const visualFixtureRouteSearchSchema = z.object({
  mode: routeSearchValueParam(z.preprocess(readOptionalMode, z.string().optional()), {
    permission: "public",
    suggestion: "route",
  }),
});

type VisualFixtureRouteSearch = z.infer<typeof visualFixtureRouteSearchSchema>;

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
