import { useLocation } from "@tanstack/react-router";
import { RouteUrlEditor } from "@/components/RouteUrlEditor";
import { TestRouterProvider } from "@/test/TestRouterProvider";

export type RouteUrlEditorVisualMode = "route-url-editor";

const ROUTE_URL_EDITOR_FIXTURE_INITIAL_HREF =
  "/visual-fixture?mode=route-url-editor&draft=pwa#address";

function RouteUrlEditorFixtureContent() {
  const location = useLocation();

  return (
    <div className="grid w-full max-w-3xl gap-4">
      <div className="border border-border bg-background p-2">
        <RouteUrlEditor />
      </div>
      <p
        className="break-all font-mono text-sm leading-5 text-muted-foreground"
        data-testid="route-url-editor-fixture-current-href"
      >
        {location.href}
      </p>
    </div>
  );
}

export function RouteUrlEditorVisualFixture() {
  return (
    <div
      className="flex min-h-screen items-start bg-background p-6 text-foreground"
      data-testid="route-url-editor-visual-fixture"
    >
      <TestRouterProvider initialEntries={[ROUTE_URL_EDITOR_FIXTURE_INITIAL_HREF]}>
        <RouteUrlEditorFixtureContent />
      </TestRouterProvider>
    </div>
  );
}
