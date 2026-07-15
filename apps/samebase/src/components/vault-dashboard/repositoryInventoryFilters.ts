import {
  normalizePullRequestLabelColor,
  type PullRequestLabelInput,
} from "@/lib/pullRequestLabels";

export type RepositoryInventoryFilters = {
  hiddenLabels: string[];
  includeDrafts: boolean;
  includeNoLabel: boolean;
};

export type RepositoryInventoryFilterableItem =
  | {
      kind: "branch";
    }
  | {
      kind: "pull_request";
      pullRequestIsDraft: boolean;
      pullRequestLabels: PullRequestLabelInput[];
    };

export type PullRequestLabelFacet = {
  name: string;
  color?: string;
  pullRequestCount: number;
};

export type PullRequestFilterOption =
  | {
      kind: "label";
      key: string;
      name: string;
      color?: string;
      pullRequestCount: number;
      included: boolean;
    }
  | {
      kind: "no_label";
      key: string;
      name: string;
      pullRequestCount: number;
      included: boolean;
    };

function normalizeLabelKey(name: string): string {
  return name.trim().toLowerCase();
}

function compareLabelNames(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base" }) || left.localeCompare(right);
}

// A normalized GitHub label name cannot contain this leading null character.
const NO_LABEL_FILTER_KEY = "\u0000no-label";

export function getDefaultRepositoryInventoryFilters(): RepositoryInventoryFilters {
  return {
    hiddenLabels: [],
    includeDrafts: false,
    includeNoLabel: true,
  };
}

export function normalizeRepositoryInventoryFilters(
  filters: Partial<RepositoryInventoryFilters> | null | undefined,
): RepositoryInventoryFilters {
  if (!filters) {
    return getDefaultRepositoryInventoryFilters();
  }

  const hiddenLabelsByKey = new Map<string, string>();
  for (const labelName of filters.hiddenLabels ?? []) {
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
    hiddenLabels: Array.from(hiddenLabelsByKey.values()).sort(compareLabelNames),
    includeDrafts: filters.includeDrafts === true,
    includeNoLabel: filters.includeNoLabel !== false,
  };
}

export function setRepositoryInventoryFilterLabelIncluded(args: {
  hiddenLabels: string[];
  labelName: string;
  included: boolean;
}): string[] {
  const hiddenLabels = normalizeRepositoryInventoryFilters({
    hiddenLabels: args.hiddenLabels,
    includeDrafts: false,
    includeNoLabel: true,
  }).hiddenLabels;
  const hiddenLabelsByKey = new Map(
    hiddenLabels.map((labelName) => [normalizeLabelKey(labelName), labelName]),
  );
  const trimmedLabelName = args.labelName.trim();
  if (trimmedLabelName.length === 0) {
    return hiddenLabels;
  }

  const labelKey = normalizeLabelKey(trimmedLabelName);
  if (args.included) {
    hiddenLabelsByKey.delete(labelKey);
  } else {
    hiddenLabelsByKey.set(labelKey, trimmedLabelName);
  }

  return Array.from(hiddenLabelsByKey.values()).sort(compareLabelNames);
}

export function filterRepositoryInventoryItems<Item extends RepositoryInventoryFilterableItem>(
  items: readonly Item[],
  filters: Partial<RepositoryInventoryFilters> | null | undefined,
): Item[] {
  const normalizedFilters = normalizeRepositoryInventoryFilters(filters);
  const hiddenLabelKeys = new Set(normalizedFilters.hiddenLabels.map(normalizeLabelKey));

  return items.filter((item) => {
    if (item.kind === "branch") {
      return true;
    }
    if (!normalizedFilters.includeDrafts && item.pullRequestIsDraft) {
      return false;
    }

    const labelKeys = item.pullRequestLabels
      .map((label) => normalizeLabelKey(typeof label === "string" ? label : label.name))
      .filter((labelKey) => labelKey.length > 0);
    if (labelKeys.length === 0) {
      return normalizedFilters.includeNoLabel;
    }

    return !labelKeys.some((labelKey) => hiddenLabelKeys.has(labelKey));
  });
}

export function buildPullRequestFilterOptions(args: {
  labelFacets: readonly PullRequestLabelFacet[];
  hiddenLabels: string[];
  includeNoLabel: boolean;
  noLabelPullRequestCount: number;
}): PullRequestFilterOption[] {
  const normalizedFilters = normalizeRepositoryInventoryFilters({
    hiddenLabels: args.hiddenLabels,
    includeDrafts: false,
    includeNoLabel: args.includeNoLabel,
  });
  const hiddenLabelNamesByKey = new Map(
    normalizedFilters.hiddenLabels.map((labelName) => [normalizeLabelKey(labelName), labelName]),
  );
  const optionsByKey = new Map<string, PullRequestFilterOption>();

  for (const facet of args.labelFacets) {
    const name = facet.name.trim();
    const key = normalizeLabelKey(name);
    if (key.length === 0) {
      continue;
    }
    const existing = optionsByKey.get(key);
    const color = normalizePullRequestLabelColor(facet.color);
    if (existing?.kind === "label") {
      existing.pullRequestCount = Math.max(existing.pullRequestCount, facet.pullRequestCount);
      if (!existing.color && color) {
        existing.color = color;
      }
      continue;
    }

    optionsByKey.set(key, {
      kind: "label",
      key,
      name,
      color,
      pullRequestCount: facet.pullRequestCount,
      included: !hiddenLabelNamesByKey.has(key),
    });
  }

  for (const [key, name] of hiddenLabelNamesByKey) {
    const existing = optionsByKey.get(key);
    if (existing?.kind === "label") {
      existing.included = false;
      continue;
    }
    optionsByKey.set(key, {
      kind: "label",
      key,
      name,
      pullRequestCount: 0,
      included: false,
    });
  }

  return [
    ...Array.from(optionsByKey.values()).sort((left, right) =>
      compareLabelNames(left.name, right.name),
    ),
    {
      kind: "no_label",
      key: NO_LABEL_FILTER_KEY,
      name: "No label",
      pullRequestCount: args.noLabelPullRequestCount,
      included: normalizedFilters.includeNoLabel,
    },
  ];
}
