import { describe, expect, it } from "vite-plus/test";

import { buildGitHubBranchTreeUrl, encodeGitHubPath } from "./githubUrls";

describe("githubUrls", () => {
  it("encodes path segments without collapsing slash-delimited GitHub paths", () => {
    expect(encodeGitHubPath("feature/link branch/#42")).toBe(
      "feature/link%20branch/%2342",
    );
  });

  it("builds a branch tree URL for GitHub repository branches", () => {
    expect(
      buildGitHubBranchTreeUrl({
        repositoryFullName: "noter-md/noter",
        branchName: "codex/dashboard branch-link",
      }),
    ).toBe(
      "https://github.com/noter-md/noter/tree/codex/dashboard%20branch-link",
    );
  });
});
