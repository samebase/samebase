import { normalizePullRequestLabels, type PullRequestLabelInput } from "@/lib/pullRequestLabels";

export type VaultBranchFilters = {
  hiddenLabels: string[];
  includeDrafts: boolean;
  includeNoLabel: boolean;
  branchesExpanded: boolean;
};

export type VaultBranchFilterable = {
  pullRequestLabels?: PullRequestLabelInput[];
  pullRequestIsDraft?: boolean;
};

export type VaultBranchFilterOption = {
  key: string;
  name: string;
  color?: string;
  count: number;
  included: boolean;
  isNoLabel: boolean;
};

function normalizeLabelKey(name: string): string {
  return name.trim().toLowerCase();
}

function compareLabelNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

// Use a sentinel key that a GitHub label cannot reproduce after normalization.
const NO_LABEL_FILTER_KEY = "\u0000no-label";
const NO_LABEL_FILTER_NAME = "No label";

export function getDefaultVaultBranchFilters(): VaultBranchFilters {
  return {
    hiddenLabels: [],
    includeDrafts: false,
    includeNoLabel: true,
    branchesExpanded: false,
  };
}

export function normalizeVaultBranchFilters(
  filters: Partial<VaultBranchFilters> | null | undefined,
): VaultBranchFilters {
  if (!filters) {
    return getDefaultVaultBranchFilters();
  }

  const hiddenLabelsByKey = new Map<string, string>();
  for (const labelName of filters.hiddenLabels ?? []) {
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
    hiddenLabels: Array.from(hiddenLabelsByKey.values()).sort((a, b) => compareLabelNames(a, b)),
    includeDrafts: filters.includeDrafts === true,
    includeNoLabel: filters.includeNoLabel !== false,
    branchesExpanded: filters.branchesExpanded === true,
  };
}

export function areVaultBranchFiltersEqual(
  a: Partial<VaultBranchFilters> | null | undefined,
  b: Partial<VaultBranchFilters> | null | undefined,
): boolean {
  const normalizedA = normalizeVaultBranchFilters(a);
  const normalizedB = normalizeVaultBranchFilters(b);

  return (
    normalizedA.includeNoLabel === normalizedB.includeNoLabel &&
    normalizedA.includeDrafts === normalizedB.includeDrafts &&
    normalizedA.branchesExpanded === normalizedB.branchesExpanded &&
    normalizedA.hiddenLabels.length === normalizedB.hiddenLabels.length &&
    normalizedA.hiddenLabels.every(
      (labelName, index) => labelName === normalizedB.hiddenLabels[index],
    )
  );
}

export function setVaultBranchFilterLabelIncluded(args: {
  hiddenLabels: string[];
  labelName: string;
  included: boolean;
}): string[] {
  const normalizedHiddenLabels = normalizeVaultBranchFilters({
    hiddenLabels: args.hiddenLabels,
    includeDrafts: false,
    includeNoLabel: true,
  }).hiddenLabels;
  const nextHiddenLabelsByKey = new Map(
    normalizedHiddenLabels.map((labelName) => [normalizeLabelKey(labelName), labelName]),
  );
  const trimmedLabelName = args.labelName.trim();
  if (trimmedLabelName.length === 0) {
    return normalizedHiddenLabels;
  }

  const labelKey = normalizeLabelKey(trimmedLabelName);
  if (args.included) {
    nextHiddenLabelsByKey.delete(labelKey);
  } else {
    nextHiddenLabelsByKey.set(labelKey, trimmedLabelName);
  }

  return Array.from(nextHiddenLabelsByKey.values()).sort((a, b) => compareLabelNames(a, b));
}

export function filterVaultRemoteBranches<T extends VaultBranchFilterable>(
  branches: T[],
  filters: Partial<VaultBranchFilters> | null | undefined,
): T[] {
  const normalizedFilters = normalizeVaultBranchFilters(filters);
  const hiddenLabelKeys = new Set(normalizedFilters.hiddenLabels.map(normalizeLabelKey));

  return branches.filter((branch) => {
    if (!normalizedFilters.includeDrafts && branch.pullRequestIsDraft === true) {
      return false;
    }

    const branchLabelKeys = normalizePullRequestLabels(branch.pullRequestLabels).map((label) =>
      normalizeLabelKey(label.name),
    );
    if (branchLabelKeys.length === 0) {
      return normalizedFilters.includeNoLabel;
    }

    return !branchLabelKeys.some((labelKey) => hiddenLabelKeys.has(labelKey));
  });
}

/**
 * Merge live PR labels with persisted hidden labels so users can still remove a
 * saved label even when no current branch exposes it.
 */
export function buildVaultBranchFilterOptions<T extends VaultBranchFilterable>(args: {
  branches: T[];
  hiddenLabels: string[];
  includeNoLabel: boolean;
}): VaultBranchFilterOption[] {
  const normalizedFilters = normalizeVaultBranchFilters({
    hiddenLabels: args.hiddenLabels,
    includeDrafts: false,
    includeNoLabel: args.includeNoLabel,
  });
  const hiddenLabels = normalizedFilters.hiddenLabels;
  const hiddenLabelNamesByKey = new Map(
    hiddenLabels.map((labelName) => [normalizeLabelKey(labelName), labelName]),
  );
  const labelOptionsByKey = new Map<string, VaultBranchFilterOption>();
  let noLabelCount = 0;

  for (const branch of args.branches) {
    const normalizedLabels = normalizePullRequestLabels(branch.pullRequestLabels);
    if (normalizedLabels.length === 0) {
      noLabelCount += 1;
      continue;
    }

    const seenBranchLabelKeys = new Set<string>();
    for (const label of normalizedLabels) {
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
        key: labelKey,
        name: label.name,
        color: label.color,
        count: 1,
        included: !hiddenLabelNamesByKey.has(labelKey),
        isNoLabel: false,
      });
    }
  }

  for (const [labelKey, labelName] of hiddenLabelNamesByKey) {
    if (labelOptionsByKey.has(labelKey)) {
      const existingOption = labelOptionsByKey.get(labelKey);
      if (existingOption) {
        existingOption.included = false;
      }
      continue;
    }

    labelOptionsByKey.set(labelKey, {
      key: labelKey,
      name: labelName,
      count: 0,
      included: false,
      isNoLabel: false,
    });
  }

  return [
    ...Array.from(labelOptionsByKey.values()).sort((a, b) => compareLabelNames(a.name, b.name)),
    {
      key: NO_LABEL_FILTER_KEY,
      name: NO_LABEL_FILTER_NAME,
      count: noLabelCount,
      included: normalizedFilters.includeNoLabel,
      isNoLabel: true,
    },
  ];
}
