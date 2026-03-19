import { describe, expect, it } from "vitest";

import {
  getFuzzyMatchIndices,
  repositoryMatchesSearch,
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
