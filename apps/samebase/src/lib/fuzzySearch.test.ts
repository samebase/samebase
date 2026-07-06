import { describe, expect, it } from "vite-plus/test";

import { rankFuzzyPathMatches } from "@/lib/fuzzySearch.tsx";

describe("rankFuzzyPathMatches", () => {
  it("returns empty-query paths in source order up to the limit", () => {
    expect(
      rankFuzzyPathMatches({
        paths: ["apps", "apps/samebase", "docs"],
        query: "",
        limit: 2,
      }),
    ).toEqual([
      { path: "apps", score: 0, matches: [] },
      { path: "apps/samebase", score: 0, matches: [] },
    ]);
  });

  it("ranks fuzzy matches by score and path", () => {
    expect(
      rankFuzzyPathMatches({
        paths: ["packages/app", "apps/api", "apps/samebase"],
        query: "app",
        limit: 8,
      }).map((match) => match.path),
    ).toEqual(["apps/api", "apps/samebase", "packages/app"]);
  });

  it("deduplicates paths before ranking", () => {
    expect(
      rankFuzzyPathMatches({
        paths: ["apps/api", "apps/api", "apps/samebase"],
        query: "api",
        limit: 8,
      }).map((match) => match.path),
    ).toEqual(["apps/api"]);
  });
});
