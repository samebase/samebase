import { normalizePullRequestLabels, type PullRequestLabelInput } from "@/lib/pullRequestLabels";

export type VaultPullRequestFilters = {
  hiddenLabels: string[];
  includeDrafts: boolean;
  includeNoLabel: boolean;
};

export type VaultPullRequestFilterable = {
  labels?: PullRequestLabelInput[];
  isDraft?: boolean;
};

export type VaultPullRequestFilterOption = {
  key: string;
  name: string;
  color: string | undefined;
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

export function getDefaultVaultPullRequestFilters(): VaultPullRequestFilters {
  return {
    hiddenLabels: [],
    includeDrafts: false,
    includeNoLabel: true,
  };
}

export function normalizeVaultPullRequestFilters(
  filters: VaultPullRequestFilters,
): VaultPullRequestFilters {
  const hiddenLabelsByKey = new Map<string, string>();
  for (const labelName of filters.hiddenLabels) {
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
    includeDrafts: filters.includeDrafts,
    includeNoLabel: filters.includeNoLabel,
  };
}

export function setVaultPullRequestFilterLabelIncluded(args: {
  hiddenLabels: string[];
  labelName: string;
  included: boolean;
}): string[] {
  const normalizedHiddenLabels = normalizeVaultPullRequestFilters({
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

export function filterVaultPullRequests<T extends VaultPullRequestFilterable>(
  pullRequests: readonly T[],
  filters: VaultPullRequestFilters,
): T[] {
  const normalizedFilters = normalizeVaultPullRequestFilters(filters);
  const hiddenLabelKeys = new Set(normalizedFilters.hiddenLabels.map(normalizeLabelKey));

  return pullRequests.filter((pullRequest) => {
    if (!normalizedFilters.includeDrafts && pullRequest.isDraft === true) {
      return false;
    }

    const pullRequestLabelKeys = normalizePullRequestLabels(pullRequest.labels).map((label) =>
      normalizeLabelKey(label.name),
    );
    if (pullRequestLabelKeys.length === 0) {
      return normalizedFilters.includeNoLabel;
    }

    return !pullRequestLabelKeys.some((labelKey) => hiddenLabelKeys.has(labelKey));
  });
}

/**
 * Merge live PR labels with persisted hidden labels so users can still remove a
 * saved label even when no current pull request exposes it.
 */
export function buildVaultPullRequestFilterOptions<T extends VaultPullRequestFilterable>(args: {
  pullRequests: readonly T[];
  hiddenLabels: string[];
  includeNoLabel: boolean;
}): VaultPullRequestFilterOption[] {
  const normalizedFilters = normalizeVaultPullRequestFilters({
    hiddenLabels: args.hiddenLabels,
    includeDrafts: false,
    includeNoLabel: args.includeNoLabel,
  });
  const hiddenLabels = normalizedFilters.hiddenLabels;
  const hiddenLabelNamesByKey = new Map(
    hiddenLabels.map((labelName) => [normalizeLabelKey(labelName), labelName]),
  );
  const labelOptionsByKey = new Map<string, VaultPullRequestFilterOption>();

  for (const pullRequest of args.pullRequests) {
    const normalizedLabels = normalizePullRequestLabels(pullRequest.labels);
    if (normalizedLabels.length === 0) {
      continue;
    }

    for (const label of normalizedLabels) {
      const labelKey = normalizeLabelKey(label.name);
      const existingOption = labelOptionsByKey.get(labelKey);
      if (existingOption) {
        if (!existingOption.color && label.color) {
          existingOption.color = label.color;
        }
        continue;
      }

      labelOptionsByKey.set(labelKey, {
        key: labelKey,
        name: label.name,
        color: label.color,
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
      color: undefined,
      included: false,
      isNoLabel: false,
    });
  }

  return [
    ...Array.from(labelOptionsByKey.values()).sort((a, b) => compareLabelNames(a.name, b.name)),
    {
      key: NO_LABEL_FILTER_KEY,
      name: NO_LABEL_FILTER_NAME,
      color: undefined,
      included: normalizedFilters.includeNoLabel,
      isNoLabel: true,
    },
  ];
}
