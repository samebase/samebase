import { ThreadBrowserView } from "@/components/ThreadBrowserView";
import {
  type ThreadBrowserThread,
  type ThreadBrowserTurn,
} from "@/lib/threadBrowser";

export type ThreadBrowserVisualMode = "thread-browser";

const FIXTURE_TURN: ThreadBrowserTurn = {
  id: "turn-1",
  status: "completed",
  errorMessage: null,
  items: [
    {
      id: "user-1",
      type: "userMessage",
      summary:
        "Keep the machine connector local and browse the same threads from the web UI.",
      text: "Keep the machine connector local and browse the same threads from the web UI.",
    },
    {
      id: "agent-1",
      type: "agentMessage",
      summary:
        "The browser should see the same inventory, loaded sessions, and archive state.",
      text: "The browser should see the same inventory, loaded sessions, and archive state.",
    },
  ],
};

const ACTIVE_THREADS: ThreadBrowserThread[] = [
  {
    id: "thread-active",
    title: "Remote connector",
    preview:
      "Let the web UI browse and continue the same local machine thread.",
    cwd: "/workspace/noter",
    project: {
      id: "/workspace/noter",
      label: "noter",
      rootPath: "/workspace/noter",
    },
    workspace: {
      label: "wt-5fed",
      isProjectRoot: false,
    },
    createdAt: 1_774_541_701,
    updatedAt: 1_774_541_762,
    sourceLabel: "desktop",
    statusLabel: "idle",
    branch: "codex/research",
    path: "/workspace/.codex/active.jsonl",
    isArchived: false,
    turns: [FIXTURE_TURN],
  },
  {
    id: "thread-compare",
    title: "Changed-files loading",
    preview: "Clarify the loading state and keep a stopwatch visible.",
    cwd: "/workspace/noter",
    project: {
      id: "/workspace/noter",
      label: "noter",
      rootPath: "/workspace/noter",
    },
    workspace: {
      label: "wt-6257",
      isProjectRoot: false,
    },
    createdAt: 1_774_538_096,
    updatedAt: 1_774_541_609,
    sourceLabel: "desktop",
    statusLabel: "notLoaded",
    branch: null,
    path: "/workspace/.codex/compare.jsonl",
    isArchived: false,
    turns: [],
  },
  {
    id: "thread-ready",
    title: "Reply with READY",
    preview: "Reply with exactly READY and nothing else.",
    cwd: "/workspace/noter",
    project: {
      id: "/workspace/noter",
      label: "noter",
      rootPath: "/workspace/noter",
    },
    workspace: {
      label: "wt-5fed",
      isProjectRoot: false,
    },
    createdAt: 1_774_538_016,
    updatedAt: 1_774_538_050,
    sourceLabel: "desktop",
    statusLabel: "notLoaded",
    branch: "codex/research",
    path: "/workspace/.codex/ready.jsonl",
    isArchived: false,
    turns: [],
  },
];

export function ThreadBrowserVisualFixture({
  mode,
}: {
  mode: ThreadBrowserVisualMode;
}) {
  mode satisfies ThreadBrowserVisualMode;

  return (
    <div data-testid="thread-browser-visual-fixture">
      <ThreadBrowserView
        browserMode="active"
        pinnedThreads={[ACTIVE_THREADS[0]]}
        groups={[
          {
            id: "/workspace/noter",
            label: "noter",
            detail: "/workspace/noter",
            count: 2,
            loadedCount: 0,
            threads: [ACTIVE_THREADS[1], ACTIVE_THREADS[2]],
          },
        ]}
        searchTerm=""
        loadedThreadIds={["thread-active"]}
        selectedThreadId="thread-active"
        selectedThread={ACTIVE_THREADS[0]}
        detailState={{ kind: "ready" }}
        errorMessage={null}
        isBusy={false}
        eyebrow="Visual fixture"
        title="Thread browser"
        description="Reusable split view for browsing grouped threads and inspecting detail."
      />
    </div>
  );
}
