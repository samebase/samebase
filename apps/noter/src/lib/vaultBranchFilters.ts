import {
  normalizePullRequestLabels,
  type PullRequestLabelInput,
} from "@/lib/pullRequestLabels";

export type VaultBranchFilters = {
  hiddenLabels: string[];
  includeDrafts: boolean;
};

export type VaultBranchFilterable = {
  pullRequestLabels?: PullRequestLabelInput[];
  pullRequestIsDraft?: boolean;
};

export type VaultBranchFilterLabelOption = {
  name: string;
  color?: string;
  count: number;
  selected: boolean;
};

function normalizeLabelKey(name: string): string {
  return name.trim().toLowerCase();
}

function compareLabelNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export function getDefaultVaultBranchFilters(): VaultBranchFilters {
  return {
    hiddenLabels: [],
    includeDrafts: false,
  };
}

export function normalizeVaultBranchFilters(
  filters: VaultBranchFilters | null | undefined,
): VaultBranchFilters {
  if (!filters) {
    return getDefaultVaultBranchFilters();
  }

  const hiddenLabelsByKey = new Map<string, string>();
  for (const labelName of filters.hiddenLabels) {
    if (typeof labelName !== "string") {
      continue;
    }
    const trimmedLabelName = labelName.trim();
    if (trimmedLabelName.length === 0) {
      continue;
    }
    const labelKey = normalizeLabelKey(trimmedLabelName);
    if (!hiddenLabelsByKey.has(labelKey)) {
      hiddenLabelsByKey.set(labelKey, trimmedLabelName);
    }
  }

  return {
    hiddenLabels: Array.from(hiddenLabelsByKey.values()).sort((a, b) =>
      compareLabelNames(a, b),
    ),
    includeDrafts: filters.includeDrafts === true,
  };
}

export function areVaultBranchFiltersEqual(
  a: VaultBranchFilters | null | undefined,
  b: VaultBranchFilters | null | undefined,
): boolean {
  const normalizedA = normalizeVaultBranchFilters(a);
  const normalizedB = normalizeVaultBranchFilters(b);

  return (
    normalizedA.includeDrafts === normalizedB.includeDrafts &&
    normalizedA.hiddenLabels.length === normalizedB.hiddenLabels.length &&
    normalizedA.hiddenLabels.every(
      (labelName, index) => labelName === normalizedB.hiddenLabels[index],
    )
  );
}

export function setVaultBranchFilterHiddenLabel(args: {
  hiddenLabels: string[];
  labelName: string;
  selected: boolean;
}): string[] {
  const normalizedHiddenLabels = normalizeVaultBranchFilters({
    hiddenLabels: args.hiddenLabels,
    includeDrafts: false,
  }).hiddenLabels;
  const nextHiddenLabelsByKey = new Map(
    normalizedHiddenLabels.map((labelName) => [
      normalizeLabelKey(labelName),
      labelName,
    ]),
  );
  const trimmedLabelName = args.labelName.trim();
  if (trimmedLabelName.length === 0) {
    return normalizedHiddenLabels;
  }

  const labelKey = normalizeLabelKey(trimmedLabelName);
  if (args.selected) {
    nextHiddenLabelsByKey.set(labelKey, trimmedLabelName);
  } else {
    nextHiddenLabelsByKey.delete(labelKey);
  }

  return Array.from(nextHiddenLabelsByKey.values()).sort((a, b) =>
    compareLabelNames(a, b),
  );
}

export function filterVaultRemoteBranches<T extends VaultBranchFilterable>(
  branches: T[],
  filters: VaultBranchFilters | null | undefined,
): T[] {
  const normalizedFilters = normalizeVaultBranchFilters(filters);
  const hiddenLabelKeys = new Set(
    normalizedFilters.hiddenLabels.map(normalizeLabelKey),
  );

  return branches.filter((branch) => {
    if (
      !normalizedFilters.includeDrafts &&
      branch.pullRequestIsDraft === true
    ) {
      return false;
    }

    const branchLabelKeys = normalizePullRequestLabels(
      branch.pullRequestLabels,
    ).map((label) => normalizeLabelKey(label.name));

    return !branchLabelKeys.some((labelKey) => hiddenLabelKeys.has(labelKey));
  });
}

/**
 * Merge live PR labels with persisted hidden labels so users can still remove a
 * saved label even when no current branch exposes it.
 */
export function buildVaultBranchFilterLabelOptions<
  T extends VaultBranchFilterable,
>(args: {
  branches: T[];
  hiddenLabels: string[];
}): VaultBranchFilterLabelOption[] {
  const hiddenLabels = normalizeVaultBranchFilters({
    hiddenLabels: args.hiddenLabels,
    includeDrafts: false,
  }).hiddenLabels;
  const hiddenLabelNamesByKey = new Map(
    hiddenLabels.map((labelName) => [normalizeLabelKey(labelName), labelName]),
  );
  const labelOptionsByKey = new Map<string, VaultBranchFilterLabelOption>();

  for (const branch of args.branches) {
    const seenBranchLabelKeys = new Set<string>();
    for (const label of normalizePullRequestLabels(branch.pullRequestLabels)) {
      const labelKey = normalizeLabelKey(label.name);
      if (seenBranchLabelKeys.has(labelKey)) {
        continue;
      }
      seenBranchLabelKeys.add(labelKey);
      const existingOption = labelOptionsByKey.get(labelKey);
      if (existingOption) {
        existingOption.count += 1;
        if (!existingOption.color && label.color) {
          existingOption.color = label.color;
        }
        continue;
      }

      labelOptionsByKey.set(labelKey, {
        name: label.name,
        color: label.color,
        count: 1,
        selected: hiddenLabelNamesByKey.has(labelKey),
      });
    }
  }

  for (const [labelKey, labelName] of hiddenLabelNamesByKey) {
    if (labelOptionsByKey.has(labelKey)) {
      const existingOption = labelOptionsByKey.get(labelKey);
      if (existingOption) {
        existingOption.selected = true;
      }
      continue;
    }

    labelOptionsByKey.set(labelKey, {
      name: labelName,
      count: 0,
      selected: true,
    });
  }

  return Array.from(labelOptionsByKey.values()).sort((a, b) => {
    if (a.selected !== b.selected) {
      return a.selected ? -1 : 1;
    }
    if (a.count !== b.count) {
      return b.count - a.count;
    }
    return a.name.localeCompare(b.name);
  });
}
