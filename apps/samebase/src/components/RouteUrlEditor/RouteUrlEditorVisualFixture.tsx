import { useLocation } from "@tanstack/react-router";

export type RouteUrlEditorVisualMode = "route-url-editor";

export function RouteUrlEditorVisualFixture() {
  const location = useLocation();

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      data-testid="route-url-editor-visual-fixture"
    >
      <span className="sr-only" data-testid="route-url-editor-fixture-current-href">
        {location.href}
      </span>
    </div>
  );
}
