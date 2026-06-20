import { notEmpty } from "@samebase/dependent";
import type {
  CodexAppServerThread,
  CodexAppServerThreadItem,
  CodexAppServerThreadTurn,
} from "@/codex/appServerResearch";

export type CodexThreadTimelineMessageEntry = {
  kind: "message";
  id: string;
  role: "user" | "assistant";
  text: string;
  item: CodexAppServerThreadItem;
};

export type CodexThreadTimelineWorkTone = "tool" | "info" | "error";

export type CodexThreadTimelineWorkCategory = "tool" | "info";

export type CodexThreadTimelineWorkEntry = {
  category: CodexThreadTimelineWorkCategory;
  id: string;
  item: CodexAppServerThreadItem;
  tone: CodexThreadTimelineWorkTone;
  title: string;
  preview: string | null;
  changedFiles: string[];
};

export type CodexThreadTimelineWorkGroupEntry = {
  kind: "work";
  id: string;
  entries: CodexThreadTimelineWorkEntry[];
};

export type CodexThreadTimelineEntry =
  | CodexThreadTimelineMessageEntry
  | CodexThreadTimelineWorkGroupEntry;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readTextContent(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => readString(asRecord(entry)?.text))
    .filter(notEmpty)
    .filter((text) => text.trim().length > 0);
}

/**
 * Thread items can expose their text either directly or through content parts.
 * Collapse both shapes into one display string so timeline rendering stays
 * stable across provider payload variants.
 */
export function readCodexThreadItemDisplayText(item: CodexAppServerThreadItem): string | null {
  const rawItem = asRecord(item.raw);
  const directText = readString(rawItem?.text);
  if (directText && directText.trim().length > 0) {
    return directText;
  }

  const contentParts = readTextContent(rawItem?.content);
  if (contentParts.length > 0) {
    return contentParts.join("\n");
  }

  return item.summary;
}

function readMessageRole(item: CodexAppServerThreadItem): "user" | "assistant" | null {
  if (item.type === "userMessage") {
    return "user";
  }

  if (item.type === "agentMessage" || item.type === "assistantMessage") {
    return "assistant";
  }

  return null;
}

function humanizeItemType(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function readChangedFiles(item: CodexAppServerThreadItem): string[] {
  const rawItem = asRecord(item.raw);
  const changes = rawItem?.changes;
  if (!Array.isArray(changes)) {
    return [];
  }

  return changes
    .map((change) => readString(asRecord(change)?.path))
    .filter(notEmpty)
    .filter((path) => path.length > 0);
}

function itemTypeIsToolActivity(itemType: string): boolean {
  return (
    itemType === "commandExecution" ||
    itemType === "fileChange" ||
    itemType === "fileRead" ||
    itemType === "webSearch" ||
    itemType === "imageView" ||
    itemType === "imageGeneration" ||
    itemType.toLowerCase().includes("tool")
  );
}

function readToolIdentity(item: CodexAppServerThreadItem): string | null {
  const rawItem = asRecord(item.raw);
  if (item.type === "mcpToolCall") {
    const server = readString(rawItem?.server);
    const tool = readString(rawItem?.tool);
    if (server && tool) {
      return `${server}/${tool}`;
    }

    return server ?? tool ?? null;
  }

  return readString(rawItem?.tool);
}

function readWorkTitle(item: CodexAppServerThreadItem): string {
  if (item.type === "commandExecution") {
    return "Command";
  }

  if (item.type === "fileChange") {
    return "File changes";
  }

  if (item.type === "fileRead") {
    return "File read";
  }

  if (item.type === "mcpToolCall") {
    return "MCP tool";
  }

  if (item.type === "dynamicToolCall" || item.type === "collabAgentToolCall") {
    return "Tool call";
  }

  if (item.type === "webSearch") {
    return "Web search";
  }

  if (item.type === "imageView") {
    return "Image view";
  }

  if (item.type === "imageGeneration") {
    return "Image generation";
  }

  if (item.type === "reasoning") {
    return "Reasoning";
  }

  if (item.type === "contextCompaction") {
    return "Context compaction";
  }

  if (item.type === "turnError") {
    return "Turn failed";
  }

  return humanizeItemType(item.type);
}

function readWorkPreview(item: CodexAppServerThreadItem): string | null {
  const rawItem = asRecord(item.raw);
  const toolIdentity = readToolIdentity(item);
  if (toolIdentity && toolIdentity.trim().length > 0) {
    return toolIdentity;
  }

  const command = readString(rawItem?.command);
  if (command && command.trim().length > 0) {
    return command;
  }

  const path = readString(rawItem?.path) ?? readString(rawItem?.filePath);
  if (path && path.trim().length > 0) {
    return path;
  }

  const query = readString(rawItem?.query);
  if (query && query.trim().length > 0) {
    return query;
  }

  const result = readString(rawItem?.result);
  if (result && result.trim().length > 0) {
    return result;
  }

  const displayText = readCodexThreadItemDisplayText(item);
  if (displayText && displayText.trim().length > 0) {
    return displayText;
  }

  const changedFiles = readChangedFiles(item);
  const firstChangedFile = changedFiles[0];
  if (!firstChangedFile) {
    return null;
  }

  return changedFiles.length === 1
    ? firstChangedFile
    : `${firstChangedFile} +${changedFiles.length - 1} more`;
}

function readWorkCategory(item: CodexAppServerThreadItem): CodexThreadTimelineWorkCategory {
  return itemTypeIsToolActivity(item.type) ? "tool" : "info";
}

function readWorkTone(item: CodexAppServerThreadItem): CodexThreadTimelineWorkTone {
  const rawItem = asRecord(item.raw);
  const exitCode = rawItem?.exitCode;
  const status = readString(rawItem?.status)?.toLowerCase();
  if (
    item.type.toLowerCase().includes("error") ||
    (typeof exitCode === "number" && exitCode !== 0) ||
    status === "failed" ||
    status === "error"
  ) {
    return "error";
  }

  if (readWorkCategory(item) === "tool") {
    return "tool";
  }

  return "info";
}

function buildWorkEntry(item: CodexAppServerThreadItem): CodexThreadTimelineWorkEntry {
  return {
    category: readWorkCategory(item),
    changedFiles: readChangedFiles(item),
    id: item.id ?? `item-${item.type}`,
    item,
    preview: readWorkPreview(item),
    title: readWorkTitle(item),
    tone: readWorkTone(item),
  };
}

function buildTurnErrorEntry(turn: CodexAppServerThreadTurn): CodexThreadTimelineWorkEntry | null {
  const errorMessage = turn.errorMessage?.trim();
  if (!errorMessage) {
    return null;
  }

  return buildWorkEntry({
    id: `${turn.id}-error`,
    raw: {
      status: "failed",
      text: errorMessage,
    },
    summary: errorMessage,
    type: "turnError",
  });
}

/**
 * Keep the rendered chat surface close to the provider's existing turn order:
 * message items become bubbles, and consecutive non-message items collapse into
 * one compact work block between the surrounding messages.
 */
export function deriveCodexThreadTimelineEntries(
  thread: CodexAppServerThread,
): CodexThreadTimelineEntry[] {
  const entries: CodexThreadTimelineEntry[] = [];
  let pendingWorkEntries: CodexThreadTimelineWorkEntry[] = [];
  let pendingWorkCategory: CodexThreadTimelineWorkCategory | null = null;
  let workGroupIndex = 0;

  const flushPendingWorkEntries = () => {
    if (pendingWorkEntries.length === 0) {
      return;
    }

    entries.push({
      entries: pendingWorkEntries,
      id: `work-group-${thread.id}-${workGroupIndex}`,
      kind: "work",
    });
    pendingWorkEntries = [];
    pendingWorkCategory = null;
    workGroupIndex += 1;
  };

  for (const turn of thread.turns) {
    for (const item of turn.items) {
      const messageRole = readMessageRole(item);
      if (messageRole) {
        flushPendingWorkEntries();
        entries.push({
          id: item.id ?? `${turn.id}-${messageRole}`,
          item,
          kind: "message",
          role: messageRole,
          text: readCodexThreadItemDisplayText(item) ?? "",
        });
        continue;
      }

      const workEntry = buildWorkEntry(item);
      if (pendingWorkCategory !== null && pendingWorkCategory !== workEntry.category) {
        flushPendingWorkEntries();
      }

      pendingWorkEntries.push(workEntry);
      pendingWorkCategory = workEntry.category;
    }

    const turnErrorEntry = buildTurnErrorEntry(turn);
    if (!turnErrorEntry) {
      continue;
    }

    if (pendingWorkCategory !== null && pendingWorkCategory !== turnErrorEntry.category) {
      flushPendingWorkEntries();
    }

    pendingWorkEntries.push(turnErrorEntry);
    pendingWorkCategory = turnErrorEntry.category;
  }

  flushPendingWorkEntries();
  return entries;
}
