import { describe, expect, it } from "vite-plus/test";

import {
  buildGitHubBranchTreeUrl,
  buildGitHubRepositoryAppInstallationsUrl,
  encodeGitHubPath,
} from "./githubUrls";

describe("githubUrls", () => {
  it("encodes path segments without collapsing slash-delimited GitHub paths", () => {
    expect(encodeGitHubPath("feature/link branch/#42")).toBe("feature/link%20branch/%2342");
  });

  it("builds a branch tree URL for GitHub repository branches", () => {
    expect(
      buildGitHubBranchTreeUrl({
        githubRepositoryFullName: "samebase/samebase",
        branchName: "codex/dashboard branch-link",
      }),
    ).toBe("https://github.com/samebase/samebase/tree/codex/dashboard%20branch-link");
  });

  it("builds a repository GitHub Apps settings URL", () => {
    expect(
      buildGitHubRepositoryAppInstallationsUrl({
        githubRepositoryFullName: "samebase/example app",
      }),
    ).toBe("https://github.com/samebase/example%20app/settings/installations");
  });
});
