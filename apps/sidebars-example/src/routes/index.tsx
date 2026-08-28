import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Boxes, PanelLeft, PanelRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExampleSidebarLayout } from "@/sidebars/ExampleSidebarLayout";

function OverviewPage() {
  return (
    <ExampleSidebarLayout
      main={{
        content: (
          <main className="example-main-content example-overview">
            <div className="example-eyebrow">
              <Badge variant="secondary">main only</Badge>
              <span>Route /</span>
            </div>
            <div className="example-hero-copy">
              <h1>One layout, zero to two sidebars.</h1>
              <p>
                This app uses the public package API, app-owned styling, and local storage. Change
                the sidebars on another route, return here, and then go back. The saved layout stays
                intact even when this route has no sidebars to show.
              </p>
            </div>

            <div className="example-shape-grid">
              <article>
                <Boxes />
                <div>
                  <h2>Main only</h2>
                  <p>This route proves that a consumer can use the layout without a sidebar.</p>
                </div>
              </article>
              <article>
                <PanelLeft />
                <div>
                  <h2>One sidebar</h2>
                  <p>Docs adds route-owned navigation on the left.</p>
                </div>
              </article>
              <article>
                <PanelRight />
                <div>
                  <h2>Two sidebars</h2>
                  <p>Workbench adds both navigation and an inspector.</p>
                </div>
              </article>
            </div>

            <div className="example-callout">
              <div>
                <h2>Start with the one-sidebar case</h2>
                <p>Resize it on desktop, or swipe to it and resize it on mobile.</p>
              </div>
              <Button nativeButton={false} render={<Link to="/docs" />}>
                Open docs
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </main>
        ),
        scrollRestorationId: "overview-main",
      }}
    />
  );
}

export const Route = createFileRoute("/")({
  component: OverviewPage,
});
