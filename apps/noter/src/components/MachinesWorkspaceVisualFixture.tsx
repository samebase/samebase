import { MemoryRouter } from "react-router-dom";
import { MachinesWorkspaceView } from "@/components/MachinesWorkspaceView";
import {
  type CodexAppServerThread,
  type CodexAppServerThreadTurn,
} from "@/lib/codexAppServerResearch";

const FIXTURE_RELATIVE_TIME_REFERENCE_MS = 1_775_541_762_000;
const FIXTURE_WORKTREE_CWD = "/Users/fixture/.codex/worktrees/demo/noter";
const FIXTURE_PROJECT_ROOT = "/Users/fixture/dev/noter";
const FIXTURE_SECOND_PROJECT_ROOT = "/Users/fixture/dev/learn_vp";
const FIXTURE_SESSION_ROOT = "/Users/fixture/.codex/sessions/2026/04/01";
const FIXTURE_GIT_ORIGIN_URL = "git@github.com:fixture/noter.git";
const FIXTURE_BRANCH_NAME = "codex/machines-sidebar";
const FIXTURE_GIT_SHA = "abc123def4567890abc123def4567890abc123de";

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
        "Copy the Codex sidebar thread list exactly: no section labels, no search, and pin state shown inline with the title row.",
      raw: {
        text: "Copy the Codex sidebar thread list exactly: no section labels, no search, and pin state shown inline with the title row.",
      },
    },
    {
      id: "item-machine-workspace-command-latest",
      type: "commandExecution",
      summary: "pnpm exec playwright test machines-workspace",
      raw: {
        command:
          "pnpm exec playwright test apps/noter/e2e/machines-workspace-visual.spec.ts",
        cwd: FIXTURE_WORKTREE_CWD,
      },
    },
    {
      id: "item-machine-workspace-file-change-latest",
      type: "fileChange",
      summary: "2 changes",
      raw: {
        changes: [
          {
            path: "apps/noter/src/components/MachinesWorkspaceView.tsx",
          },
          {
            path: "apps/noter/src/components/MachinesWorkspaceThreadPane.tsx",
          },
        ],
      },
    },
    {
      id: "item-machine-workspace-agent-latest",
      type: "agentMessage",
      summary:
        "Flatten the list, keep the rail compact, and turn the main pane into a Codex-like timeline with grouped tool rows and a bottom composer.",
      raw: {
        text: "Flatten the list, keep the rail compact, and turn the main pane into a Codex-like timeline with grouped tool rows and a bottom composer.",
      },
    },
  ],
  raw: null,
  status: "completed",
};

const FIRST_THREAD: CodexAppServerThread = {
  agentNickname: null,
  agentRole: null,
  cliVersion: "0.117.0-alpha.10",
  createdAt: 1_775_541_200,
  cwd: FIXTURE_WORKTREE_CWD,
  gitInfo: {
    branch: FIXTURE_BRANCH_NAME,
    originUrl: FIXTURE_GIT_ORIGIN_URL,
    sha: FIXTURE_GIT_SHA,
  },
  id: "thread-machine-workspace-first",
  modelProvider: "openai",
  name: "Research sidebar resizing",
  path: `${FIXTURE_SESSION_ROOT}/thread-machine-workspace-first.jsonl`,
  preview:
    "Tighten the thread rail so the list behaves like Codex instead of a stack of research cards.",
  project: {
    id: FIXTURE_PROJECT_ROOT,
    label: "noter",
    rootCwd: FIXTURE_PROJECT_ROOT,
  },
  raw: null,
  source: "vscode",
  sourceLabel: "vscode",
  status: {
    activeFlags: [],
    raw: { type: "idle" },
    type: "idle",
  },
  turns: [],
  updatedAt: 1_775_541_282,
  workspace: {
    isProjectRoot: true,
    label: null,
  },
};

const SECOND_THREAD: CodexAppServerThread = {
  ...FIRST_THREAD,
  createdAt: 1_775_534_200,
  id: "thread-machine-workspace-second",
  name: "Research machines sidebar UI",
  path: `${FIXTURE_SESSION_ROOT}/thread-machine-workspace-second.jsonl`,
  preview:
    "Mirror the Codex thread rail more literally before adding any extra Noter structure around it.",
  status: {
    activeFlags: [],
    raw: { type: "idle" },
    type: "idle",
  },
  turns: [FIXTURE_TURN_INITIAL, FIXTURE_TURN_LATEST],
  updatedAt: 1_775_534_562,
};

const THIRD_THREAD: CodexAppServerThread = {
  ...FIRST_THREAD,
  createdAt: 1_775_476_200,
  id: "thread-machine-workspace-third",
  name: "Add research to active PR",
  path: `${FIXTURE_SESSION_ROOT}/thread-machine-workspace-third.jsonl`,
  preview:
    "Keep the PR thread visible in the same Codex-like rail without adding extra labels or helper copy.",
  status: {
    activeFlags: [],
    raw: { type: "notLoaded" },
    type: "notLoaded",
  },
  turns: [],
  updatedAt: 1_775_476_962,
  workspace: {
    isProjectRoot: false,
    label: "e2ca",
  },
};

const FOURTH_THREAD: CodexAppServerThread = {
  ...FIRST_THREAD,
  createdAt: 1_775_499_800,
  cwd: "/Users/fixture/.codex/worktrees/demo/learn_vp",
  gitInfo: {
    branch: "codex/flaky-screenshot-test",
    originUrl: "git@github.com:fixture/learn_vp.git",
    sha: "4ef567abc1234ef567abc1234ef567abc1234ef5",
  },
  id: "thread-machine-workspace-fourth",
  name: "Investigate flaky screenshot test",
  path: `${FIXTURE_SESSION_ROOT}/thread-machine-workspace-fourth.jsonl`,
  preview:
    "Check why the screenshot diff keeps shifting a pixel or two between runs.",
  project: {
    id: FIXTURE_SECOND_PROJECT_ROOT,
    label: "learn_vp",
    rootCwd: FIXTURE_SECOND_PROJECT_ROOT,
  },
  turns: [],
  updatedAt: 1_775_500_162,
  workspace: {
    isProjectRoot: true,
    label: null,
  },
};

const FIFTH_THREAD: CodexAppServerThread = {
  ...FOURTH_THREAD,
  createdAt: 1_775_420_000,
  id: "thread-machine-workspace-fifth",
  name: "Map PR 390 UI diagram",
  path: `${FIXTURE_SESSION_ROOT}/thread-machine-workspace-fifth.jsonl`,
  preview:
    "Lay out the sidebar structure before we connect the rest of the chat surface.",
  updatedAt: 1_775_420_262,
};

const SIXTH_THREAD: CodexAppServerThread = {
  ...FIRST_THREAD,
  createdAt: 1_775_520_000,
  cwd: "/Users/fixture/.codex/worktrees/e2ca/noter",
  gitInfo: {
    branch: "codex/worktree-sidebar",
    originUrl: FIXTURE_GIT_ORIGIN_URL,
    sha: "9ab456cdef78909ab456cdef78909ab456cdef78",
  },
  id: "thread-machine-workspace-sixth",
  name: "Investigate worktree sidebar state",
  path: `${FIXTURE_SESSION_ROOT}/thread-machine-workspace-sixth.jsonl`,
  preview:
    "Keep the project row stable while still showing which threads belong to a worktree checkout.",
  updatedAt: 1_775_520_262,
  workspace: {
    isProjectRoot: false,
    label: "e2ca",
  },
};

export function MachinesWorkspaceVisualFixture() {
  return (
    <MemoryRouter>
      <div className="bg-slate-100 p-8 text-slate-950">
        <div className="h-[420px] w-[960px] overflow-hidden">
          <MachinesWorkspaceView
            dataTestId="machines-workspace-visual-fixture"
            isSubmittingTurn={false}
            selectedMachineDisplayName="Research MacBook Pro"
            selectedMachineHostname="research-mbp.local"
            selectedMachineStatusReason={null}
            selectedThread={SECOND_THREAD}
            selectedThreadError={null}
            selectedThreadLoading={false}
            threads={[
              FIRST_THREAD,
              SECOND_THREAD,
              THIRD_THREAD,
              FOURTH_THREAD,
              FIFTH_THREAD,
              SIXTH_THREAD,
            ]}
            pinnedThreadIds={[SECOND_THREAD.id, THIRD_THREAD.id]}
            selectedThreadId={SECOND_THREAD.id}
            relativeTimeReferenceMs={FIXTURE_RELATIVE_TIME_REFERENCE_MS}
            turnDraft="Continue with the main pane chat surface."
            onTurnDraftChange={() => {}}
            onTurnSubmit={() => {}}
          />
        </div>
      </div>
    </MemoryRouter>
  );
}
