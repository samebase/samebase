import { HtmlCanvasLabPage } from "@/components/HtmlCanvasLabPage";
import { createFileRoute } from "@tanstack/react-router";
import { RoutedPage } from "./-publicRouteComponents";

function HtmlCanvasRouteComponent() {
  return (
    <RoutedPage pathname="/html-canvas">
      <HtmlCanvasLabPage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/html-canvas")({
  component: HtmlCanvasRouteComponent,
});
