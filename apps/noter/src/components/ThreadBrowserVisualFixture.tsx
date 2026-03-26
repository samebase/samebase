import { ThreadBrowserView } from "@/components/ThreadBrowserView";
import {
  type ThreadBrowserThread,
  type ThreadBrowserTurn,
} from "@/lib/threadBrowser";

export type ThreadBrowserVisualMode = "thread-browser";

const FIXTURE_TURN: ThreadBrowserTurn = {
  id: "turn-fixture-1",
  status: "completed",
  errorMessage: null,
  items: [
    {
      id: "item-fixture-user",
      type: "userMessage",
      summary:
        "Keep the machine connector state local, but let the web UI browse and resume the same threads through a thin bridge.",
      text: "Keep the machine connector state local, but let the web UI browse and resume the same threads through a thin bridge.",
    },
    {
      id: "item-fixture-agent",
      type: "agentMessage",
      summary:
        "The browser should see the same thread inventory that the local runtime sees, including loaded sessions and archive state.",
      text: "The browser should see the same thread inventory that the local runtime sees, including loaded sessions and archive state.",
    },
  ],
};

const ACTIVE_THREADS: ThreadBrowserThread[] = [
  {
    id: "thread-browser-active",
    title: "Research remote machine connector",
    preview:
      "Figure out how a phone-facing web UI can see and control the same local machine threads without coupling the product to one provider forever.",
    cwd: "/Users/nicu/.codex/worktrees/5fed/noter",
    project: {
      id: "/Users/nicu/dev/my/noter",
      label: "noter",
      rootPath: "/Users/nicu/dev/my/noter",
    },
    workspace: {
      label: "5fed",
      isProjectRoot: false,
    },
    createdAt: 1_774_541_701,
    updatedAt: 1_774_541_762,
    sourceLabel: "desktop",
    statusLabel: "idle",
    branch: "codex/pr-research-automation",
    path: "/Users/nicu/.codex/sessions/2026/03/26/rollout-thread-browser-active.jsonl",
    isArchived: false,
    turns: [FIXTURE_TURN],
  },
  {
    id: "thread-browser-compare",
    title: "Add changed-files loading state",
    preview:
      "The changed-files view can take multiple seconds, so the loading state needs clearer copy and a stopwatch.",
    cwd: "/Users/nicu/.codex/worktrees/6257/noter",
    project: {
      id: "/Users/nicu/dev/my/noter",
      label: "noter",
      rootPath: "/Users/nicu/dev/my/noter",
    },
    workspace: {
      label: "6257",
      isProjectRoot: false,
    },
    createdAt: 1_774_538_096,
    updatedAt: 1_774_541_609,
    sourceLabel: "desktop",
    statusLabel: "notLoaded",
    branch: null,
    path: "/Users/nicu/.codex/sessions/2026/03/26/rollout-thread-browser-compare.jsonl",
    isArchived: false,
    turns: [],
  },
  {
    id: "thread-browser-ready",
    title: "Reply with READY",
    preview: "Reply with exactly READY and nothing else.",
    cwd: "/Users/nicu/.codex/worktrees/5fed/noter",
    project: {
      id: "/Users/nicu/dev/my/noter",
      label: "noter",
      rootPath: "/Users/nicu/dev/my/noter",
    },
    workspace: {
      label: "5fed",
      isProjectRoot: false,
    },
    createdAt: 1_774_538_016,
    updatedAt: 1_774_538_050,
    sourceLabel: "desktop",
    statusLabel: "notLoaded",
    branch: "codex/pr-research-automation",
    path: "/Users/nicu/.codex/sessions/2026/03/26/rollout-thread-browser-ready.jsonl",
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
            id: "/Users/nicu/dev/my/noter",
            label: "noter",
            detail: "/Users/nicu/dev/my/noter",
            count: 2,
            loadedCount: 0,
            threads: [ACTIVE_THREADS[1], ACTIVE_THREADS[2]],
          },
        ]}
        searchTerm=""
        loadedThreadIds={["thread-browser-active"]}
        selectedThreadId="thread-browser-active"
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
