import { describe, expect, it } from "vite-plus/test";

import {
  findRepositoryByReference,
  projectWorkerDiscoveryForMcp,
  requireSelectedWorkersBuildsToken,
  selectConvexCodeLocation,
  selectWorkersBuildsToken,
} from "./mcpResolution";

const tokens = [
  { uuid: "token-a", name: "Production" },
  { uuid: "token-b", name: "Staging" },
];

describe("selectWorkersBuildsToken", () => {
  it.each([
    {
      state: "given UUID in the current list",
      buildTokens: { accountId: "account", lastUsedBuildTokenUuid: "token-a", tokens },
      requestedUuid: " token-b ",
      expected: { state: "selected", uuid: "token-b" },
    },
    {
      state: "available last-used token",
      buildTokens: { accountId: "account", lastUsedBuildTokenUuid: "token-a", tokens },
      requestedUuid: undefined,
      expected: { state: "selected", uuid: "token-a" },
    },
    {
      state: "only token",
      buildTokens: {
        accountId: "account",
        lastUsedBuildTokenUuid: null,
        tokens: tokens.slice(0, 1),
      },
      requestedUuid: undefined,
      expected: { state: "selected", uuid: "token-a" },
    },
    {
      state: "no token",
      buildTokens: { accountId: "account", lastUsedBuildTokenUuid: null, tokens: [] },
      requestedUuid: undefined,
      expected: { state: "none" },
    },
  ])("picks the $state", ({ buildTokens, requestedUuid, expected }) => {
    expect(selectWorkersBuildsToken(buildTokens, requestedUuid)).toEqual(expected);
  });

  it("lists names and UUIDs when several tokens exist and none was used last", () => {
    expect(() =>
      selectWorkersBuildsToken(
        { accountId: "account", lastUsedBuildTokenUuid: null, tokens },
        undefined,
      ),
    ).toThrow(
      "The Cloudflare account has several Workers Builds tokens and none was used last: Production (token-a), Staging (token-b). Ask the user which token to use, then pass its UUID as buildTokenUuid.",
    );
  });

  it("rejects a given UUID that is not in the current list", () => {
    expect(() =>
      selectWorkersBuildsToken(
        { accountId: "account", lastUsedBuildTokenUuid: "token-a", tokens },
        "deleted-token",
      ),
    ).toThrow(
      "Workers Builds token deleted-token is not in the Cloudflare account's current token list.",
    );
  });

  it("points Worker tools to the setup guide when the account has no token", () => {
    expect(() => requireSelectedWorkersBuildsToken({ state: "none" })).toThrow(
      "The Cloudflare account has no Workers Builds token yet. Follow https://samebase.com/docs/cloudflare-setup to create the first token, then retry.",
    );
  });
});

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

describe("selectConvexCodeLocation", () => {
  const configLocation = { kind: "config" as const, convexConfigPath: "convex.json" };
  const directoryLocation = { kind: "directory" as const, convexDirectoryPath: "apps/web/convex" };

  it("uses the only location without asking and matches a requested directory with or without a slash", () => {
    expect(
      selectConvexCodeLocation({
        repositoryFullName: "samebase/site",
        locations: [configLocation],
        requestedPath: undefined,
      }),
    ).toBe(configLocation);
    expect(
      selectConvexCodeLocation({
        repositoryFullName: "samebase/site",
        locations: [configLocation, directoryLocation],
        requestedPath: "apps/web/convex",
      }),
    ).toBe(directoryLocation);
  });

  it("lists the found locations when the requested one is missing", () => {
    expect(() =>
      selectConvexCodeLocation({
        repositoryFullName: "samebase/site",
        locations: [configLocation, directoryLocation],
        requestedPath: "apps/admin/convex.json",
      }),
    ).toThrow(
      "Convex code location apps/admin/convex.json was not found on the default branch of samebase/site. Found: convex.json, apps/web/convex/.",
    );
  });

  it("says what to add when the repository has no Convex code location", () => {
    expect(() =>
      selectConvexCodeLocation({
        repositoryFullName: "samebase/site",
        locations: [],
        requestedPath: undefined,
      }),
    ).toThrow("No Convex code location was found on the default branch of samebase/site.");
  });
});

describe("projectWorkerDiscoveryForMcp", () => {
  it("keeps rows only for attachable and connectable Workers and counts the rest", () => {
    expect(
      projectWorkerDiscoveryForMcp({
        inventoryState: "complete",
        workers: [
          {
            attachment: "attachable",
            workerName: "site",
            workerTag: "site-tag",
            rootDirectory: "apps/site",
          },
          { attachment: "connectable", workerName: "legacy-landing", workerTag: "legacy-tag" },
          { attachment: "attached", workerName: "admin", workerTag: "admin-tag" },
          { attachment: "attached_elsewhere", workerName: "other", workerTag: "other-tag" },
          { attachment: "connected_elsewhere", workerName: "blog", workerTag: "blog-tag" },
          { attachment: "connected_elsewhere", workerName: "docs", workerTag: "docs-tag" },
          { attachment: "unavailable", workerName: "broken", workerTag: "broken-tag" },
        ],
      }),
    ).toEqual({
      inventoryState: "complete",
      workers: [
        { attachment: "attachable", workerName: "site", rootDirectory: "apps/site" },
        { attachment: "connectable", workerName: "legacy-landing" },
      ],
      counts: { attached: 1, attachedElsewhere: 1, connectedElsewhere: 2, unavailable: 1 },
    });
  });
});
