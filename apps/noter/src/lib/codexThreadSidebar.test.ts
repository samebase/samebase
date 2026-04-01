import {
  buildCodexThreadSidebarViewModel,
  dedupeCodexThreadsById,
} from "@/lib/codexThreadSidebar";
import type { CodexAppServerThread } from "@/lib/codexAppServerResearch";
import { describe, expect, it } from "vitest";

const PROJECT_ROOT = "/Users/fixture/dev/noter";
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

describe("dedupeCodexThreadsById", () => {
  it("keeps the freshest copy for duplicate thread ids", () => {
    const staleThread = buildThread({
      id: "thread-1",
      name: "Research machines sidebar UI",
      updatedAt: 10,
    });
    const freshThread = buildThread({
      id: "thread-1",
      name: "Research machines sidebar UI",
      updatedAt: 25,
    });

    expect(dedupeCodexThreadsById([staleThread, freshThread])).toEqual([
      freshThread,
    ]);
  });
});

describe("buildCodexThreadSidebarViewModel", () => {
  it("preserves pinned order and exposes non-root worktree indicators", () => {
    const rootThread = buildThread({
      id: "thread-root",
      name: "Research sidebar resizing",
      updatedAt: 20,
    });
    const worktreeThread = buildThread({
      id: "thread-worktree",
      name: "Research machines sidebar UI",
      updatedAt: 15,
      workspace: {
        isProjectRoot: false,
        label: "e2ca",
      },
    });
    const pinnedThread = buildThread({
      id: "thread-pinned",
      name: "Add research to active PR",
      updatedAt: 30,
      workspace: {
        isProjectRoot: false,
        label: "e2ca",
      },
    });

    const viewModel = buildCodexThreadSidebarViewModel({
      loadedThreadIds: [worktreeThread.id],
      pinnedThreadIds: [pinnedThread.id],
      threads: [rootThread, worktreeThread, pinnedThread],
    });

    expect(viewModel.pinnedThreads.map((thread) => thread.id)).toEqual([
      pinnedThread.id,
    ]);
    expect(viewModel.pinnedThreads[0]?.isPinned).toBe(true);
    expect(viewModel.pinnedThreads[0]?.showWorkspaceIndicator).toBe(true);
    expect(viewModel.projects).toHaveLength(1);
    expect(viewModel.projects[0]?.threads.map((thread) => thread.id)).toEqual([
      rootThread.id,
      worktreeThread.id,
    ]);
    expect(viewModel.projects[0]?.threads[0]?.showWorkspaceIndicator).toBe(
      false,
    );
    expect(viewModel.projects[0]?.threads[1]?.showWorkspaceIndicator).toBe(
      true,
    );
    expect(viewModel.projects[0]?.threads[1]?.workspaceLabel).toBe("e2ca");
    expect(viewModel.projects[0]?.loadedCount).toBe(1);
  });

  it("orders projects by their latest unpinned thread activity", () => {
    const firstProjectThread = buildThread({
      id: "thread-first-project",
      name: "First project thread",
      updatedAt: 10,
      project: {
        id: "/Users/fixture/dev/namecheap",
        label: "namecheap-com-brandable",
        rootCwd: "/Users/fixture/dev/namecheap",
      },
    });
    const secondProjectThread = buildThread({
      id: "thread-second-project",
      name: "Second project thread",
      updatedAt: 25,
      project: {
        id: "/Users/fixture/dev/dotfiles",
        label: "dotfiles",
        rootCwd: "/Users/fixture/dev/dotfiles",
      },
    });

    const viewModel = buildCodexThreadSidebarViewModel({
      pinnedThreadIds: [],
      threads: [firstProjectThread, secondProjectThread],
    });

    expect(viewModel.projects.map((project) => project.label)).toEqual([
      "dotfiles",
      "namecheap-com-brandable",
    ]);
  });
});
