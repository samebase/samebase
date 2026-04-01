import { MemoryRouter } from "react-router-dom";
import { MachinesWorkspaceView } from "@/components/MachinesWorkspaceView";
import type { ConnectedMachineView } from "../../convex/connectedMachineModel";
import {
  type CodexAppServerThread,
  type CodexAppServerThreadTurn,
} from "@/lib/codexAppServerResearch";

const FIXTURE_RELATIVE_TIME_REFERENCE_MS = 1_775_541_762_000;

const FIXTURE_TURN_INITIAL: CodexAppServerThreadTurn = {
  errorMessage: null,
  id: "turn-machine-workspace-initial",
  items: [
    {
      id: "item-machine-workspace-user",
      type: "userMessage",
      summary:
        "Use the shared workspace shell for connected machines so the left rail can own thread browsing.",
      raw: {
        text: "Use the shared workspace shell for connected machines so the left rail can own thread browsing.",
      },
    },
    {
      id: "item-machine-workspace-agent",
      type: "agentMessage",
      summary:
        "Start with a sidebar-first route on `/machines`, keep the thread inventory on the left, and leave the main pane intentionally lightweight for the first slice.",
      raw: {
        text: "Start with a sidebar-first route on `/machines`, keep the thread inventory on the left, and leave the main pane intentionally lightweight for the first slice.",
      },
    },
  ],
  raw: null,
  status: "completed",
};

const FIXTURE_TURN_LATEST: CodexAppServerThreadTurn = {
  errorMessage: null,
  id: "turn-machine-workspace-latest",
  items: [
    {
      id: "item-machine-workspace-user-latest",
      type: "userMessage",
      summary:
        "Make the left sidebar feel closer to Codex: title, preview, relative time, and worktree context.",
      raw: {
        text: "Make the left sidebar feel closer to Codex: title, preview, relative time, and worktree context.",
      },
    },
    {
      id: "item-machine-workspace-agent-latest",
      type: "agentMessage",
      summary:
        "Use the existing machine-local thread inventory data, but render it through the shared route frame instead of the old research cards.",
      raw: {
        text: "Use the existing machine-local thread inventory data, but render it through the shared route frame instead of the old research cards.",
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
  cwd: "/Users/nicu/.codex/worktrees/e2ca/noter",
  gitInfo: {
    branch: "codex/connected-machines-sidebar-research",
    originUrl: "git@github.com:noter-md/noter.git",
    sha: "17844345696000a813f3a33feba0978077c27f34",
  },
  id: "thread-machine-workspace-primary",
  modelProvider: "openai",
  name: "Shared machines workspace",
  path: "/Users/nicu/.codex/sessions/2026/04/01/thread-machine-workspace-primary.jsonl",
  preview:
    "Build `/machines` on the shared workspace shell and keep the thread inventory in the left sidebar.",
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
    label: "e2ca",
  },
};

const SECONDARY_THREAD: CodexAppServerThread = {
  ...PRIMARY_THREAD,
  id: "thread-machine-workspace-secondary",
  name: "Machine URL redirect follow-up",
  path: "/Users/nicu/.codex/sessions/2026/04/01/thread-machine-workspace-secondary.jsonl",
  preview:
    "Redirect `/machines/:machineId/live` into the new workspace route so the old entrypoint stays compatible.",
  status: {
    activeFlags: [],
    raw: { type: "notLoaded" },
    type: "notLoaded",
  },
  turns: [],
  updatedAt: 1_775_541_720,
};

const TERTIARY_THREAD: CodexAppServerThread = {
  ...PRIMARY_THREAD,
  id: "thread-machine-workspace-tertiary",
  name: "Connected machine sidebar screenshot",
  path: "/Users/nicu/.codex/sessions/2026/04/01/thread-machine-workspace-tertiary.jsonl",
  preview:
    "Add screenshot coverage for the shipped sidebar-first machines workspace surface.",
  status: {
    activeFlags: [],
    raw: { type: "notLoaded" },
    type: "notLoaded",
  },
  turns: [],
  updatedAt: 1_775_541_680,
};

const FIXTURE_MACHINES: ConnectedMachineView[] = [
  {
    allowedRoots: ["/Users/nicu/dev/my/noter"],
    capabilities: ["presence", "liveControl"],
    connectorVersion: "0.3.0",
    controlStatus: "ready",
    controlStatusDetail: "Cloudflare tunnel healthy.",
    controlUrl: "https://machine-live-control.trycloudflare.com",
    controlUrlUpdatedAt: 1_775_541_600,
    displayName: "Nicu MacBook Pro",
    hostname: "nicu-mbp.local",
    lastSeenAt: 1_775_541_752,
    machineId: "machine-primary",
    os: "macos",
    status: "online",
  },
  {
    allowedRoots: ["/Users/nicu/dev/my/noter"],
    capabilities: ["presence"],
    connectorVersion: "0.3.0",
    controlStatus: "unavailable",
    controlStatusDetail: "Connector is online, but live control is paused.",
    controlUrl: undefined,
    controlUrlUpdatedAt: undefined,
    displayName: "Noter build box",
    hostname: "buildbox.local",
    lastSeenAt: 1_775_541_100,
    machineId: "machine-secondary",
    os: "linux",
    status: "online",
  },
];

export function MachinesWorkspaceVisualFixture() {
  return (
    <MemoryRouter>
      <div className="bg-slate-100 p-8 text-slate-950">
        <div className="h-[1253px] w-[1280px] overflow-hidden">
          <MachinesWorkspaceView
            dataTestId="machines-workspace-visual-fixture"
            machines={FIXTURE_MACHINES}
            selectedMachine={FIXTURE_MACHINES[0]}
            selectedMachineStatusReason={null}
            threads={[PRIMARY_THREAD, SECONDARY_THREAD, TERTIARY_THREAD]}
            pinnedThreadIds={[PRIMARY_THREAD.id]}
            loadedThreadIds={[PRIMARY_THREAD.id]}
            selectedThreadId={PRIMARY_THREAD.id}
            selectedThread={PRIMARY_THREAD}
            detailState={{ kind: "ready" }}
            searchTerm=""
            turnDraft="Continue from the machines workspace and tighten the sidebar copy next."
            errorMessage={null}
            isBusy={false}
            relativeTimeReferenceMs={FIXTURE_RELATIVE_TIME_REFERENCE_MS}
          />
        </div>
      </div>
    </MemoryRouter>
  );
}
