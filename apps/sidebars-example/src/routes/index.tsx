import { createFileRoute } from "@tanstack/react-router";
import { FileCode2, ListChecks, PanelRight, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ExampleSidebarLayout } from "@/sidebars/ExampleSidebarLayout";

const EXAMPLE_FILES = [
  "src/routes/index.tsx",
  "src/sidebars/ExampleSidebarLayout.tsx",
  "src/sidebars/exampleSidebarState.ts",
];
type ContentDensity = "compact" | "comfortable" | "spacious";

function readContentDensity(value: string | null): ContentDensity {
  if (value === "compact" || value === "spacious") {
    return value;
  }

  return "comfortable";
}

function FileNavigation() {
  const [query, setQuery] = useState("");
  const visibleFiles = EXAMPLE_FILES.filter((file) =>
    file.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  return (
    <div className="example-sidebar-content">
      <Input
        aria-label="Filter example files"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter files"
        type="search"
        value={query}
      />
      <ul className="example-file-list">
        {visibleFiles.map((file) => (
          <li key={file}>
            <FileCode2 />
            <span>{file}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExampleMain({ density }: { density: ContentDensity }) {
  const [completed, setCompleted] = useState([true, true, false]);
  const tasks = [
    "Render both sidebar panes",
    "Persist every durable state field",
    "Test the mobile pane controls",
  ];

  return (
    <main className="example-main-content" data-density={density}>
      <div className="example-eyebrow">
        <Badge variant="secondary">two sidebars</Badge>
        <span>Route /</span>
      </div>
      <div className="example-page-heading">
        <h1>A small, real workspace.</h1>
        <p>
          Resize both sidebars, hide either one, and reload the page. The layout saves its state on
          this device.
        </p>
      </div>

      <section className="example-main-section">
        <div className="example-section-heading">
          <ListChecks />
          <div>
            <h2>Consumer checklist</h2>
            <p>Toggle an item to model work that belongs in the main pane.</p>
          </div>
        </div>
        <div className="example-checklist">
          {tasks.map((task, index) => (
            <Label key={task}>
              <Checkbox
                checked={completed[index]}
                onCheckedChange={(checked) =>
                  setCompleted((current) =>
                    current.map((value, currentIndex) =>
                      currentIndex === index ? checked === true : value,
                    ),
                  )
                }
              />
              <span>{task}</span>
            </Label>
          ))}
        </div>
      </section>

      <div className="example-state-note">
        <strong>{completed.filter(Boolean).length} of 3 complete</strong>
        <span>Form values stay on this page. Sidebar geometry is saved separately.</span>
      </div>
    </main>
  );
}

function Inspector({
  density,
  setDensity,
}: {
  density: ContentDensity;
  setDensity: (density: ContentDensity) => void;
}) {
  const [showApiNote, setShowApiNote] = useState(true);

  return (
    <div className="example-inspector-content">
      <div className="example-field">
        <Label htmlFor="density">Content density</Label>
        <Select onValueChange={(value) => setDensity(readContentDensity(value))} value={density}>
          <SelectTrigger id="density">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="compact">Compact</SelectItem>
            <SelectItem value="comfortable">Comfortable</SelectItem>
            <SelectItem value="spacious">Spacious</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Label className="example-switch-field">
        <span>
          <strong>API note</strong>
          <small>Show the source of the live status rail.</small>
        </span>
        <Switch checked={showApiNote} onCheckedChange={setShowApiNote} />
      </Label>

      {showApiNote ? (
        <p className="example-api-note">
          The top rail reads <code>useSidebarLayoutPresentation()</code>.
        </p>
      ) : null}

      <div className="example-inspector-readout">
        <span>Density</span>
        <Badge variant="outline">{density}</Badge>
        <span>API note</span>
        <Badge variant="outline">{showApiNote ? "visible" : "hidden"}</Badge>
      </div>

      <Button
        onClick={() => {
          setDensity("comfortable");
          setShowApiNote(true);
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <RotateCcw data-icon="inline-start" />
        Reset inspector
      </Button>
    </div>
  );
}

function ExamplePage() {
  const [density, setDensity] = useState<ContentDensity>("comfortable");

  return (
    <ExampleSidebarLayout
      left={{
        content: <FileNavigation />,
        footer: <div className="example-pane-footer">3 example files</div>,
        header: <div className="example-pane-header">Files</div>,
        scrollRestorationId: "example-files",
      }}
      main={{
        content: <ExampleMain density={density} />,
        scrollRestorationId: "example-main",
      }}
      right={{
        content: <Inspector density={density} setDensity={setDensity} />,
        footer: (
          <div className="example-pane-footer">
            <Badge variant="outline">page state</Badge>
          </div>
        ),
        header: (
          <div className="example-pane-header">
            <PanelRight />
            <span>Inspector</span>
          </div>
        ),
        scrollRestorationId: "example-inspector",
      }}
    />
  );
}

export const Route = createFileRoute("/")({
  component: ExamplePage,
});
