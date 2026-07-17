import { describe, expect, it } from "vite-plus/test";
import {
  buildVaultPullRequestFilterOptions,
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
