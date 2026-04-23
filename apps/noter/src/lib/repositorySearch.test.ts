import { describe, expect, it } from "vite-plus/test";

import {
  findRepositorySearchMatch,
  getFuzzyMatchIndices,
  repositoryMatchesSearch,
  splitRepositoryFullNameMatch,
} from "@/lib/repositorySearch";

describe("getFuzzyMatchIndices", () => {
  it("returns indices for a fuzzy match", () => {
    expect(getFuzzyMatchIndices("ntr", "noter")).toEqual([0, 2, 4]);
  });

  it("ignores spaces in the query", () => {
    expect(getFuzzyMatchIndices("nt r", "noter")).toEqual([0, 2, 4]);
  });

  it("returns null when the target does not match", () => {
    expect(getFuzzyMatchIndices("zzz", "noter")).toBeNull();
  });
});

describe("repositoryMatchesSearch", () => {
  const repository = {
    name: "noter",
    full_name: "noter-md/noter",
  };

  it("matches by repository name", () => {
    expect(repositoryMatchesSearch("not", repository)).toBe(true);
  });

  it("matches by owner name", () => {
    expect(repositoryMatchesSearch("noter-md", repository)).toBe(true);
  });

  it("matches by full repository name", () => {
    expect(repositoryMatchesSearch("notermd/noter", repository)).toBe(true);
  });

  it("rejects unrelated queries", () => {
    expect(repositoryMatchesSearch("random", repository)).toBe(false);
  });
});

describe("findRepositorySearchMatch", () => {
  const repository = {
    name: "noter",
    full_name: "noter-md/noter",
  };

  it("returns repo match metadata", () => {
    expect(findRepositorySearchMatch("not", repository)).toEqual({
      kind: "repo",
      indices: [0, 1, 2],
    });
  });

  it("returns full-name match metadata when only the combined path matches", () => {
    expect(findRepositorySearchMatch("notermd/noter", repository)).toEqual({
      kind: "full_name",
      indices: [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13],
    });
  });
});

describe("splitRepositoryFullNameMatch", () => {
  it("splits full-name indices across owner, slash, and repo segments", () => {
    expect(
      splitRepositoryFullNameMatch({
        ownerName: "noter-md",
        indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      }),
    ).toEqual({
      ownerIndices: [0, 1, 2, 3, 4, 5, 6, 7],
      repoIndices: [0, 1],
      slashMatched: true,
    });
  });
});
