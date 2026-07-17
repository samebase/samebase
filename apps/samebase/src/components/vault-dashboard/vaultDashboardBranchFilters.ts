import { normalizePullRequestLabels, type PullRequestLabelInput } from "@/lib/pullRequestLabels";

export type VaultBranchFilters = {
  hiddenLabels: string[];
  includeDrafts: boolean;
  includeNoLabel: boolean;
};

export type VaultBranchFilterOption = {
  key: string;
  name: string;
  color?: string;
  count?: number;
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
  };
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

/**
 * Builds pull request filter choices from labels observed on loaded PR pages.
 * The loaded labels have no repository-wide PR count, so the UI deliberately
 * omits counts instead of presenting page-local counts as complete.
 */
export function buildVaultPullRequestFilterOptions(args: {
  labels: readonly PullRequestLabelInput[];
  hiddenLabels: string[];
  includeNoLabel: boolean;
}): VaultBranchFilterOption[] {
  const normalizedFilters = normalizeVaultBranchFilters({
    hiddenLabels: args.hiddenLabels,
    includeDrafts: false,
    includeNoLabel: args.includeNoLabel,
  });
  const hiddenLabelNamesByKey = new Map(
    normalizedFilters.hiddenLabels.map((labelName) => [normalizeLabelKey(labelName), labelName]),
  );
  const optionsByKey = new Map<string, VaultBranchFilterOption>();

  for (const label of normalizePullRequestLabels([...args.labels])) {
    const key = normalizeLabelKey(label.name);
    if (optionsByKey.has(key)) {
      continue;
    }
    optionsByKey.set(key, {
      key,
      name: label.name,
      color: label.color,
      included: !hiddenLabelNamesByKey.has(key),
      isNoLabel: false,
    });
  }

  for (const [key, name] of hiddenLabelNamesByKey) {
    if (optionsByKey.has(key)) {
      continue;
    }
    optionsByKey.set(key, {
      key,
      name,
      included: false,
      isNoLabel: false,
    });
  }

  return [
    ...Array.from(optionsByKey.values()).sort((left, right) =>
      compareLabelNames(left.name, right.name),
    ),
    {
      key: NO_LABEL_FILTER_KEY,
      name: NO_LABEL_FILTER_NAME,
      included: normalizedFilters.includeNoLabel,
      isNoLabel: true,
    },
  ];
}
