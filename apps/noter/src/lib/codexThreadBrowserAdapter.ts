import {
  type CodexAppServerThread,
  type CodexAppServerThreadItem,
} from "@/lib/codexAppServerResearch";
import {
  type ThreadBrowserItem,
  type ThreadBrowserThread,
} from "@/lib/threadBrowser";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readFirstNonEmptyLine(value: string): string {
  const firstLine = value
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine ?? value.trim();
}

export function codexThreadIsArchived(
  thread: Pick<CodexAppServerThread, "path">,
): boolean {
  const normalizedPath = thread.path?.split("\\").join("/");
  return normalizedPath?.includes("/archived_sessions/") ?? false;
}

export function toThreadBrowserItem(
  item: CodexAppServerThreadItem,
): ThreadBrowserItem {
  const rawItem = asRecord(item.raw);
  const rawText = readString(rawItem?.text);
  if (rawText) {
    return {
      id: item.id,
      type: item.type,
      summary: item.summary,
      text: rawText,
    };
  }

  const content = rawItem?.content;
  if (!Array.isArray(content)) {
    return {
      id: item.id,
      type: item.type,
      summary: item.summary,
      text: item.summary,
    };
  }

  const textParts = content
    .map((entry) => readString(asRecord(entry)?.text))
    .filter((text): text is string => text !== null && text.length > 0);

  return {
    id: item.id,
    type: item.type,
    summary: item.summary,
    text: textParts.length === 0 ? item.summary : textParts.join("\n"),
  };
}

export function toThreadBrowserThread(
  thread: CodexAppServerThread,
): ThreadBrowserThread {
  const explicitName = thread.name?.trim();
  const title =
    explicitName && explicitName.length > 0
      ? explicitName
      : readFirstNonEmptyLine(thread.preview);

  return {
    id: thread.id,
    title,
    preview: thread.preview,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    sourceLabel: thread.sourceLabel,
    statusLabel: thread.status.type,
    branch: thread.gitInfo?.branch ?? null,
    cwd: thread.cwd,
    path: thread.path,
    isArchived: codexThreadIsArchived(thread),
    project: {
      id: thread.project.id,
      label: thread.project.label,
      rootPath: thread.project.rootCwd,
    },
    workspace: {
      label: thread.workspace.label,
      isProjectRoot: thread.workspace.isProjectRoot,
    },
    turns: thread.turns.map((turn) => ({
      id: turn.id,
      status: turn.status,
      errorMessage: turn.errorMessage,
      items: turn.items.map(toThreadBrowserItem),
    })),
  };
}
