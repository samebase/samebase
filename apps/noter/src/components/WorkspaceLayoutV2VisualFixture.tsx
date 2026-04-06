import { PanelLeft } from "lucide-react";
import { CodeMirrorFileSurface } from "@/components/CodeMirrorFileSurface";
import { MonacoEditorSurface } from "@/components/MonacoEditorSurface";
import { SidebarProvider } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { WorkspaceLayoutV2PaneFrame } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import { WorkspaceLayoutV2PageFrame } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PageFrame";
import { WorkspaceLayoutV2TopBar } from "@/components/workspace-layout-v2/WorkspaceLayoutV2TopBar";
import { WorkspaceLayoutV2 } from "@/components/workspace-layout-v2/WorkspaceLayoutV2";
import { useSidebar } from "@/hooks/use-sidebar";

export type WorkspaceLayoutV2VisualMode =
  | "workspace-layout-v2-bare"
  | "workspace-layout-v2-status-bar";

const FIXTURE_MARKDOWN = `# Workspace Layout V2 Notes

This left editor uses ProseMark, and the text is intentionally long enough to
exercise vertical scrolling, horizontal drag handoff, and wrapped lines that
should stay readable even when the sidebar width changes during manual testing.

## Checklist

1. Confirm the left editor stays editable.
2. Confirm long wrapped lines do not overflow the pane width.
3. Confirm dragging horizontally from text can still move the mobile shell.
4. Confirm vertical scrolling remains local to the editor content.
5. Confirm the center Monaco pane keeps normal code-editor behavior.
6. Confirm the right Monaco pane can stay open without collapsing the layout.
7. Confirm desktop resize handles still feel precise with all three panes live.
8. Confirm mobile transitions do not lose editor focus unexpectedly.
9. Confirm line wrapping stays pleasant at narrow widths.
10. Confirm the shell still feels calm when the browser chrome changes height.

## Longer Notes

The goal of this fixture is to act like a durable reference scene for the
workspace shell, which means every pane should contain enough realistic content
to expose spacing bugs, drag bugs, viewport sizing bugs, and wrapped-line bugs.

The longest lines in this document are here on purpose so you can narrow the
sidebar and see whether the wrapped paragraphs remain comfortable, readable, and
stable while the surrounding shell geometry changes around the editor surface.

### Extra Lines

- line 01
- line 02
- line 03
- line 04
- line 05
- line 06
- line 07
- line 08
- line 09
- line 10
- line 11
- line 12
- line 13
- line 14
- line 15
- line 16
- line 17
- line 18
- line 19
- line 20
- line 21
- line 22
- line 23
- line 24
- line 25
- line 26
- line 27
- line 28
- line 29
- line 30
`;

const FIXTURE_MAIN_CODE = `type WorkspacePane = "left" | "main" | "right";

type WorkspaceFixtureSummary = {
  pane: WorkspacePane;
  title: string;
  description: string;
  checks: string[];
};

const sharedChecks = [
  "drag gestures should feel deliberate rather than sticky",
  "wrapped lines should remain readable even when the pane width gets tight",
  "viewport height changes from mobile browser chrome should not create page scroll",
  "resizing should keep the editor mounted and preserve interaction state",
];

function createPaneSummary(pane: WorkspacePane): WorkspaceFixtureSummary {
  return {
    pane,
    title: "Workspace fixture pane: " + pane,
    description:
      "This intentionally long line exists so Monaco wraps content and reveals whether the center pane still feels like a first-class editor surface when the layout narrows under pressure from live sidebars and mobile browser UI.",
    checks: sharedChecks.map(
      (check, index) => String(index + 1) + ". " + pane + ": " + check,
    ),
  };
}

function describeWorkspaceLayoutV2() {
  const panes: WorkspacePane[] = ["left", "main", "right"];
  return panes.map((pane) => createPaneSummary(pane));
}

function formatPaneSummary(summary: WorkspaceFixtureSummary) {
  return [
    "pane=" + summary.pane,
    "title=" + summary.title,
    "description=" + summary.description,
    ...summary.checks,
  ].join("\\n");
}

const summaries = describeWorkspaceLayoutV2();

for (const summary of summaries) {
  console.log(formatPaneSummary(summary));
}

export const workspaceLayoutFixture = {
  createdAt: "2026-04-05T22:05:00Z",
  mode: "workspace-layout-v2-bare",
  summaries,
};

export function findSummary(pane: WorkspacePane) {
  return workspaceLayoutFixture.summaries.find((summary) => summary.pane === pane);
}
`;

const FIXTURE_RIGHT_CODE = `interface ReviewThread {
  id: string;
  status: "open" | "resolved";
  title: string;
  note: string;
}

const reviewThreads: ReviewThread[] = [
  {
    id: "thread-01",
    status: "open",
    title: "Mobile viewport sizing",
    note: "Use a deliberately long sentence here so the right sidebar Monaco surface wraps lines and makes it obvious whether the narrow review pane still behaves like a comfortable code-reading environment.",
  },
  {
    id: "thread-02",
    status: "open",
    title: "Horizontal drag handoff",
    note: "The sidebar should stay interactive while horizontal touch gestures can still hand off to the shell when the user intent is clearly to move between panes.",
  },
  {
    id: "thread-03",
    status: "resolved",
    title: "Editor persistence",
    note: "Resizing and swiping should not remount the editor surface or lose the current interaction state.",
  },
];

function summarizeThread(thread: ReviewThread) {
  return thread.id + " " + thread.status + " " + thread.title + " :: " + thread.note;
}

export function summarizeOpenThreads() {
  return reviewThreads
    .filter((thread) => thread.status === "open")
    .map((thread) => summarizeThread(thread));
}

export function countResolvedThreads() {
  return reviewThreads.filter((thread) => thread.status === "resolved").length;
}

console.log(summarizeOpenThreads());
console.log("resolved=" + countResolvedThreads());
`;

const FIXTURE_VAULT_KEY = "workspace-layout-v2-fixture-vault";

function FixtureLeftPane() {
  return (
    <WorkspaceLayoutV2PaneFrame headerTestId="workspace-layout-v2-left-pane-header">
      <div
        data-testid="workspace-layout-v2-left-scroll-surface"
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <CodeMirrorFileSurface
          dataTestId="workspace-layout-v2-prosemark-surface"
          filePath="workspace-layout-v2-notes.md"
          initialValue={FIXTURE_MARKDOWN}
        />
      </div>
    </WorkspaceLayoutV2PaneFrame>
  );
}

function FixtureMainPaneHeader() {
  const { toggleLeftSidebar, toggleRightSidebar } = useSidebar();

  return (
    <div className="hidden justify-between md:flex">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Toggle Left Sidebar"
        className="h-8 w-8"
        onClick={toggleLeftSidebar}
      >
        <PanelLeft className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Toggle Right Sidebar"
        className="h-8 w-8"
        onClick={toggleRightSidebar}
      >
        <PanelLeft className="h-4 w-4 rotate-180" />
      </Button>
    </div>
  );
}

function FixtureMainPane() {
  return (
    <WorkspaceLayoutV2PaneFrame
      headerTestId="workspace-layout-v2-main-pane-header"
      header={<FixtureMainPaneHeader />}
    >
      <div className="min-h-0 flex-1">
        <MonacoEditorSurface
          branch="main"
          dataTestId="workspace-layout-v2-main-editor-surface"
          defaultValue={FIXTURE_MAIN_CODE}
          filePath="src/workspace-layout-v2-fixture.ts"
          onMount={() => {}}
          showMobileLineNumbers={false}
          syncError={null}
          vaultKey={FIXTURE_VAULT_KEY}
        />
      </div>
    </WorkspaceLayoutV2PaneFrame>
  );
}

function FixtureRightPane() {
  return (
    <WorkspaceLayoutV2PaneFrame headerTestId="workspace-layout-v2-right-pane-header">
      <div className="min-h-0 flex-1">
        <MonacoEditorSurface
          branch="main"
          dataTestId="workspace-layout-v2-right-editor-surface"
          defaultValue={FIXTURE_RIGHT_CODE}
          filePath="src/workspace-layout-v2-review.ts"
          onMount={() => {}}
          showMobileLineNumbers={false}
          syncError={null}
          vaultKey={FIXTURE_VAULT_KEY}
        />
      </div>
    </WorkspaceLayoutV2PaneFrame>
  );
}

function renderWorkspaceLayoutV2PaneFixture() {
  return (
    <SidebarProvider
      className="h-full min-h-0"
      defaultOpen={true}
      defaultLeftDesktopWidthPx={320}
      defaultLeftMobileWidthPx={320}
      defaultRightOpen={true}
      defaultRightDesktopWidthPx={320}
      defaultRightMobileWidthPx={320}
    >
      <WorkspaceLayoutV2
        dataTestId="workspace-layout-v2-fixture"
        left={<FixtureLeftPane />}
        main={<FixtureMainPane />}
        right={<FixtureRightPane />}
      />
    </SidebarProvider>
  );
}

function WorkspaceLayoutV2FixtureTopBar() {
  return (
    <WorkspaceLayoutV2TopBar dataTestId="workspace-layout-v2-top-bar">
      <div className="flex w-full justify-between gap-3">
        <div className="min-w-0 truncate">Workspace layout top bar</div>
        <div className="inline-flex gap-2 font-mono">
          <span>fixture</span>
          <span>chrome</span>
        </div>
      </div>
    </WorkspaceLayoutV2TopBar>
  );
}

export function WorkspaceLayoutV2VisualFixture({
  mode,
}: {
  mode: WorkspaceLayoutV2VisualMode;
}) {
  return (
    <WorkspaceLayoutV2PageFrame
      dataTestId="workspace-layout-v2-visual-fixture"
      topBar={
        mode === "workspace-layout-v2-status-bar" ? (
          <WorkspaceLayoutV2FixtureTopBar />
        ) : null
      }
    >
      {renderWorkspaceLayoutV2PaneFixture()}
    </WorkspaceLayoutV2PageFrame>
  );
}
