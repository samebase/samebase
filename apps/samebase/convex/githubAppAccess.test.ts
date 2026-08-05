import { describe, expect, it } from "vite-plus/test";

import { requireGitHubRepositoryOwnerId } from "./githubAppAccess";

describe("requireGitHubRepositoryOwnerId", () => {
  it("accepts only the selected organization owner ID", () => {
    expect(
      requireGitHubRepositoryOwnerId({
        expectedOwnerId: "101",
        repositoryOwnerId: 101,
      }),
    ).toBe("101");

    expect(() =>
      requireGitHubRepositoryOwnerId({
        expectedOwnerId: "101",
        repositoryOwnerId: 202,
      }),
    ).toThrow("GitHub repository owner does not match the selected organization.");
  });
});
