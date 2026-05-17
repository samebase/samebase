import type { CodexAppServerThread } from "#src/lib/codexAppServerResearch.ts";
import {
  buildCodexThreadSidebarViewModel,
  type CodexThreadSidebarProject,
  type CodexThreadSidebarThread,
} from "#src/lib/codexThreadSidebar.ts";

export type MachinesWorkspaceSidebarInventory = {
  hasLoadedThreadInventory: boolean;
  machineDisplayName: string;
  machineHostname: string;
  machineId: string;
  machineStatus: "online" | "offline";
  machineStatusReason: string | null;
  pinnedThreadIds: string[];
  threads: CodexAppServerThread[];
};

export type MachinesWorkspaceSidebarSection = {
  hasLoadedThreadInventory: boolean;
  machineDisplayName: string;
  machineHostname: string;
  machineId: string;
  machineStatus: "online" | "offline";
  machineStatusReason: string | null;
  pinnedThreads: CodexThreadSidebarThread[];
  projects: CodexThreadSidebarProject[];
  uniqueThreads: CodexAppServerThread[];
};

/**
 * `/machines` keeps one machine boundary above the existing Codex project and
 * pinned-thread grouping so the left rail can make per-machine ownership
 * visible without forking the proven per-machine sidebar logic.
 */
export function buildMachinesWorkspaceSidebarSections(args: {
  inventories: MachinesWorkspaceSidebarInventory[];
}): MachinesWorkspaceSidebarSection[] {
  return args.inventories.map((inventory) => {
    const sidebarViewModel = buildCodexThreadSidebarViewModel({
      pinnedThreadIds: inventory.pinnedThreadIds,
      threads: inventory.threads,
    });

    return {
      hasLoadedThreadInventory: inventory.hasLoadedThreadInventory,
      machineDisplayName: inventory.machineDisplayName,
      machineHostname: inventory.machineHostname,
      machineId: inventory.machineId,
      machineStatus: inventory.machineStatus,
      machineStatusReason: inventory.machineStatusReason,
      pinnedThreads: sidebarViewModel.pinnedThreads,
      projects: sidebarViewModel.projects,
      uniqueThreads: sidebarViewModel.uniqueThreads,
    };
  });
}
