export interface FolderExpansionState {
  folderPath: string;
  isExpanded: boolean;
}

export function getAncestorFolderPaths(path: string): string[] {
  const pathSegments = path.split("/");
  const folderPaths: string[] = [];
  let currentPath = "";

  for (let index = 0; index < pathSegments.length - 1; index += 1) {
    currentPath = index === 0 ? pathSegments[index] : `${currentPath}/${pathSegments[index]}`;
    folderPaths.push(currentPath);
  }

  return folderPaths;
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

  const nextStates = new Map(args.folderExpansionStates.map((state) => [state.folderPath, state]));

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
