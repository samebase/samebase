import { CodeMirrorFileSurface } from "@/components/CodeMirrorFileSurface";
import { MonacoEditorSurface } from "@/components/MonacoEditorSurface";
import { AppPageFrame } from "@/components/AppPageFrame";
import { WorkspaceLayoutV2FullPage } from "@/components/workspace-layout-v2/WorkspaceLayoutV2";
export type WorkspaceLayoutV2VisualMode = "workspace-layout-v2-status-bar";

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

export function WorkspaceLayoutV2VisualFixture() {
  return (
    <AppPageFrame dataTestId="workspace-layout-v2-visual-fixture">
      <WorkspaceLayoutV2FullPage
        left={{
          headerTestId: "workspace-layout-v2-left-pane-header",
          content: (
            <CodeMirrorFileSurface
              dataTestId="workspace-layout-v2-prosemark-surface"
              filePath="workspace-layout-v2-notes.md"
              initialValue={FIXTURE_MARKDOWN}
            />
          ),
        }}
        main={{
          headerTestId: "workspace-layout-v2-main-pane-header",
          content: (
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
          ),
        }}
        right={{
          headerTestId: "workspace-layout-v2-right-pane-header",
          content: (
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
          ),
        }}
      />
    </AppPageFrame>
  );
}
