import { describe, expect, it } from "vite-plus/test";
import type { CodexAppServerThread } from "@/codex/appServerResearch";
import { buildMachinesWorkspaceSidebarSections } from "@/lib/machinesWorkspaceSidebar";

const PROJECT_ROOT = "/Users/fixture/dev/noter";
const SECOND_PROJECT_ROOT = "/Users/fixture/dev/learn_vp";
const WORKTREE_ROOT = "/Users/fixture/.codex/worktrees/e2ca/noter";
const SESSION_ROOT = "/Users/fixture/.codex/sessions/2026/04/02";

function buildThread(args: {
  id: string;
  updatedAt: number;
  name: string;
  workspace?: {
    isProjectRoot: boolean;
    label: string | null;
  };
  project?: {
    id: string;
    label: string;
    rootCwd: string;
  };
}): CodexAppServerThread {
  return {
    agentNickname: null,
    agentRole: null,
    cliVersion: "0.117.0",
    createdAt: args.updatedAt - 60,
    cwd: args.workspace?.isProjectRoot === false ? WORKTREE_ROOT : PROJECT_ROOT,
    gitInfo: null,
    id: args.id,
    modelProvider: "openai",
    name: args.name,
    path: `${SESSION_ROOT}/${args.id}.jsonl`,
    preview: `${args.name} preview`,
    project: args.project ?? {
      id: PROJECT_ROOT,
      label: "noter",
      rootCwd: PROJECT_ROOT,
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
    updatedAt: args.updatedAt,
    workspace: args.workspace ?? {
      isProjectRoot: true,
      label: null,
    },
  };
}

describe("buildMachinesWorkspaceSidebarSections", () => {
  it("keeps pinned and project groups isolated per machine", () => {
    const firstMachinePinnedThread = buildThread({
      id: "thread-mac-pinned",
      name: "Mac pinned thread",
      updatedAt: 40,
    });
    const firstMachineWorktreeThread = buildThread({
      id: "thread-mac-worktree",
      name: "Mac worktree thread",
      updatedAt: 30,
      workspace: {
        isProjectRoot: false,
        label: "e2ca",
      },
    });
    const secondMachineThread = buildThread({
      id: "thread-windows-project",
      name: "Windows project thread",
      updatedAt: 20,
      project: {
        id: SECOND_PROJECT_ROOT,
        label: "learn_vp",
        rootCwd: SECOND_PROJECT_ROOT,
      },
    });

    const sections = buildMachinesWorkspaceSidebarSections({
      inventories: [
        {
          hasLoadedThreadInventory: true,
          machineDisplayName: "Research MacBook Pro",
          machineHostname: "research-mbp.local",
          machineId: "machine-mac",
          machineStatus: "online",
          machineStatusReason: null,
          pinnedThreadIds: [firstMachinePinnedThread.id],
          threads: [firstMachinePinnedThread, firstMachineWorktreeThread],
        },
        {
          hasLoadedThreadInventory: true,
          machineDisplayName: "Research Windows Workstation",
          machineHostname: "research-win.local",
          machineId: "machine-win",
          machineStatus: "online",
          machineStatusReason: null,
          pinnedThreadIds: [],
          threads: [secondMachineThread],
        },
      ],
    });

    expect(sections.map((section) => section.machineId)).toEqual(["machine-mac", "machine-win"]);
    expect(sections[0]?.pinnedThreads.map((thread) => thread.id)).toEqual([
      firstMachinePinnedThread.id,
    ]);
    expect(sections[0]?.projects[0]?.threads.map((thread) => thread.id)).toEqual([
      firstMachineWorktreeThread.id,
    ]);
    expect(sections[1]?.pinnedThreads).toEqual([]);
    expect(sections[1]?.projects.map((project) => project.label)).toEqual(["learn_vp"]);
  });

  it("preserves machine-level status metadata beside the derived thread groups", () => {
    const sections = buildMachinesWorkspaceSidebarSections({
      inventories: [
        {
          hasLoadedThreadInventory: false,
          machineDisplayName: "Offline Linux Box",
          machineHostname: "linux-box.local",
          machineId: "machine-linux",
          machineStatus: "offline",
          machineStatusReason: "Live control is unavailable for this machine right now.",
          pinnedThreadIds: [],
          threads: [],
        },
      ],
    });

    expect(sections[0]).toMatchObject({
      hasLoadedThreadInventory: false,
      machineDisplayName: "Offline Linux Box",
      machineHostname: "linux-box.local",
      machineId: "machine-linux",
      machineStatus: "offline",
      machineStatusReason: "Live control is unavailable for this machine right now.",
    });
  });
});
