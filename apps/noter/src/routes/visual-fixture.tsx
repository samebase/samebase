import { createFileRoute } from "@tanstack/react-router";
import { VisualFixturePage } from "#src/visualFixture.tsx";

type VisualFixtureRouteSearch = {
  mode?: string;
};

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
  component: VisualFixtureRouteComponent,
  validateSearch: validateVisualFixtureRouteSearch,
});
