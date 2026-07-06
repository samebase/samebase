import { describe, it, expect } from "vite-plus/test";

import {
  parseRepositoryFullName,
  toSafeRepoName,
  tryParseRepositoryFullName,
} from "../shared/repoName";

describe("toSafeRepoName", () => {
  it("sanitizes repository names", () => {
    const cases: Array<{ input: string; output: string }> = [
      { input: "My Repo", output: "My-Repo" },
      { input: "  My   Repo  ", output: "My-Repo" },
      { input: "repo - name", output: "repo-name" },
      { input: "repo--name", output: "repo-name" },
      { input: "repo__name", output: "repo__name" },
      { input: "Hello.World", output: "Hello.World" },
      { input: "hello@world", output: "hello-world" },
      { input: "Caf\u00e9 repo", output: "Caf-repo" },
      { input: "///asdf//", output: "-asdf-" },
      { input: "--leading", output: "-leading" },
      { input: "trailing--", output: "trailing-" },
      { input: ".leading", output: "leading" },
      { input: "trailing.", output: "trailing" },
      { input: "...", output: "" },
      { input: "***", output: "" },
      { input: "", output: "" },
      { input: "   ", output: "" },
    ];

    for (const { input, output } of cases) {
      expect(toSafeRepoName(input)).toBe(output);
    }
  });
});

describe("repository full name parsing", () => {
  it("parses owner and repository name", () => {
    expect(parseRepositoryFullName(" samebase / samebase ")).toEqual({
      owner: "samebase",
      name: "samebase",
    });
  });

  it("returns null for invalid repository full names", () => {
    expect(tryParseRepositoryFullName("samebase")).toBeNull();
    expect(tryParseRepositoryFullName("samebase/")).toBeNull();
    expect(tryParseRepositoryFullName("/samebase")).toBeNull();
    expect(tryParseRepositoryFullName("samebase/samebase/extra")).toBeNull();
  });

  it("throws for invalid repository full names", () => {
    expect(() => parseRepositoryFullName("samebase")).toThrow("Invalid repository full name");
  });
});
