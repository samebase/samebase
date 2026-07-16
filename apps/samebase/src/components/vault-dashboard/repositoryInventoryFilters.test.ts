import { describe, expect, it } from "vite-plus/test";

import {
  buildRepositoryInventoryFilterChange,
  buildPullRequestFilterOptions,
  getDefaultRepositoryInventoryFilters,
  normalizeRepositoryInventoryFilters,
  setRepositoryInventoryFilterLabelIncluded,
} from "./repositoryInventoryFilters";

describe("repositoryInventoryFilters", () => {
  it("defaults to hidden drafts with every label and unlabeled pull request included", () => {
    expect(getDefaultRepositoryInventoryFilters()).toEqual({
      hiddenLabels: [],
      includeDrafts: false,
      includeNoLabel: true,
    });
  });

  it("normalizes hidden labels case-insensitively with a deterministic order", () => {
    expect(
      normalizeRepositoryInventoryFilters({
        hiddenLabels: [" Research ", "research", "WIP", ""],
        includeDrafts: true,
        includeNoLabel: false,
      }),
    ).toEqual({
      hiddenLabels: ["Research", "WIP"],
      includeDrafts: true,
      includeNoLabel: false,
    });
  });

  it("toggles hidden labels without retaining case variants", () => {
    const hiddenLabels = setRepositoryInventoryFilterLabelIncluded({
      hiddenLabels: ["WIP"],
      labelName: " research ",
      included: false,
    });
    expect(hiddenLabels).toEqual(["research", "WIP"]);

    expect(
      setRepositoryInventoryFilterLabelIncluded({
        hiddenLabels,
        labelName: "wip",
        included: true,
      }),
    ).toEqual(["research"]);
  });

  it("translates one control change into one persisted filter intent", () => {
    const defaults = getDefaultRepositoryInventoryFilters();
    expect(
      buildRepositoryInventoryFilterChange({
        current: defaults,
        next: { ...defaults, includeDrafts: true },
      }),
    ).toEqual({ kind: "set_include_drafts", included: true });
    expect(
      buildRepositoryInventoryFilterChange({
        current: defaults,
        next: { ...defaults, includeNoLabel: false },
      }),
    ).toEqual({ kind: "set_include_no_label", included: false });
    expect(
      buildRepositoryInventoryFilterChange({
        current: defaults,
        next: { ...defaults, hiddenLabels: [" Research "] },
      }),
    ).toEqual({ kind: "set_label_included", name: "Research", included: false });
    expect(
      buildRepositoryInventoryFilterChange({
        current: { ...defaults, hiddenLabels: ["Research"] },
        next: defaults,
      }),
    ).toEqual({ kind: "set_label_included", name: "Research", included: true });
  });

  it("uses one reset intent for a complete multi-control reset", () => {
    const defaults = getDefaultRepositoryInventoryFilters();
    expect(
      buildRepositoryInventoryFilterChange({
        current: {
          hiddenLabels: ["research", "WIP"],
          includeDrafts: true,
          includeNoLabel: false,
        },
        next: defaults,
      }),
    ).toEqual({ kind: "reset" });
    expect(
      buildRepositoryInventoryFilterChange({
        current: { ...defaults, hiddenLabels: ["Research"] },
        next: { ...defaults, hiddenLabels: ["research"] },
      }),
    ).toBeNull();
  });

  it("rejects a non-reset value that changes multiple controls", () => {
    const defaults = getDefaultRepositoryInventoryFilters();
    expect(() =>
      buildRepositoryInventoryFilterChange({
        current: defaults,
        next: { ...defaults, hiddenLabels: ["research"], includeDrafts: true },
      }),
    ).toThrow("Pull request filters changed through more than one control.");
  });

  it("builds stable PR-only options from complete facets and stale hidden labels", () => {
    expect(
      buildPullRequestFilterOptions({
        labelFacets: [
          { name: "customer", color: "1A7F37", pullRequestCount: 4 },
          { name: "Bug", color: "d73a4a", pullRequestCount: 2 },
        ],
        hiddenLabels: ["research", "bug"],
        includeNoLabel: false,
        noLabelPullRequestCount: 7,
      }),
    ).toEqual([
      {
        kind: "label",
        key: "bug",
        name: "Bug",
        color: "#d73a4a",
        pullRequestCount: 2,
        included: false,
      },
      {
        kind: "label",
        key: "customer",
        name: "customer",
        color: "#1a7f37",
        pullRequestCount: 4,
        included: true,
      },
      {
        kind: "label",
        key: "research",
        name: "research",
        pullRequestCount: 0,
        included: false,
      },
      {
        kind: "no_label",
        key: "\u0000no-label",
        name: "No label",
        pullRequestCount: 7,
        included: false,
      },
    ]);
  });

  it("coalesces case-variant facets without double-counting pull requests", () => {
    expect(
      buildPullRequestFilterOptions({
        labelFacets: [
          { name: "Bug", pullRequestCount: 2 },
          { name: "bug", color: "d73a4a", pullRequestCount: 3 },
        ],
        hiddenLabels: [],
        includeNoLabel: true,
        noLabelPullRequestCount: 0,
      })[0],
    ).toEqual({
      kind: "label",
      key: "bug",
      name: "Bug",
      color: "#d73a4a",
      pullRequestCount: 3,
      included: true,
    });
  });
});
