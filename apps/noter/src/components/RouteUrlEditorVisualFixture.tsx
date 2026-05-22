import { useLocation } from "@tanstack/react-router";
import { RouteUrlEditor } from "@/components/RouteUrlEditor";
import { TestRouterProvider } from "@/test/TestRouterProvider";

export type RouteUrlEditorVisualMode = "route-url-editor";

const ROUTE_URL_EDITOR_FIXTURE_INITIAL_HREF = "/visual-fixture?mode=route-url-editor";

function RouteUrlEditorFixtureContent() {
  const location = useLocation();

  return (
    <>
      <RouteUrlEditor />
      <span className="sr-only" data-testid="route-url-editor-fixture-current-href">
        {location.href}
      </span>
    </>
  );
}

export function RouteUrlEditorVisualFixture() {
  return (
    <div
      className="min-h-screen bg-background text-foreground"
      data-testid="route-url-editor-visual-fixture"
    >
      <TestRouterProvider initialEntries={[ROUTE_URL_EDITOR_FIXTURE_INITIAL_HREF]}>
        <RouteUrlEditorFixtureContent />
      </TestRouterProvider>
    </div>
  );
}
