import { CodexThreadBrowserView } from "@/components/CodexThreadBrowserView";
import {
  type CodexAppServerThread,
  type CodexAppServerThreadTurn,
} from "@/lib/codexAppServerResearch";

const FIXTURE_RELATIVE_TIME_REFERENCE_MS = 1_775_541_762_000;

const FIXTURE_TURN_INITIAL: CodexAppServerThreadTurn = {
  errorMessage: null,
  id: "turn-machine-live-initial",
  items: [
    {
      id: "item-machine-live-user",
      type: "userMessage",
      summary:
        "I only need the first MVP: connect a machine, open noter on my phone, and continue a local Codex thread.",
      raw: {
        text: "I only need the first MVP: connect a machine, open noter on my phone, and continue a local Codex thread.",
      },
    },
    {
      id: "item-machine-live-agent",
      type: "agentMessage",
      summary:
        "The phone page can mint a short-lived machine-control token, call the local tunnel directly, and render the same Codex thread history without syncing it to Convex first.",
      raw: {
        text: "The phone page can mint a short-lived machine-control token, call the local tunnel directly, and render the same Codex thread history without syncing it to Convex first.",
      },
    },
  ],
  raw: null,
  status: "completed",
};

const FIXTURE_TURN_LATEST: CodexAppServerThreadTurn = {
  errorMessage: null,
  id: "turn-machine-live-latest",
  items: [
    {
      id: "item-machine-live-user-latest",
      type: "userMessage",
      summary:
        "Show me the full phone walkthrough from connect machine through opening the selected thread.",
      raw: {
        text: "Show me the full phone walkthrough from connect machine through opening the selected thread.",
      },
    },
    {
      id: "item-machine-live-agent-latest",
      type: "agentMessage",
      summary:
        "Use `/machines/:machineId/live` for the browser surface and keep the machine-local service behind short-lived bearer tokens plus Cloudflare quick tunnel auth checks.",
      raw: {
        text: "Use `/machines/:machineId/live` for the browser surface and keep the machine-local service behind short-lived bearer tokens plus Cloudflare quick tunnel auth checks.",
      },
    },
  ],
  raw: null,
  status: "completed",
};

const PRIMARY_THREAD: CodexAppServerThread = {
  agentNickname: null,
  agentRole: null,
  cliVersion: "0.117.0-alpha.10",
  createdAt: 1_775_541_701,
  cwd: "/Users/nicu/.codex/worktrees/f7c6/noter",
  gitInfo: {
    branch: "codex/pr-390-readiness",
    originUrl: "git@github.com:noter-md/noter.git",
    sha: "23de029b7ee60057f2a690ea53082e6a2f851806",
  },
  id: "thread-machine-live-primary",
  modelProvider: "openai",
  name: "PR #390 live-control rollout",
  path: "/Users/nicu/.codex/sessions/2026/03/31/thread-machine-live-primary.jsonl",
  preview:
    "Turn the connected-machine presence slice into a real tunneled live-control MVP I can use from my phone.",
  project: {
    id: "/Users/nicu/dev/my/noter",
    label: "noter",
    rootCwd: "/Users/nicu/dev/my/noter",
  },
  raw: null,
  source: "vscode",
  sourceLabel: "vscode",
  status: {
    activeFlags: [],
    raw: { type: "idle" },
    type: "idle",
  },
  turns: [FIXTURE_TURN_INITIAL, FIXTURE_TURN_LATEST],
  updatedAt: 1_775_541_762,
  workspace: {
    isProjectRoot: false,
    label: "f7c6",
  },
};

const SECONDARY_THREAD: CodexAppServerThread = {
  ...PRIMARY_THREAD,
  id: "thread-machine-live-secondary",
  name: "Token introspection fail-closed check",
  path: "/Users/nicu/.codex/sessions/2026/03/31/thread-machine-live-secondary.jsonl",
  preview:
    "Make the local service refuse stale bearer tokens and stop publishing the tunnel when auth isn’t healthy.",
  status: {
    activeFlags: [],
    raw: { type: "notLoaded" },
    type: "notLoaded",
  },
  turns: [],
  updatedAt: 1_775_541_720,
};

export function MachineLiveControlVisualFixture() {
  return (
    <div className="bg-slate-100 p-8 text-slate-950">
      <div
        data-testid="machine-live-control-visual-fixture"
        className="h-[1253px] w-[1280px] overflow-hidden"
      >
        <CodexThreadBrowserView
          allowArchivedMode={false}
          browserMode="active"
          detailState={{ kind: "ready" }}
          errorMessage={null}
          fillViewport={false}
          groups={[
            {
              count: 1,
              detail: "/Users/nicu/dev/my/noter",
              id: "/Users/nicu/dev/my/noter",
              label: "noter",
              loadedCount: 0,
              threads: [SECONDARY_THREAD],
            },
          ]}
          headingDescription="nicu-mbp.local · live control ready"
          headingEyebrow="Connected machine"
          headingTitle="Nicu MacBook Pro"
          isBusy={false}
          loadedThreadIds={["thread-machine-live-primary"]}
          pinnedThreads={[PRIMARY_THREAD]}
          relativeTimeReferenceMs={FIXTURE_RELATIVE_TIME_REFERENCE_MS}
          searchTerm=""
          selectedThread={PRIMARY_THREAD}
          selectedThreadId="thread-machine-live-primary"
          turnDraft="Continue from my phone and finish the machine tunnel rollout."
        />
      </div>
    </div>
  );
}
