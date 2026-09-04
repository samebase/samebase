import { describe, expect, it } from "vite-plus/test";

import {
  findRepositorySearchMatch,
  getFuzzyMatchIndices,
  repositoryMatchesSearch,
  splitRepositoryFullNameMatch,
} from "@/repository/setup/repositorySearch";

describe("getFuzzyMatchIndices", () => {
  it("returns indices for a fuzzy match", () => {
    expect(getFuzzyMatchIndices("smb", "samebase")).toEqual([0, 2, 4]);
  });

  it("ignores spaces in the query", () => {
    expect(getFuzzyMatchIndices("sm b", "samebase")).toEqual([0, 2, 4]);
  });

  it("returns null when the target does not match", () => {
    expect(getFuzzyMatchIndices("zzz", "samebase")).toBeNull();
  });
});

describe("repositoryMatchesSearch", () => {
  const repository = {
    name: "samebase",
    full_name: "samebase/samebase",
  };

  it("matches by repository name", () => {
    expect(repositoryMatchesSearch("sam", repository)).toBe(true);
  });

  it("matches by owner name", () => {
    expect(repositoryMatchesSearch("samebase", repository)).toBe(true);
  });

  it("matches by full repository name", () => {
    expect(repositoryMatchesSearch("samebase/samebase", repository)).toBe(true);
  });

  it("rejects unrelated queries", () => {
    expect(repositoryMatchesSearch("random", repository)).toBe(false);
  });
});

describe("findRepositorySearchMatch", () => {
  const repository = {
    name: "samebase",
    full_name: "samebase/samebase",
  };

  it("returns repo match metadata", () => {
    expect(findRepositorySearchMatch("sam", repository)).toEqual({
      kind: "repo",
      indices: [0, 1, 2],
    });
  });

  it("returns full-name match metadata when only the combined path matches", () => {
    expect(findRepositorySearchMatch("samebase/samebase", repository)).toEqual({
      kind: "full_name",
      indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    });
  });
});

describe("splitRepositoryFullNameMatch", () => {
  it("splits full-name indices across owner, slash, and repo segments", () => {
    expect(
      splitRepositoryFullNameMatch({
        ownerName: "samebase",
        indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      }),
    ).toEqual({
      ownerIndices: [0, 1, 2, 3, 4, 5, 6, 7],
      repoIndices: [0, 1],
      slashMatched: true,
    });
  });
});
