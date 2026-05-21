export type MachinesWorkspaceConversationEnvMode = "local" | "worktree";

export type MachinesWorkspaceProjectConversationSelection = {
  machineId: string;
  projectId: string;
  projectLabel: string;
  projectRootCwd: string;
  envMode: MachinesWorkspaceConversationEnvMode;
};

export function readMachinesWorkspaceConversationEnvLabel(
  mode: MachinesWorkspaceConversationEnvMode,
): string {
  return mode === "worktree" ? "New worktree" : "Local";
}

export function readMachinesWorkspaceConversationStartCopy(args: {
  envMode: MachinesWorkspaceConversationEnvMode;
  projectLabel: string;
}): string {
  if (args.envMode === "worktree") {
    return `Send the first prompt to create a new worktree conversation in ${args.projectLabel}.`;
  }

  return `Send the first prompt to start a local conversation in ${args.projectLabel}.`;
}

/**
 * Once the first prompt is accepted for a freshly started thread, the UI can
 * stop treating that selection as "pending start" and fall back to normal
 * selected-thread polling.
 */
export function startedDraftConversationThreadMatches(args: {
  nextThreadId: string | null;
  startedThreadId: string | null;
}): boolean {
  return args.startedThreadId !== null && args.nextThreadId === args.startedThreadId;
}
