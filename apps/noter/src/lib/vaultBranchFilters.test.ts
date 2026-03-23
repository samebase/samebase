import { describe, expect, it } from "vitest";
import {
  buildVaultBranchFilterLabelOptions,
  filterVaultRemoteBranches,
  getDefaultVaultBranchFilters,
  normalizeVaultBranchFilters,
  setVaultBranchFilterHiddenLabel,
} from "./vaultBranchFilters";

describe("vaultBranchFilters", () => {
  it("defaults to hidden drafts with no hidden labels", () => {
    expect(getDefaultVaultBranchFilters()).toEqual({
      hiddenLabels: [],
      includeDrafts: false,
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
    });
  });

  it("toggles hidden labels without duplicating case variants", () => {
    const withResearch = setVaultBranchFilterHiddenLabel({
      hiddenLabels: ["WIP"],
      labelName: "research",
      selected: true,
    });

    expect(withResearch).toEqual(["research", "WIP"]);

    expect(
      setVaultBranchFilterHiddenLabel({
        hiddenLabels: withResearch,
        labelName: "wip",
        selected: false,
      }),
    ).toEqual(["research"]);
  });

  it("hides branches that match a hidden label and hides drafts by default", () => {
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
      }),
    ).toEqual(branches);
  });

  it("keeps persisted hidden labels visible in the options even when absent", () => {
    expect(
      buildVaultBranchFilterLabelOptions({
        branches: [
          {
            pullRequestLabels: [{ name: "bug", color: "d73a4a" }],
          },
        ],
        hiddenLabels: ["research"],
      }),
    ).toEqual([
      { name: "research", count: 0, selected: true },
      { name: "bug", color: "#d73a4a", count: 1, selected: false },
    ]);
  });
});
