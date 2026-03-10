export interface FolderExpansionState {
  folderPath: string;
  isExpanded: boolean;
}

export function buildEffectiveFolderExpansionStates(args: {
  folderExpansionStates: FolderExpansionState[];
  autoExpandedPaths: Set<string>;
  manualExpansionOverrides: Map<string, boolean>;
  forceAutoExpandedPaths: boolean;
}): FolderExpansionState[] {
  if (!args.forceAutoExpandedPaths) {
    return args.folderExpansionStates;
  }

  const nextStates = new Map(
    args.folderExpansionStates.map((state) => [state.folderPath, state]),
  );

  for (const folderPath of args.autoExpandedPaths) {
    if (args.manualExpansionOverrides.has(folderPath)) {
      continue;
    }

    nextStates.set(folderPath, {
      folderPath,
      isExpanded: true,
    });
  }

  for (const [folderPath, isExpanded] of args.manualExpansionOverrides) {
    nextStates.set(folderPath, {
      folderPath,
      isExpanded,
    });
  }

  return Array.from(nextStates.values());
}
