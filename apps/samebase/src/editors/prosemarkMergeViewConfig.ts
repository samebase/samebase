export type ProsemarkMergeViewConfig = {
  allowInlineDiffs: boolean;
  hideSyntheticTrailingNewlineDeletion: boolean;
  original: string;
  syntaxHighlightDeletions: boolean;
};

export function resolveProsemarkMergeViewConfig(
  value: string,
  baseValue: string,
  allowInlineDiffs: boolean,
  syntaxHighlightDeletions: boolean,
): ProsemarkMergeViewConfig {
  if (baseValue.length === 0 || baseValue.endsWith("\n")) {
    return {
      allowInlineDiffs,
      hideSyntheticTrailingNewlineDeletion: false,
      original: baseValue,
      syntaxHighlightDeletions,
    };
  }
  if (!value.startsWith(baseValue)) {
    return {
      allowInlineDiffs,
      hideSyntheticTrailingNewlineDeletion: false,
      original: baseValue,
      syntaxHighlightDeletions,
    };
  }
  if (
    value.length <= baseValue.length ||
    value.length === baseValue.length + 1 ||
    value.charAt(baseValue.length) !== "\n"
  ) {
    return {
      allowInlineDiffs,
      hideSyntheticTrailingNewlineDeletion: false,
      original: baseValue,
      syntaxHighlightDeletions,
    };
  }
  return {
    allowInlineDiffs,
    hideSyntheticTrailingNewlineDeletion: true,
    original: `${baseValue}\n`,
    syntaxHighlightDeletions,
  };
}

export function prosemarkMergeViewConfigsEqual(
  left: ProsemarkMergeViewConfig,
  right: ProsemarkMergeViewConfig,
) {
  return (
    left.allowInlineDiffs === right.allowInlineDiffs &&
    left.hideSyntheticTrailingNewlineDeletion === right.hideSyntheticTrailingNewlineDeletion &&
    left.original === right.original &&
    left.syntaxHighlightDeletions === right.syntaxHighlightDeletions
  );
}
