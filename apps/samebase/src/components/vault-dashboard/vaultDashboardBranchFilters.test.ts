import { describe, expect, it } from "vite-plus/test";
import {
  buildVaultBranchFilterOptions,
  buildVaultPullRequestFilterOptions,
  filterVaultRemoteBranches,
  getDefaultVaultBranchFilters,
  normalizeVaultBranchFilters,
  setVaultBranchFilterLabelIncluded,
} from "./vaultDashboardBranchFilters";

describe("vaultBranchFilters", () => {
  it("defaults to hidden drafts with all labels included", () => {
    expect(getDefaultVaultBranchFilters()).toEqual({
      hiddenLabels: [],
      includeDrafts: false,
      includeNoLabel: true,
    });
  });

  it("normalizes duplicate hidden labels case-insensitively", () => {
    expect(
      normalizeVaultBranchFilters({
        hiddenLabels: [" Research ", "research", "wip"],
        includeDrafts: false,
      }),
    ).toEqual({
      hiddenLabels: ["Research", "wip"],
      includeDrafts: false,
      includeNoLabel: true,
    });
  });

  it("toggles included labels without duplicating case variants", () => {
    const withoutResearch = setVaultBranchFilterLabelIncluded({
      hiddenLabels: ["WIP"],
      labelName: "research",
      included: false,
    });

    expect(withoutResearch).toEqual(["research", "WIP"]);

    expect(
      setVaultBranchFilterLabelIncluded({
        hiddenLabels: withoutResearch,
        labelName: "wip",
        included: true,
      }),
    ).toEqual(["research"]);
  });

  it("hides branches that match an excluded label and hides drafts by default", () => {
    const branches = [
      {
        name: "main",
        pullRequestLabels: [{ name: "Research", color: "cccccc" }],
        pullRequestIsDraft: false,
      },
      {
        name: "draft-task",
        pullRequestLabels: [{ name: "ops", color: "ffffff" }],
        pullRequestIsDraft: true,
      },
      {
        name: "ready-task",
        pullRequestLabels: [{ name: "ops", color: "ffffff" }],
        pullRequestIsDraft: false,
      },
    ];

    expect(
      filterVaultRemoteBranches(branches, {
        hiddenLabels: ["research"],
        includeDrafts: false,
        includeNoLabel: true,
      }),
    ).toEqual([
      {
        name: "ready-task",
        pullRequestLabels: [{ name: "ops", color: "ffffff" }],
        pullRequestIsDraft: false,
      },
    ]);
  });

  it("includes drafts when the toggle is enabled", () => {
    const branches = [
      { name: "draft-task", pullRequestIsDraft: true },
      { name: "ready-task", pullRequestIsDraft: false },
    ];

    expect(
      filterVaultRemoteBranches(branches, {
        hiddenLabels: [],
        includeDrafts: true,
        includeNoLabel: true,
      }),
    ).toEqual(branches);
  });

  it("hides unlabeled branches when the no-label option is deselected", () => {
    const branches = [
      { name: "unlabeled" },
      {
        name: "labeled",
        pullRequestLabels: [{ name: "ops", color: "ffffff" }],
      },
    ];

    expect(
      filterVaultRemoteBranches(branches, {
        hiddenLabels: [],
        includeDrafts: false,
        includeNoLabel: false,
      }),
    ).toEqual([
      {
        name: "labeled",
        pullRequestLabels: [{ name: "ops", color: "ffffff" }],
      },
    ]);
  });

  it("sorts filter options alphabetically and keeps no-label last", () => {
    expect(
      buildVaultBranchFilterOptions({
        branches: [
          {
            pullRequestLabels: [{ name: "customer", color: "1a7f37" }],
          },
          {
            pullRequestLabels: [{ name: "bug", color: "d73a4a" }],
          },
          {},
        ],
        hiddenLabels: ["research"],
        includeNoLabel: false,
      }),
    ).toEqual([
      {
        key: "bug",
        name: "bug",
        color: "#d73a4a",
        count: 1,
        included: true,
        isNoLabel: false,
      },
      {
        key: "customer",
        name: "customer",
        color: "#1a7f37",
        count: 1,
        included: true,
        isNoLabel: false,
      },
      {
        key: "research",
        name: "research",
        count: 0,
        included: false,
        isNoLabel: false,
      },
      {
        key: "\u0000no-label",
        name: "No label",
        count: 1,
        included: false,
        isNoLabel: true,
      },
    ]);
  });

  it("keeps the synthetic no-label option distinct from a real label key", () => {
    expect(
      buildVaultBranchFilterOptions({
        branches: [
          {
            pullRequestLabels: [{ name: "__no_label__", color: "d73a4a" }],
          },
          {},
        ],
        hiddenLabels: ["__no_label__"],
        includeNoLabel: true,
      }),
    ).toEqual([
      {
        key: "__no_label__",
        name: "__no_label__",
        color: "#d73a4a",
        count: 1,
        included: false,
        isNoLabel: false,
      },
      {
        key: "\u0000no-label",
        name: "No label",
        count: 1,
        included: true,
        isNoLabel: true,
      },
    ]);
  });

  it("builds repository label choices without inventing pull request counts", () => {
    expect(
      buildVaultPullRequestFilterOptions({
        labels: [
          { name: "customer", color: "1a7f37" },
          { name: "Bug", color: "d73a4a" },
          { name: "bug", color: "000000" },
        ],
        hiddenLabels: ["research", "BUG"],
        includeNoLabel: false,
      }),
    ).toEqual([
      {
        key: "bug",
        name: "Bug",
        color: "#d73a4a",
        included: false,
        isNoLabel: false,
      },
      {
        key: "customer",
        name: "customer",
        color: "#1a7f37",
        included: true,
        isNoLabel: false,
      },
      {
        key: "research",
        name: "research",
        included: false,
        isNoLabel: false,
      },
      {
        key: "\u0000no-label",
        name: "No label",
        included: false,
        isNoLabel: true,
      },
    ]);
  });
});
