import type { CodexAppServerThread } from "@/lib/codexAppServerResearch";
import {
  deriveCodexThreadTimelineEntries,
  type CodexThreadTimelineEntry,
  type CodexThreadTimelineMessageEntry,
  type CodexThreadTimelineWorkEntry,
} from "@/lib/codexThreadTimeline";

type SerializeCodexThreadTranscriptMarkdownOptions = {
  entries?: CodexThreadTimelineEntry[];
  includeThreadMetadata?: boolean;
};

const RESERVED_TRANSCRIPT_HEADINGS = new Set(["@assistant", "@user", "@work"]);

function readFirstNonEmptyLine(value: string): string {
  const firstLine = value
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine ?? value.trim();
}

function readThreadTitle(thread: CodexAppServerThread): string {
  const explicitName = thread.name?.trim();
  if (explicitName) {
    return explicitName;
  }

  return readFirstNonEmptyLine(thread.preview);
}

function escapeReservedTranscriptHeadingLine(line: string): string {
  const match = line.match(/^(\s*)(##)\s+(@(?:assistant|user|work))\s*$/);
  if (!match) {
    return line;
  }

  const [, leadingWhitespace, headingToken, headingText] = match;
  if (!RESERVED_TRANSCRIPT_HEADINGS.has(headingText)) {
    return line;
  }

  // Keep the raw transcript readable while preventing a user-authored message
  // heading from looking like a real transcript section boundary.
  return `${leadingWhitespace}\\${headingToken} ${headingText}`;
}

function escapeReservedTranscriptHeadings(value: string): string {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => escapeReservedTranscriptHeadingLine(line))
    .join("\n")
    .trim();
}

function formatMetadataValue(value: string): string {
  const trimmedValue = value.trim();
  const lines = trimmedValue.split("\n");
  if (lines.length === 1) {
    return trimmedValue;
  }

  return [lines[0], ...lines.slice(1).map((line) => `  ${line}`)].join("\n");
}

function serializeMetadataList(
  metadataEntries: ReadonlyArray<{
    key: string;
    value: string | null;
  }>,
): string[] {
  return metadataEntries.flatMap((entry) => {
    const value = entry.value?.trim();
    if (!value) {
      return [];
    }

    return [`- ${entry.key}: ${formatMetadataValue(value)}`];
  });
}

function serializeMessageSection(
  entry: CodexThreadTimelineMessageEntry,
): string[] {
  const lines = [`## @${entry.role}`, ""];
  const metadataLines = serializeMetadataList([
    {
      key: "item-id",
      value: entry.item.id,
    },
    {
      key: "item-type",
      value: entry.item.type,
    },
    {
      key: "turn-id",
      value: entry.turnId,
    },
  ]);

  if (metadataLines.length > 0) {
    lines.push(...metadataLines, "");
  }

  const body = escapeReservedTranscriptHeadings(entry.text);
  if (body.length > 0) {
    lines.push(body);
  }

  return lines;
}

function serializeWorkEntry(entry: CodexThreadTimelineWorkEntry): string[] {
  return [
    `### ${entry.title}`,
    "",
    ...serializeMetadataList([
      {
        key: "item-id",
        value: entry.item.id,
      },
      {
        key: "item-type",
        value: entry.item.type,
      },
      {
        key: "tone",
        value: entry.tone,
      },
      {
        key: "preview",
        value: entry.preview,
      },
      ...entry.changedFiles.map((filePath) => ({
        key: "changed-file",
        value: filePath,
      })),
    ]),
  ];
}

function serializeWorkSection(
  entries: CodexThreadTimelineWorkEntry[],
): string[] {
  const lines = ["## @work", ""];

  entries.forEach((entry, index) => {
    if (index > 0) {
      lines.push("");
    }

    lines.push(...serializeWorkEntry(entry));
  });

  return lines;
}

function serializeThreadMetadataBlock(thread: CodexAppServerThread): string[] {
  const metadataLines = serializeMetadataList([
    {
      key: "thread-id",
      value: thread.id,
    },
    {
      key: "status",
      value: thread.status.type,
    },
    {
      key: "cwd",
      value: thread.cwd,
    },
    {
      key: "updated-at",
      value: new Date(thread.updatedAt * 1000).toISOString(),
    },
    {
      key: "model-provider",
      value: thread.modelProvider,
    },
    {
      key: "source-label",
      value: thread.sourceLabel,
    },
    {
      key: "path",
      value: thread.path,
    },
    {
      key: "agent-role",
      value: thread.agentRole,
    },
    {
      key: "agent-nickname",
      value: thread.agentNickname,
    },
  ]);

  if (metadataLines.length === 0) {
    return [];
  }

  return [`# ${readThreadTitle(thread)}`, "", ...metadataLines];
}

export function serializeCodexThreadTranscriptMarkdown(
  thread: CodexAppServerThread,
  options: SerializeCodexThreadTranscriptMarkdownOptions = {},
): string {
  const entries = options.entries ?? deriveCodexThreadTimelineEntries(thread);
  const sections: string[] = [];

  if (options.includeThreadMetadata) {
    const threadMetadataBlock = serializeThreadMetadataBlock(thread);
    if (threadMetadataBlock.length > 0) {
      sections.push(threadMetadataBlock.join("\n"));
    }
  }

  entries.forEach((entry) => {
    if (entry.kind === "message") {
      sections.push(serializeMessageSection(entry).join("\n"));
      return;
    }

    sections.push(serializeWorkSection(entry.entries).join("\n"));
  });

  return sections.join("\n\n").trim();
}
