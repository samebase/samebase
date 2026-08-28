import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Braces, Database, PanelLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExampleSidebarLayout } from "@/sidebars/ExampleSidebarLayout";

const PACKAGE_SECTIONS = [
  { entrypoint: "@samebase/sidebars/SidebarLayout", label: "Layout" },
  { entrypoint: "@samebase/sidebars/PaneFrame", label: "Pane frame" },
  { entrypoint: "@samebase/sidebars/SidebarRuntime", label: "Runtime" },
  { entrypoint: "@samebase/sidebars/SidebarLayoutState", label: "State" },
  { entrypoint: "@samebase/sidebars/SidebarLayoutPrehydration", label: "Prehydration" },
  { entrypoint: "@samebase/sidebars/SidebarLayoutGeometry", label: "Geometry" },
] as const;

function DocsNavigation() {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleSections = useMemo(
    () =>
      PACKAGE_SECTIONS.filter(
        ({ entrypoint, label }) =>
          normalizedQuery.length === 0 ||
          entrypoint.includes(normalizedQuery) ||
          label.toLocaleLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery],
  );

  return (
    <div className="example-sidebar-content">
      <Input
        aria-label="Filter package entrypoints"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter entrypoints"
        type="search"
        value={query}
      />
      <ul className="example-entrypoint-list">
        {visibleSections.map(({ entrypoint, label }) => (
          <li key={entrypoint}>
            <span>{label}</span>
            <code>{entrypoint}</code>
          </li>
        ))}
      </ul>
      {visibleSections.length === 0 ? (
        <p className="example-empty-state">No matching entrypoint.</p>
      ) : null}
    </div>
  );
}

function DocsGuide() {
  return (
    <main className="example-main-content">
      <div className="example-eyebrow">
        <Badge variant="secondary">one sidebar</Badge>
        <span>Route /docs</span>
      </div>
      <div className="example-page-heading">
        <h1>Build the shell in three layers.</h1>
        <p>
          The package owns geometry and interaction. The app owns pane content, visual styling, and
          durable state.
        </p>
      </div>

      <Tabs defaultValue="layout">
        <TabsList aria-label="Sidebar implementation layers" variant="line">
          <TabsTrigger value="layout">Layout</TabsTrigger>
          <TabsTrigger value="state">State</TabsTrigger>
          <TabsTrigger value="prehydration">Prehydration</TabsTrigger>
        </TabsList>
        <TabsContent value="layout">
          <section className="example-doc-section">
            <BookOpen />
            <div>
              <h2>Compose route-owned panes</h2>
              <p>
                Render <code>SidebarLayout</code> with a required main <code>PaneFrame</code>. Add
                left and right frames only on routes that use them.
              </p>
              <pre className="example-code-block">
                <code>{`<SidebarLayout
  left={<PaneFrame content={<Navigation />} />}
  main={<PaneFrame content={<Guide />} />}
/>`}</code>
              </pre>
            </div>
          </section>
        </TabsContent>
        <TabsContent value="state">
          <section className="example-doc-section">
            <Database />
            <div>
              <h2>Keep one controller above the routes</h2>
              <p>
                The root provider keeps one state object alive while route layouts mount and
                unmount. Width writes use the package's deferred mode. Open, pane, and merge writes
                are immediate.
              </p>
              <pre className="example-code-block">
                <code>{`<SidebarRuntimeProvider controller={controller}>
  <Outlet />
</SidebarRuntimeProvider>`}</code>
              </pre>
            </div>
          </section>
        </TabsContent>
        <TabsContent value="prehydration">
          <section className="example-doc-section">
            <Braces />
            <div>
              <h2>Apply saved geometry before React starts</h2>
              <p>
                The desktop script runs first, followed by the mobile pane script. Both use the same
                self-contained local storage reader as the runtime controller.
              </p>
              <pre className="example-code-block">
                <code>{`<SidebarLayout {...panes} />
<script dangerouslySetInnerHTML={{ __html: desktopScript }} />
<script dangerouslySetInnerHTML={{ __html: mobileScript }} />`}</code>
              </pre>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function DocsPage() {
  return (
    <ExampleSidebarLayout
      left={{
        content: <DocsNavigation />,
        footer: (
          <div className="example-pane-footer">
            <Badge variant="outline">localStorage</Badge>
            <span>Saved on this device</span>
          </div>
        ),
        header: (
          <div className="example-pane-header">
            <PanelLeft />
            <span>Package index</span>
          </div>
        ),
        scrollRestorationId: "docs-navigation",
      }}
      main={{
        content: <DocsGuide />,
        scrollRestorationId: "docs-main",
      }}
    />
  );
}

export const Route = createFileRoute("/docs")({
  component: DocsPage,
});
