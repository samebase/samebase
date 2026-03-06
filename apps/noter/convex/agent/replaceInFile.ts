import { ChangeSet, Text } from "@codemirror/state";

export interface ReplaceInFileReplacement {
  oldText: string;
  newText: string;
}

export interface ReplaceInFileResolvedEdit {
  replacementIndex: number;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

export interface ReplaceInFilePlan {
  finalContent: string;
  serializedChangeSet: string;
  resolvedEdits: ReplaceInFileResolvedEdit[];
}

export type ReplaceInFileErrorCode =
  | "ambiguous_match"
  | "deleted"
  | "invalid_replacement"
  | "not_file"
  | "not_found";

export class ReplaceInFileError extends Error {
  readonly code: ReplaceInFileErrorCode;

  constructor(message: string, code: ReplaceInFileErrorCode) {
    super(message);
    this.name = "ReplaceInFileError";
    this.code = code;
  }
}

type LineEnding = "\n" | "\r\n";

function detectLineEnding(content: string): LineEnding {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeSnippetLineEndings(
  content: string,
  lineEnding: LineEnding,
): string {
  return content.replace(/\r\n|\r|\n/g, lineEnding);
}

function findMatchOffsets(content: string, needle: string): number[] {
  const matches: number[] = [];
  let searchStart = 0;

  while (searchStart <= content.length) {
    const matchIndex = content.indexOf(needle, searchStart);
    if (matchIndex === -1) {
      break;
    }
    matches.push(matchIndex);
    searchStart = matchIndex + 1;
  }

  return matches;
}

function offsetToPosition(content: string, offset: number) {
  const prefix = content.slice(0, offset);
  const lines = prefix.split(/\r\n|\r|\n/);
  const lastLine = lines[lines.length - 1] ?? "";
  return {
    line: lines.length,
    character: lastLine.length,
  };
}

export function buildReplaceInFilePlan(args: {
  sourceContent: string;
  replacements: ReplaceInFileReplacement[];
}): ReplaceInFilePlan {
  if (args.replacements.length === 0) {
    throw new ReplaceInFileError(
      "replace_in_file failed: replacements must not be empty",
      "invalid_replacement",
    );
  }

  const lineEnding = detectLineEnding(args.sourceContent);
  const resolvedRanges = args.replacements.map((replacement, index) => {
    if (replacement.oldText.length === 0) {
      throw new ReplaceInFileError(
        `replace_in_file failed: replacement ${index + 1} has empty oldText`,
        "invalid_replacement",
      );
    }

    const normalizedOldText = normalizeSnippetLineEndings(
      replacement.oldText,
      lineEnding,
    );
    const normalizedNewText = normalizeSnippetLineEndings(
      replacement.newText,
      lineEnding,
    );
    const matchOffsets = findMatchOffsets(
      args.sourceContent,
      normalizedOldText,
    );

    if (matchOffsets.length === 0) {
      throw new ReplaceInFileError(
        `replace_in_file failed: replacement ${index + 1} did not match any text`,
        "invalid_replacement",
      );
    }

    if (matchOffsets.length > 1) {
      throw new ReplaceInFileError(
        `replace_in_file failed: replacement ${index + 1} matched multiple locations; include more surrounding context`,
        "ambiguous_match",
      );
    }

    const from = matchOffsets[0];
    const to = from + normalizedOldText.length;
    const start = offsetToPosition(args.sourceContent, from);
    const end = offsetToPosition(args.sourceContent, to);

    return {
      replacementIndex: index,
      from,
      to,
      insert: normalizedNewText,
      resolvedEdit: {
        replacementIndex: index + 1,
        startLine: start.line,
        startCharacter: start.character,
        endLine: end.line,
        endCharacter: end.character,
      },
    };
  });

  const sortedRanges = [...resolvedRanges].sort((a, b) => a.from - b.from);
  for (let i = 1; i < sortedRanges.length; i += 1) {
    const previous = sortedRanges[i - 1];
    const current = sortedRanges[i];
    if (current.from < previous.to) {
      throw new ReplaceInFileError(
        `replace_in_file failed: replacements ${previous.replacementIndex + 1} and ${current.replacementIndex + 1} overlap`,
        "invalid_replacement",
      );
    }
  }

  // Split on LF only so CRLF files keep their `\r` bytes in line content.
  // That preserves offsets computed against the original source string.
  const sourceDoc = Text.of(args.sourceContent.split("\n"));
  const changeSet = ChangeSet.of(
    sortedRanges.map((range) => ({
      from: range.from,
      to: range.to,
      insert: range.insert,
    })),
    sourceDoc.length,
  );

  return {
    finalContent: changeSet.apply(sourceDoc).toString(),
    serializedChangeSet: JSON.stringify(changeSet.toJSON()),
    resolvedEdits: resolvedRanges.map((range) => range.resolvedEdit),
  };
}
