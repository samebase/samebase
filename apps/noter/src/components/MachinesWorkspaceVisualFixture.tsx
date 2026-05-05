import { useMemo, useRef, useState } from "react";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";
import {
  MACHINES_WORKSPACE_LEFT_SIDEBAR_WIDTH_PX,
  MachinesWorkspaceView,
} from "@/components/MachinesWorkspaceView";
import { SidebarHomeAccountHeader } from "@/components/SidebarHomeAccountHeader";
import { WorkspaceLayoutV2MemorySidebarProvider } from "@/components/workspace-layout-v2/WorkspaceLayoutV2MemorySidebarProvider";
import {
  type CodexAppServerThread,
  type CodexAppServerThreadTurn,
} from "@/lib/codexAppServerResearch";
import type { MachinesWorkspaceProjectConversationSelection } from "@/lib/machinesWorkspaceConversation";
import { DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX } from "@/lib/workspacePaneSizes";

const FIXTURE_RELATIVE_TIME_REFERENCE_MS = 1_775_541_762_000;
const FIXTURE_WORKTREE_CWD = "/Users/fixture/.codex/worktrees/demo/noter";
const FIXTURE_PROJECT_ROOT = "/Users/fixture/dev/noter";
const FIXTURE_SECOND_PROJECT_ROOT = "/Users/fixture/dev/learn_vp";
const FIXTURE_SESSION_ROOT = "/Users/fixture/.codex/sessions/2026/04/01";
const FIXTURE_GIT_ORIGIN_URL = "git@github.com:fixture/noter.git";
const FIXTURE_BRANCH_NAME = "codex/machines-sidebar";
const FIXTURE_GIT_SHA = "abc123def4567890abc123def4567890abc123de";
const LONG_CLAMP_THREAD_NAME =
  "Research machines sidebar UI with pinned worktree labels, branch indicators, and overflowing thread titles that must truncate after exactly two lines";

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
        text: `Use the shared workspace shell for connected machines so the left rail can own thread browsing.

- Keep the main pane quiet.
- Keep the composer pinned.`,
      },
    },
    {
      id: "item-machine-workspace-agent",
      type: "agentMessage",
      summary:
        "Start with a sidebar-first route on `/machines`, keep the thread inventory on the left, and leave the main pane intentionally lightweight for the first slice.",
      raw: {
        text: `Start with a sidebar-first route on \`/machines\`, keep the thread inventory on the left, and leave the main pane intentionally lightweight for the first slice.

- Keep tool rows compact.
- Keep the bottom composer visible.`,
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
        text: `Copy the Codex sidebar thread list exactly:

- no section labels
- no search
- pin state inline with the title row`,
      },
    },
    {
      id: "item-machine-workspace-reasoning-latest",
      type: "reasoning",
      summary:
        "Compare the shared shell against Codex before adding extra chrome.",
      raw: {
        summary: [
          "Compare the shared shell against Codex before adding extra chrome.",
        ],
      },
    },
    {
      id: "item-machine-workspace-tool-call-latest",
      type: "mcpToolCall",
      summary: "github/fetch_pr",
      raw: {
        server: "github",
        tool: "fetch_pr",
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
        text: `Flatten the list, keep the rail compact, and turn the main pane into a Codex-like timeline with grouped tool rows and a bottom composer.

Use the same readonly ProseMark surface that Noter already trusts for chat messages.`,
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
  name: LONG_CLAMP_THREAD_NAME,
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
  const [machineThreads, setMachineThreads] = useState<
    Record<string, CodexAppServerThread[]>
  >({
    "machine-mac": [FIRST_THREAD, SECOND_THREAD, THIRD_THREAD],
    "machine-win": [FOURTH_THREAD, FIFTH_THREAD, SIXTH_THREAD],
  });
  const [pendingConversation, setPendingConversation] =
    useState<MachinesWorkspaceProjectConversationSelection | null>(null);
  const [selectedMachineId, setSelectedMachineId] =
    useState<string>("machine-mac");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    SECOND_THREAD.id,
  );
  const [turnDraft, setTurnDraft] = useState("");
  const [machinePinnedThreadIds, setMachinePinnedThreadIds] = useState<
    Record<string, string[]>
  >({
    "machine-mac": [SECOND_THREAD.id, THIRD_THREAD.id],
    "machine-win": [FOURTH_THREAD.id],
  });
  const createdThreadCountRef = useRef(0);
  const selectedThread = useMemo(
    () =>
      Object.values(machineThreads)
        .flat()
        .find((thread) => thread.id === selectedThreadId) ?? null,
    [machineThreads, selectedThreadId],
  );
  const selectedMachineDisplayName =
    selectedMachineId === "machine-win"
      ? "Research Windows Workstation"
      : "Research MacBook Pro";
  const selectedMachineHostname =
    selectedMachineId === "machine-win"
      ? "research-win.local"
      : "research-mbp.local";
  const handleThreadPinChange = (args: {
    machineId: string;
    nextPinned: boolean;
    threadId: string;
  }) => {
    setMachinePinnedThreadIds((currentPinnedThreadIds) => {
      const machinePinnedIds = currentPinnedThreadIds[args.machineId] ?? [];

      return {
        ...currentPinnedThreadIds,
        [args.machineId]: args.nextPinned
          ? [
              args.threadId,
              ...machinePinnedIds.filter(
                (currentThreadId) => currentThreadId !== args.threadId,
              ),
            ]
          : machinePinnedIds.filter(
              (currentThreadId) => currentThreadId !== args.threadId,
            ),
      };
    });
  };
  const handleProjectStartConversation = (
    args: MachinesWorkspaceProjectConversationSelection,
  ) => {
    setPendingConversation(args);
    setSelectedMachineId(args.machineId);
    setSelectedThreadId(null);
    setTurnDraft("");
  };
  const handleTurnSubmit = () => {
    if (pendingConversation === null || turnDraft.trim().length === 0) {
      return;
    }

    createdThreadCountRef.current += 1;
    const nextId = `thread-machine-workspace-created-${createdThreadCountRef.current}`;
    const nextUpdatedAt =
      FIXTURE_RELATIVE_TIME_REFERENCE_MS +
      createdThreadCountRef.current * 60_000;
    const worktreeLabel =
      pendingConversation.envMode === "worktree"
        ? `m${createdThreadCountRef.current.toString().padStart(3, "0")}`
        : null;
    const nextTurn: CodexAppServerThreadTurn = {
      errorMessage: null,
      id: `turn-${nextId}`,
      items: [
        {
          id: `user-${nextId}`,
          raw: {
            text: turnDraft.trim(),
          },
          summary: turnDraft.trim(),
          type: "userMessage",
        },
        {
          id: `assistant-${nextId}`,
          raw: {
            text:
              pendingConversation.envMode === "worktree"
                ? "WORKTREE READY"
                : "LOCAL READY",
          },
          summary:
            pendingConversation.envMode === "worktree"
              ? "WORKTREE READY"
              : "LOCAL READY",
          type: "agentMessage",
        },
      ],
      raw: null,
      status: "completed",
    };
    const nextThread: CodexAppServerThread = {
      ...FIRST_THREAD,
      createdAt: nextUpdatedAt,
      cwd:
        pendingConversation.envMode === "worktree" && worktreeLabel !== null
          ? `/Users/fixture/.codex/worktrees/${worktreeLabel}/${pendingConversation.projectLabel}`
          : pendingConversation.projectRootCwd,
      id: nextId,
      gitInfo:
        pendingConversation.envMode === "worktree"
          ? {
              branch: `codex/machine-${createdThreadCountRef.current}`,
              originUrl: FIXTURE_GIT_ORIGIN_URL,
              sha: FIXTURE_GIT_SHA,
            }
          : FIRST_THREAD.gitInfo,
      name:
        pendingConversation.envMode === "worktree"
          ? `New worktree conversation ${createdThreadCountRef.current}`
          : `New local conversation ${createdThreadCountRef.current}`,
      path: `${FIXTURE_SESSION_ROOT}/${nextId}.jsonl`,
      preview: turnDraft.trim(),
      project: {
        id: pendingConversation.projectId,
        label: pendingConversation.projectLabel,
        rootCwd: pendingConversation.projectRootCwd,
      },
      turns: [nextTurn],
      updatedAt: nextUpdatedAt,
      workspace: {
        isProjectRoot: pendingConversation.envMode !== "worktree",
        label: worktreeLabel,
      },
    };

    setMachineThreads((currentThreads) => ({
      ...currentThreads,
      [pendingConversation.machineId]: [
        nextThread,
        ...(currentThreads[pendingConversation.machineId] ?? []),
      ],
    }));
    setPendingConversation(null);
    setSelectedMachineId(pendingConversation.machineId);
    setSelectedThreadId(nextId);
    setTurnDraft("");
  };

  const initialSidebarState = {
    leftDesktopOpen: true,
    leftDesktopWidthPx: MACHINES_WORKSPACE_LEFT_SIDEBAR_WIDTH_PX,
    leftMobileWidthPx: MACHINES_WORKSPACE_LEFT_SIDEBAR_WIDTH_PX,
    mobilePane: "main",
    rightDesktopOpen: false,
    rightDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
    rightMobileWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  } satisfies WorkspaceSidebarState;

  return (
    <TestRouterProvider>
      <WorkspaceLayoutV2MemorySidebarProvider
        initialState={initialSidebarState}
      >
        <div className="bg-slate-100 p-8 text-slate-950">
          <div
            data-testid="machines-workspace-visual-fixture-page"
            className="flex h-[420px] w-[960px] flex-col overflow-hidden"
          >
            <MachinesWorkspaceView
              dataTestId="machines-workspace-visual-fixture"
              isSubmittingTurn={false}
              leftSidebarHeader={
                <SidebarHomeAccountHeader userDisplayName="nicu@noter.md" />
              }
              machineInventories={[
                {
                  hasLoadedThreadInventory: true,
                  machineDisplayName: "Research MacBook Pro",
                  machineHostname: "research-mbp.local",
                  machineId: "machine-mac",
                  machineStatus: "online",
                  machineStatusReason: null,
                  pinnedThreadIds: machinePinnedThreadIds["machine-mac"] ?? [],
                  threads: machineThreads["machine-mac"],
                },
                {
                  hasLoadedThreadInventory: true,
                  machineDisplayName: "Research Windows Workstation",
                  machineHostname: "research-win.local",
                  machineId: "machine-win",
                  machineStatus: "online",
                  machineStatusReason: null,
                  pinnedThreadIds: machinePinnedThreadIds["machine-win"] ?? [],
                  threads: machineThreads["machine-win"],
                },
              ]}
              hasPendingStartedThread={false}
              pendingPinThreadKey={null}
              pendingConversation={
                pendingConversation?.machineId === selectedMachineId
                  ? {
                      envMode: pendingConversation.envMode,
                      machineId: pendingConversation.machineId,
                      projectId: pendingConversation.projectId,
                      projectLabel: pendingConversation.projectLabel,
                      projectRootCwd: pendingConversation.projectRootCwd,
                    }
                  : null
              }
              selectedMachineId={selectedMachineId}
              selectedMachineDisplayName={selectedMachineDisplayName}
              selectedMachineHostname={selectedMachineHostname}
              selectedMachineStatusReason={null}
              selectedThread={selectedThread}
              selectedThreadError={null}
              selectedThreadLoading={false}
              selectedThreadId={selectedThreadId}
              relativeTimeReferenceMs={FIXTURE_RELATIVE_TIME_REFERENCE_MS}
              turnDraft={turnDraft}
              onProjectStartConversation={handleProjectStartConversation}
              onTurnDraftChange={setTurnDraft}
              onTurnSubmit={handleTurnSubmit}
              onThreadPinChange={handleThreadPinChange}
              onThreadSelect={({ machineId, threadId }) => {
                setPendingConversation(null);
                setSelectedMachineId(machineId);
                setSelectedThreadId(threadId);
              }}
            />
          </div>
        </div>
      </WorkspaceLayoutV2MemorySidebarProvider>
    </TestRouterProvider>
  );
}
