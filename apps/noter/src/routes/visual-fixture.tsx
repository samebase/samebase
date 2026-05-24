import { createFileRoute } from "@tanstack/react-router";
import { Layout, PublicLayoutShell } from "@/Layout";
import { VisualFixturePage } from "@/visualFixture";

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
  if (mode !== undefined) {
    return <VisualFixturePage mode={mode} />;
  }

  return (
    <Layout dataTestId="visual-fixture-route">
      <PublicLayoutShell dataTestId="visual-fixture-workspace" showRightSidebar={false}>
        <VisualFixturePage />
      </PublicLayoutShell>
    </Layout>
  );
}

export const Route = createFileRoute("/visual-fixture")({
  staticData: { permission: "public" },
  component: VisualFixtureRouteComponent,
  validateSearch: validateVisualFixtureRouteSearch,
});
