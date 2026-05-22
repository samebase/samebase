import { describe, it, expect } from "vite-plus/test";

import { toSafeRepoName } from "../shared/repoName";

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
