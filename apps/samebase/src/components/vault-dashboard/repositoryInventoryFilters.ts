import { normalizePullRequestLabelColor } from "@/lib/pullRequestLabels";
import type { api } from "../../../convex/_generated/api";
import { repositoryInventoryFilterLabelKey } from "../../../shared/repositoryInventoryFilters";

export type RepositoryInventoryFilters = {
  hiddenLabels: string[];
  includeDrafts: boolean;
  includeNoLabel: boolean;
};

export type RepositoryInventoryFilterChange =
  (typeof api.repositoryInventory.setRepositoryInventoryFilter)["_args"]["change"];

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

function compareLabelNames(left: string, right: string): number {
  const leftKey = repositoryInventoryFilterLabelKey(left);
  const rightKey = repositoryInventoryFilterLabelKey(right);
  if (leftKey !== rightKey) {
    return leftKey < rightKey ? -1 : 1;
  }
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
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
    const labelKey = repositoryInventoryFilterLabelKey(trimmedLabelName);
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

/**
 * Converts the filter control's complete next value into the one persisted
 * filter transition that produced it. The control emits one checkbox change
 * at a time, except Reset all, which returns the complete default value.
 */
export function buildRepositoryInventoryFilterChange(args: {
  current: RepositoryInventoryFilters;
  next: RepositoryInventoryFilters;
}): RepositoryInventoryFilterChange | null {
  const current = normalizeRepositoryInventoryFilters(args.current);
  const next = normalizeRepositoryInventoryFilters(args.next);
  const currentLabelsByKey = new Map(
    current.hiddenLabels.map((name) => [repositoryInventoryFilterLabelKey(name), name]),
  );
  const nextLabelsByKey = new Map(
    next.hiddenLabels.map((name) => [repositoryInventoryFilterLabelKey(name), name]),
  );
  const changedLabelKeys = new Set<string>();
  for (const labelKey of currentLabelsByKey.keys()) {
    if (!nextLabelsByKey.has(labelKey)) {
      changedLabelKeys.add(labelKey);
    }
  }
  for (const labelKey of nextLabelsByKey.keys()) {
    if (!currentLabelsByKey.has(labelKey)) {
      changedLabelKeys.add(labelKey);
    }
  }
  const includeDraftsChanged = current.includeDrafts !== next.includeDrafts;
  const includeNoLabelChanged = current.includeNoLabel !== next.includeNoLabel;
  const changeCount =
    changedLabelKeys.size + Number(includeDraftsChanged) + Number(includeNoLabelChanged);
  if (changeCount === 0) {
    return null;
  }
  if (changeCount === 1) {
    if (includeDraftsChanged) {
      return { kind: "set_include_drafts", included: next.includeDrafts };
    }
    if (includeNoLabelChanged) {
      return { kind: "set_include_no_label", included: next.includeNoLabel };
    }
    const labelKey = changedLabelKeys.values().next().value;
    if (labelKey === undefined) {
      throw new Error("Pull request filter change omitted its changed label.");
    }
    const nextName = nextLabelsByKey.get(labelKey);
    return nextName === undefined
      ? {
          kind: "set_label_included",
          name: currentLabelsByKey.get(labelKey) ?? labelKey,
          included: true,
        }
      : { kind: "set_label_included", name: nextName, included: false };
  }

  const defaults = getDefaultRepositoryInventoryFilters();
  if (
    next.hiddenLabels.length === 0 &&
    next.includeDrafts === defaults.includeDrafts &&
    next.includeNoLabel === defaults.includeNoLabel
  ) {
    return { kind: "reset" };
  }
  throw new Error("Pull request filters changed through more than one control.");
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
    hiddenLabels.map((labelName) => [repositoryInventoryFilterLabelKey(labelName), labelName]),
  );
  const trimmedLabelName = args.labelName.trim();
  if (trimmedLabelName.length === 0) {
    return hiddenLabels;
  }

  const labelKey = repositoryInventoryFilterLabelKey(trimmedLabelName);
  if (args.included) {
    hiddenLabelsByKey.delete(labelKey);
  } else {
    hiddenLabelsByKey.set(labelKey, trimmedLabelName);
  }

  return Array.from(hiddenLabelsByKey.values()).sort(compareLabelNames);
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
    normalizedFilters.hiddenLabels.map((labelName) => [
      repositoryInventoryFilterLabelKey(labelName),
      labelName,
    ]),
  );
  const optionsByKey = new Map<string, PullRequestFilterOption>();

  for (const facet of args.labelFacets) {
    const name = facet.name.trim();
    const key = repositoryInventoryFilterLabelKey(name);
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
