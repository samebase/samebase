import { CodexThreadBrowserView } from "@/components/CodexThreadBrowserView";
import {
  type CodexAppServerThread,
  type CodexAppServerThreadTurn,
} from "@/lib/codexAppServerResearch";
import { buildCodexThreadSidebarViewModel } from "@/lib/codexThreadSidebar";

export type CodexThreadBrowserVisualMode = "codex-thread-browser";
const FIXTURE_RELATIVE_TIME_REFERENCE_MS = 1_774_541_762_000;

const FIXTURE_TURN_OLDER: CodexAppServerThreadTurn = {
  id: "turn-fixture-older",
  status: "completed",
  errorMessage: null,
  items: [
    {
      id: "item-fixture-user",
      type: "userMessage",
      summary:
        "Keep the Codex machine connector state local, but let the web UI browse and resume the same threads through the app-server bridge.",
      raw: {
        text: "Keep the Codex machine connector state local, but let the web UI browse and resume the same threads through the app-server bridge.",
      },
    },
    {
      id: "item-fixture-agent",
      type: "agentMessage",
      summary:
        "The browser should see the same provider thread inventory that Codex sees, including loaded sessions and archive state, without coupling Noter to provider-specific persistence internals.",
      raw: {
        text: "The browser should see the same provider thread inventory that Codex sees, including loaded sessions and archive state, without coupling Noter to provider-specific persistence internals.",
      },
    },
  ],
  raw: null,
};

const FIXTURE_TURN_LATEST: CodexAppServerThreadTurn = {
  id: "turn-fixture-latest",
  status: "completed",
  errorMessage: null,
  items: [
    {
      id: "item-fixture-user-latest",
      type: "userMessage",
      summary:
        "Add a browser-side prompt composer so I can continue the thread from my phone without opening the protocol lab.",
      raw: {
        text: "Add a browser-side prompt composer so I can continue the thread from my phone without opening the protocol lab.",
      },
    },
    {
      id: "item-fixture-agent-latest",
      type: "agentMessage",
      summary:
        "The thread browser can post directly to turn/start, then refresh the selected thread and keep only the latest turn expanded by default.",
      raw: {
        text: "The thread browser can post directly to turn/start, then refresh the selected thread and keep only the latest turn expanded by default.",
      },
    },
  ],
  raw: null,
};

const ACTIVE_THREADS: CodexAppServerThread[] = [
  {
    id: "thread-browser-active",
    name: "Research PR trigger automation",
    preview:
      "check latest pr created; it was created from noter.md ui and I need a local process that starts Codex, does the research, and updates the PR automatically.",
    cwd: "/Users/nicu/.codex/worktrees/5fed/noter",
    project: {
      id: "/Users/nicu/dev/my/noter",
      label: "noter",
      rootCwd: "/Users/nicu/dev/my/noter",
    },
    workspace: {
      label: "5fed",
      isProjectRoot: false,
    },
    createdAt: 1_774_541_701,
    updatedAt: 1_774_541_762,
    cliVersion: "0.117.0-alpha.10",
    modelProvider: "openai",
    sourceLabel: "vscode",
    source: "vscode",
    status: {
      type: "idle",
      activeFlags: [],
      raw: { type: "idle" },
    },
    gitInfo: {
      branch: "codex/pr-research-automation",
      originUrl: "git@github.com:noter-md/noter.git",
      sha: "a2bc5bdeff0eb8cbf7c05e0e8b8f2efbea234813",
    },
    path: "/Users/nicu/.codex/sessions/2026/03/26/rollout-thread-browser-active.jsonl",
    agentNickname: null,
    agentRole: null,
    turns: [FIXTURE_TURN_OLDER, FIXTURE_TURN_LATEST],
    raw: null,
  },
  {
    id: "thread-browser-compare",
    name: "Add changed-files loading state",
    preview:
      "the changed files view can take multiple seconds, so the loading state needs a clearer explanation and a stopwatch.",
    cwd: "/Users/nicu/.codex/worktrees/6257/noter",
    project: {
      id: "/Users/nicu/dev/my/noter",
      label: "noter",
      rootCwd: "/Users/nicu/dev/my/noter",
    },
    workspace: {
      label: "6257",
      isProjectRoot: false,
    },
    createdAt: 1_774_538_096,
    updatedAt: 1_774_541_609,
    cliVersion: "0.117.0-alpha.10",
    modelProvider: "openai",
    sourceLabel: "vscode",
    source: "vscode",
    status: {
      type: "notLoaded",
      activeFlags: [],
      raw: { type: "notLoaded" },
    },
    gitInfo: {
      branch: null,
      originUrl: "git@github.com:noter-md/noter.git",
      sha: "01158573a4261e7371f47ce3828523dc8c208ff5",
    },
    path: "/Users/nicu/.codex/sessions/2026/03/26/rollout-thread-browser-compare.jsonl",
    agentNickname: null,
    agentRole: null,
    turns: [],
    raw: null,
  },
  {
    id: "thread-browser-ready",
    name: null,
    preview: "Reply with exactly READY and nothing else.",
    cwd: "/Users/nicu/.codex/worktrees/5fed/noter",
    project: {
      id: "/Users/nicu/dev/my/noter",
      label: "noter",
      rootCwd: "/Users/nicu/dev/my/noter",
    },
    workspace: {
      label: "5fed",
      isProjectRoot: false,
    },
    createdAt: 1_774_538_016,
    updatedAt: 1_774_538_050,
    cliVersion: "0.114.0",
    modelProvider: "openai",
    sourceLabel: "vscode",
    source: "vscode",
    status: {
      type: "notLoaded",
      activeFlags: [],
      raw: { type: "notLoaded" },
    },
    gitInfo: {
      branch: "codex/pr-research-automation",
      originUrl: "git@github.com:noter-md/noter.git",
      sha: "3573f3d208e1bc84347c1c180aa22fae3f3c9590",
    },
    path: "/Users/nicu/.codex/sessions/2026/03/26/rollout-thread-browser-ready.jsonl",
    agentNickname: null,
    agentRole: null,
    turns: [],
    raw: null,
  },
];

const SIDEBAR_VIEW_MODEL = buildCodexThreadSidebarViewModel({
  loadedThreadIds: ["thread-browser-active"],
  pinnedThreadIds: ["thread-browser-active"],
  threads: ACTIVE_THREADS,
});

export function CodexThreadBrowserVisualFixture({ mode }: { mode: CodexThreadBrowserVisualMode }) {
  mode satisfies CodexThreadBrowserVisualMode;

  return (
    <div className="bg-slate-100 p-8 text-slate-950">
      <div
        data-testid="codex-thread-browser-visual-fixture"
        className="h-[1253px] w-[1280px] overflow-hidden"
      >
        <CodexThreadBrowserView
          browserMode="active"
          pinnedThreads={SIDEBAR_VIEW_MODEL.pinnedThreads}
          groups={SIDEBAR_VIEW_MODEL.projects}
          searchTerm=""
          loadedThreadIds={["thread-browser-active"]}
          selectedThreadId="thread-browser-active"
          selectedThread={ACTIVE_THREADS[0]}
          detailState={{ kind: "ready" }}
          errorMessage={null}
          isBusy={false}
          turnDraft="Continue from the phone: add the machine summary sync mutations next."
          fillViewport={false}
          relativeTimeReferenceMs={FIXTURE_RELATIVE_TIME_REFERENCE_MS}
        />
      </div>
    </div>
  );
}
