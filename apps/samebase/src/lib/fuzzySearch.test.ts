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
      { path: "apps", matches: [] },
      { path: "apps/samebase", matches: [] },
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

  it("limits fuzzy results", () => {
    expect(
      rankFuzzyPathMatches({
        paths: ["apps/api", "apps/samebase", "packages/app"],
        query: "app",
        limit: 2,
      }).map((match) => match.path),
    ).toEqual(["apps/api", "apps/samebase"]);
  });
});
