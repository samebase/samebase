import { describe, expect, it } from "vite-plus/test";

import {
  buildPullRequestFilterOptions,
  filterRepositoryInventoryItems,
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

  it("filters only pull request rows and always retains independent branch rows", () => {
    const items = [
      { kind: "branch" as const, name: "main" },
      {
        kind: "branch" as const,
        name: "feature/research",
      },
      {
        kind: "pull_request" as const,
        number: 1,
        pullRequestIsDraft: false,
        pullRequestLabels: [{ name: "Research", color: "cccccc" }],
      },
      {
        kind: "pull_request" as const,
        number: 2,
        pullRequestIsDraft: true,
        pullRequestLabels: [{ name: "ops", color: "ffffff" }],
      },
      {
        kind: "pull_request" as const,
        number: 3,
        pullRequestIsDraft: false,
        pullRequestLabels: [],
      },
    ];

    expect(
      filterRepositoryInventoryItems(items, {
        hiddenLabels: ["research"],
        includeDrafts: false,
        includeNoLabel: false,
      }),
    ).toEqual([
      { kind: "branch", name: "main" },
      { kind: "branch", name: "feature/research" },
    ]);
  });

  it("includes draft and unlabeled pull requests when enabled", () => {
    const items = [
      {
        kind: "pull_request" as const,
        number: 1,
        pullRequestIsDraft: true,
        pullRequestLabels: [],
      },
    ];

    expect(
      filterRepositoryInventoryItems(items, {
        hiddenLabels: [],
        includeDrafts: true,
        includeNoLabel: true,
      }),
    ).toEqual(items);
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
