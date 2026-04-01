import { type CodexAppServerThread } from "@/lib/codexAppServerResearch";

export type MachineThreadGroup = {
  id: string;
  label: string;
  detail: string;
  latestUpdatedAt: number;
  threads: CodexAppServerThread[];
};

export function dedupeMachineThreadsById(
  threads: CodexAppServerThread[],
): CodexAppServerThread[] {
  const threadsById = new Map<string, CodexAppServerThread>();

  for (const thread of threads) {
    const current = threadsById.get(thread.id);
    if (!current || thread.updatedAt > current.updatedAt) {
      threadsById.set(thread.id, thread);
    }
  }

  return Array.from(threadsById.values()).sort(
    (left, right) => right.updatedAt - left.updatedAt,
  );
}

export function buildMachineThreadGroups(args: {
  threads: CodexAppServerThread[];
}): MachineThreadGroup[] {
  const groupMap = new Map<string, MachineThreadGroup>();

  for (const thread of args.threads) {
    const current = groupMap.get(thread.project.id);

    if (current) {
      current.latestUpdatedAt = Math.max(
        current.latestUpdatedAt,
        thread.updatedAt,
      );
      current.threads.push(thread);
      continue;
    }

    groupMap.set(thread.project.id, {
      detail: thread.project.rootCwd,
      id: thread.project.id,
      label: thread.project.label,
      latestUpdatedAt: thread.updatedAt,
      threads: [thread],
    });
  }

  return Array.from(groupMap.values())
    .sort((left, right) => right.latestUpdatedAt - left.latestUpdatedAt)
    .map((group) => ({
      ...group,
      threads: group.threads.sort(
        (left, right) => right.updatedAt - left.updatedAt,
      ),
    }));
}
