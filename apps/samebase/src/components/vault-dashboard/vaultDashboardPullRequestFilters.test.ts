import { describe, expect, it } from "vite-plus/test";
import {
  buildVaultPullRequestFilterOptions,
  filterVaultPullRequests,
  getDefaultVaultPullRequestFilters,
  normalizeVaultPullRequestFilters,
  setVaultPullRequestFilterLabelIncluded,
} from "./vaultDashboardPullRequestFilters";

describe("ui_vaultPullRequests_filters", () => {
  it("defaults to hidden drafts with all labels included", () => {
    expect(getDefaultVaultPullRequestFilters()).toEqual({
      hiddenLabels: [],
      includeDrafts: false,
      includeNoLabel: true,
    });
  });

  it("normalizes duplicate hidden labels case-insensitively", () => {
    expect(
      normalizeVaultPullRequestFilters({
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
    const withoutResearch = setVaultPullRequestFilterLabelIncluded({
      hiddenLabels: ["WIP"],
      labelName: "research",
      included: false,
    });

    expect(withoutResearch).toEqual(["research", "WIP"]);

    expect(
      setVaultPullRequestFilterLabelIncluded({
        hiddenLabels: withoutResearch,
        labelName: "wip",
        included: true,
      }),
    ).toEqual(["research"]);
  });

  it("hides pull requests that match an excluded label and hides drafts by default", () => {
    const pullRequests = [
      {
        name: "main",
        labels: [{ name: "Research", color: "cccccc" }],
        isDraft: false,
      },
      {
        name: "draft-task",
        labels: [{ name: "ops", color: "ffffff" }],
        isDraft: true,
      },
      {
        name: "ready-task",
        labels: [{ name: "ops", color: "ffffff" }],
        isDraft: false,
      },
    ];

    expect(
      filterVaultPullRequests(pullRequests, {
        hiddenLabels: ["research"],
        includeDrafts: false,
        includeNoLabel: true,
      }),
    ).toEqual([
      {
        name: "ready-task",
        labels: [{ name: "ops", color: "ffffff" }],
        isDraft: false,
      },
    ]);
  });

  it("includes drafts when the toggle is enabled", () => {
    const pullRequests = [
      { name: "draft-task", isDraft: true },
      { name: "ready-task", isDraft: false },
    ];

    expect(
      filterVaultPullRequests(pullRequests, {
        hiddenLabels: [],
        includeDrafts: true,
        includeNoLabel: true,
      }),
    ).toEqual(pullRequests);
  });

  it("hides unlabeled pull requests when the no-label option is deselected", () => {
    const pullRequests = [
      { name: "unlabeled" },
      {
        name: "labeled",
        labels: [{ name: "ops", color: "ffffff" }],
      },
    ];

    expect(
      filterVaultPullRequests(pullRequests, {
        hiddenLabels: [],
        includeDrafts: false,
        includeNoLabel: false,
      }),
    ).toEqual([
      {
        name: "labeled",
        labels: [{ name: "ops", color: "ffffff" }],
      },
    ]);
  });

  it("sorts filter options alphabetically and keeps no-label last", () => {
    expect(
      buildVaultPullRequestFilterOptions({
        pullRequests: [
          {
            labels: [{ name: "customer", color: "1a7f37" }],
          },
          {
            labels: [{ name: "bug", color: "d73a4a" }],
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
        included: true,
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

  it("keeps the synthetic no-label option distinct from a real label key", () => {
    expect(
      buildVaultPullRequestFilterOptions({
        pullRequests: [
          {
            labels: [{ name: "__no_label__", color: "d73a4a" }],
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
        included: false,
        isNoLabel: false,
      },
      {
        key: "\u0000no-label",
        name: "No label",
        included: true,
        isNoLabel: true,
      },
    ]);
  });
});
