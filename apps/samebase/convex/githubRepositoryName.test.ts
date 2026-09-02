import { describe, it, expect } from "vite-plus/test";

import {
  parseGitHubRepositoryFullName,
  toSafeGitHubRepositoryName,
  tryParseGitHubRepositoryFullName,
} from "../shared/githubRepositoryName";

describe("toSafeGitHubRepositoryName", () => {
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
      expect(toSafeGitHubRepositoryName(input)).toBe(output);
    }
  });
});

describe("GitHub repository full name parsing", () => {
  it("parses the GitHub owner and repository name", () => {
    expect(parseGitHubRepositoryFullName(" samebase / samebase ")).toEqual({
      owner: "samebase",
      name: "samebase",
    });
  });

  it("returns null for invalid repository full names", () => {
    expect(tryParseGitHubRepositoryFullName("samebase")).toBeNull();
    expect(tryParseGitHubRepositoryFullName("samebase/")).toBeNull();
    expect(tryParseGitHubRepositoryFullName("/samebase")).toBeNull();
    expect(tryParseGitHubRepositoryFullName("samebase/samebase/extra")).toBeNull();
  });

  it("throws for invalid repository full names", () => {
    expect(() => parseGitHubRepositoryFullName("samebase")).toThrow("Invalid repository full name");
  });
});
