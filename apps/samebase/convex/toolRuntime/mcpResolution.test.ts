import { describe, expect, it } from "vite-plus/test";

import { findRepositoryByReference } from "./mcpResolution";

describe("findRepositoryByReference", () => {
  const repository = (repositoryId: string, githubRepositoryFullName: string) => ({
    repositoryId,
    githubRepositoryFullName,
  });
  const site = repository("repository-1", "samebase/site");
  const admin = repository("repository-2", "samebase/admin");

  it("accepts a repositoryId or a GitHub full name in any case", () => {
    expect(findRepositoryByReference([site, admin], "repository-2")).toBe(admin);
    expect(findRepositoryByReference([site, admin], " Samebase/Site ")).toBe(site);
  });

  it("says how to find or connect a repository that matches none", () => {
    expect(() => findRepositoryByReference([site, admin], "samebase/missing")).toThrow(
      "No Samebase repository matches samebase/missing. Pass owner/name or a repositoryId from repository_list. To add an existing GitHub repository to Samebase, call repository_connect.",
    );
  });

  it("asks for a repositoryId when one full name matches several repositories", () => {
    expect(() =>
      findRepositoryByReference(
        [site, repository("repository-3", "samebase/site")],
        "samebase/site",
      ),
    ).toThrow(
      "Several Samebase repositories match samebase/site: repository-1, repository-3. Pass one repositoryId from repository_list.",
    );
  });
});
