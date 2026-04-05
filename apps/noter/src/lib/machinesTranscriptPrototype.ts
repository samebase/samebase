import type {
  CodexAppServerStatusResponse,
  CodexAppServerThread,
} from "@/lib/codexAppServerResearch";
import {
  deriveCodexThreadTimelineEntries,
  type CodexThreadTimelineWorkEntry,
} from "@/lib/codexThreadTimeline";

export type MachinesTranscriptPrototypeBlock =
  | {
      kind: "message";
      id: string;
      from: "user" | "assistant";
      itemId?: string;
      itemType?: string;
      turnId?: string;
      body: string;
    }
  | {
      kind: "work";
      id: string;
      title: string;
      itemId?: string;
      itemType?: string;
      tone?: string;
      body: string;
    };

function summarizeWorkEntry(entry: CodexThreadTimelineWorkEntry): string {
  const changedFilesSummary =
    entry.changedFiles.length === 0
      ? null
      : entry.changedFiles.length === 1
        ? entry.changedFiles[0]
        : `${entry.changedFiles[0]} +${entry.changedFiles.length - 1} more`;
  const detail = entry.preview ?? changedFilesSummary;

  if (detail === null || detail.trim().length === 0) {
    return entry.title;
  }

  return `${entry.title}: ${detail}`;
}

export function buildMachinesTranscriptPrototypeBlocks(
  thread: CodexAppServerThread,
): MachinesTranscriptPrototypeBlock[] {
  return deriveCodexThreadTimelineEntries(thread).map((entry) => {
    if (entry.kind === "message") {
      return {
        body: entry.text,
        from: entry.role,
        id: entry.id,
        itemId: entry.item.id ?? undefined,
        itemType: entry.item.type,
        kind: "message",
        turnId:
          typeof entry.item.raw === "object" &&
          entry.item.raw !== null &&
          "turnId" in entry.item.raw &&
          typeof entry.item.raw.turnId === "string"
            ? entry.item.raw.turnId
            : undefined,
      };
    }

    const firstEntry = entry.entries[0];
    return {
      body: entry.entries.map(summarizeWorkEntry).join("\n\n"),
      id: entry.id,
      itemId: firstEntry.item.id ?? undefined,
      itemType: firstEntry.item.type,
      kind: "work",
      title: entry.entries.length === 1 ? firstEntry.title : "Work activity",
      tone: firstEntry.tone,
    };
  });
}

export function pickMachinesTranscriptPrototypeThreadId(args: {
  status: CodexAppServerStatusResponse;
  threads: readonly CodexAppServerThread[];
}): string | null {
  const currentThreadId = args.status.runtime.currentThreadId;
  if (typeof currentThreadId === "string" && currentThreadId.length > 0) {
    return currentThreadId;
  }

  const workspaceThread = args.threads.find(
    (thread) => thread.cwd === args.status.workspaceRoot,
  );
  if (workspaceThread) {
    return workspaceThread.id;
  }

  return args.threads[0]?.id ?? null;
}
