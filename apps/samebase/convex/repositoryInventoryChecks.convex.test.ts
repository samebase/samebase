import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ConvexError } from "convex/values";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

const now = 1_700_000_000_000;
const repositoryNodeId = "R_inventory";
const repositoryDatabaseId = "123";
const repositoryFullName = "ada/inventory";
const headSha = "abc123";
const rowKey = "branch:main";

const noChecks = {
  state: "success" as const,
  totalCount: 0,
  checkRunCount: 0,
  statusContextCount: 0,
  successCount: 0,
  failureCount: 0,
  runningCount: 0,
  neutralCount: 0,
  unknownCount: 0,
};

function emptyCheckContexts() {
  return {
    totalCount: 0,
    checkRunCount: 0,
    statusContextCount: 0,
    checkRunCountsByState: [],
    statusContextCountsByState: [],
    pageInfo: { hasNextPage: false, endCursor: null },
    nodes: [],
  };
}

function checkRunNode(id: string) {
  return {
    __typename: "CheckRun",
    id,
    name: `check ${id}`,
    status: "COMPLETED",
    conclusion: "SUCCESS",
    detailsUrl: `https://ci.example.com/builds/${id}`,
    url: `https://github.com/ada/inventory/runs/${id}`,
    startedAt: "2023-11-14T22:13:19.000Z",
    completedAt: "2023-11-14T22:13:20.000Z",
    checkSuite: { app: { name: "CI", slug: "ci" } },
  };
}

function graphqlResponse(args?: {
  contexts?: unknown;
  cost?: number;
  repositoryId?: string;
  databaseId?: number;
  nameWithOwner?: string;
  commitOid?: string;
  repositoryObject?: unknown;
}): Response {
  const repositoryObject =
    args?.repositoryObject === undefined
      ? {
          __typename: "Commit",
          oid: args?.commitOid ?? headSha,
          statusCheckRollup: {
            contexts: args?.contexts ?? emptyCheckContexts(),
          },
        }
      : args.repositoryObject;
  return new Response(
    JSON.stringify({
      data: {
        repository: {
          __typename: "Repository",
          id: args?.repositoryId ?? repositoryNodeId,
          databaseId: args?.databaseId ?? Number(repositoryDatabaseId),
          nameWithOwner: args?.nameWithOwner ?? repositoryFullName,
          object: repositoryObject,
        },
        rateLimit: {
          cost: args?.cost ?? 1,
          limit: 5_000,
          remaining: 4_000,
          resetAt: "2023-11-14T23:13:20.000Z",
        },
      },
    }),
    { headers: { "content-type": "application/json" } },
  );
}

async function createChecksTest() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    const intruderId = await ctx.db.insert("users", {
      name: "Grace",
      email: "grace@example.com",
      isApproved: true,
    });
    await ctx.db.insert("providerConnections", {
      kind: "github",
      userId,
      auth: { method: "api_key", credential: "github-token" },
      githubAccountId: 101,
      username: "ada",
      createdAt: now,
      updatedAt: now,
    });
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName,
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: now - 3,
      updatedAt: now - 2,
      completedAt: now - 1,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: repositoryDatabaseId,
      ghRepoNodeId: repositoryNodeId,
      githubOwner: "ada",
      githubName: "inventory",
      routeRepositoryKey: repositoryFullName,
      routeOwner: "ada",
      routeName: "inventory",
      defaultBranch: "main",
      visibility: "private",
      connectedAt: now,
    });
    const snapshotFields = {
      state: "ready" as const,
      observedAt: now,
      repositoryNodeId,
      repositoryFullName,
      defaultBranch: "main",
      branchCount: 1,
      buildCount: 0,
      buildAssociationCount: 0,
      unattributedBuildCount: 0,
      pullRequestCount: 0,
      labelCount: 0,
      labelChunkCount: 0,
      labelFacetCount: 0,
      noLabelPullRequestCount: 0,
      crawlCost: 1,
      summaryDefaultBranch: {
        state: "ready" as const,
        name: "main",
        headSha,
        checkState: "none" as const,
      },
      vaultId,
    };
    const snapshotId = await ctx.db.insert("vaultRepositoryInventorySnapshots", {
      ...snapshotFields,
      fingerprint: "active",
    });
    const retiredSnapshotId = await ctx.db.insert("vaultRepositoryInventorySnapshots", {
      ...snapshotFields,
      fingerprint: "retired",
    });
    const filterViewId = await ctx.db.insert("vaultRepositoryInventoryFilterViews", {
      state: "complete",
      vaultId,
      snapshotId,
      filterRevision: 0,
      totalPullRequestCount: 0,
      processedPullRequestCount: 0,
      visiblePullRequestCount: 0,
    });
    await ctx.db.insert("vaultRepositoryInventories", {
      userId,
      vaultId,
      wantedUntil: now + 60_000,
      writeVersion: 0,
      observedWriteVersion: 0,
      requiredFailureCount: 0,
      lifecycle: { state: "idle" },
      publication: {
        snapshotId,
        filterViewId,
        filterRevision: 0,
        repositoryNodeId,
        repositoryFullName,
        defaultBranch: "main",
        publishedAt: now,
        checkedAt: now,
        fingerprint: "active",
        unattributedBuildCount: 0,
      },
    });
    for (const [itemSnapshotId, itemHeadSha] of [
      [snapshotId, headSha],
      [retiredSnapshotId, "retired-sha"],
    ] as const) {
      await ctx.db.insert("vaultRepositoryInventoryItems", {
        kind: "branch",
        vaultId,
        snapshotId: itemSnapshotId,
        sortGroup: 0,
        sortTime: 0,
        rowKey,
        buildCount: 0,
        expectedBuildCount: 0,
        name: "main",
        isDefault: true,
        comparison: { state: "ready", aheadBy: 0, behindBy: 0 },
        headCommit: {
          sha: itemHeadSha,
          title: "Main commit",
          authoredAt: now,
          checks: noChecks,
        },
      });
    }
    return { intruderId, retiredSnapshotId, snapshotId, userId, vaultId };
  });
  return {
    ids,
    t,
    asUser: t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    }),
    asIntruder: t.withIdentity({
      subject: `${ids.intruderId}|test-session`,
      tokenIdentifier: `test:${ids.intruderId}`,
    }),
  };
}

function checksActionArgs(ids: {
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
}) {
  return {
    vaultId: ids.vaultId,
    snapshotId: ids.snapshotId,
    rowKey,
    cursor: null,
    previousPageSignatures: [],
  };
}

describe("on-demand repository inventory checks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("resolves only the authenticated viewer's active published row", async () => {
    const { asIntruder, asUser, ids, t } = await createChecksTest();

    await expect(
      asUser.query(internal.repositoryInventoryChecks.resolveRepositoryInventoryChecksContext, {
        vaultId: ids.vaultId,
        snapshotId: ids.snapshotId,
        rowKey,
      }),
    ).resolves.toEqual({
      userId: ids.userId,
      repositoryNodeId,
      repositoryFullName,
      headSha,
    });
    const forkRowKey = "pull-request:PR_fork";
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultRepositoryInventoryItems", {
        kind: "pull_request",
        vaultId: ids.vaultId,
        snapshotId: ids.snapshotId,
        sortGroup: 1,
        sortTime: 0,
        rowKey: forkRowKey,
        buildCount: 0,
        expectedBuildCount: 0,
        number: 7,
        url: "https://github.com/ada/inventory/pull/7",
        title: "Fork checks",
        isDraft: false,
        additions: 1,
        deletions: 0,
        changedFiles: 1,
        baseRefName: "main",
        isCrossRepository: true,
        headRepository: {
          state: "available",
          repositoryNodeId: "R_fork",
          repositoryFullName: "contributor/inventory",
        },
        headRefName: "fork-checks",
        comparison: { state: "ready", aheadBy: 1, behindBy: 0 },
        canOpenInSamebase: false,
        labelCount: 0,
        labelChunkCount: 0,
        headCommit: {
          sha: "fork-sha",
          title: "Fork commit",
          authoredAt: now,
          checks: noChecks,
        },
      });
    });
    await expect(
      asUser.query(internal.repositoryInventoryChecks.resolveRepositoryInventoryChecksContext, {
        vaultId: ids.vaultId,
        snapshotId: ids.snapshotId,
        rowKey: forkRowKey,
      }),
    ).resolves.toEqual({
      userId: ids.userId,
      repositoryNodeId: "R_fork",
      repositoryFullName: "contributor/inventory",
      headSha: "fork-sha",
    });
    const forkFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      graphqlResponse({
        repositoryId: "R_fork",
        nameWithOwner: "contributor/inventory",
        commitOid: "fork-sha",
      }),
    );
    vi.stubGlobal("fetch", forkFetch);
    await expect(
      asUser.action(api.repositoryInventoryChecks.listRepositoryInventoryChecksPage, {
        vaultId: ids.vaultId,
        snapshotId: ids.snapshotId,
        rowKey: forkRowKey,
        cursor: null,
        previousPageSignatures: [],
      }),
    ).resolves.toMatchObject({
      githubChecksUrl: "https://github.com/contributor/inventory/commit/fork-sha/checks",
    });
    const forkRequest = forkFetch.mock.calls[0]?.[1];
    if (typeof forkRequest?.body !== "string") {
      throw new Error("Expected a fork GitHub GraphQL request body.");
    }
    expect(JSON.parse(forkRequest.body)).toMatchObject({
      variables: { repositoryId: "R_fork", headSha: "fork-sha" },
    });
    await expect(
      asUser.query(internal.repositoryInventoryChecks.resolveRepositoryInventoryChecksContext, {
        vaultId: ids.vaultId,
        snapshotId: ids.retiredSnapshotId,
        rowKey,
      }),
    ).rejects.toThrow("Repository checks are unavailable.");
    await expect(
      asIntruder.query(internal.repositoryInventoryChecks.resolveRepositoryInventoryChecksContext, {
        vaultId: ids.vaultId,
        snapshotId: ids.snapshotId,
        rowKey,
      }),
    ).rejects.toThrow("Repository checks are unavailable.");

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      asIntruder.action(
        api.repositoryInventoryChecks.listRepositoryInventoryChecksPage,
        checksActionArgs(ids),
      ),
    ).rejects.toThrow("Repository checks are unavailable.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes mixed check runs and commit statuses without deployment-only fields", async () => {
    const { asUser, ids, t } = await createChecksTest();
    const contexts = {
      totalCount: 2,
      checkRunCount: 1,
      statusContextCount: 1,
      checkRunCountsByState: [{ state: "FAILURE", count: 1 }],
      statusContextCountsByState: [{ state: "EXPECTED", count: 1 }],
      pageInfo: { hasNextPage: false, endCursor: "page-end" },
      nodes: [
        {
          ...checkRunNode("CR_1"),
          name: "Workers Builds: app",
          conclusion: "FAILURE",
          checkSuite: {
            app: { name: "Cloudflare Workers and Pages", slug: "cloudflare-workers-and-pages" },
          },
        },
        {
          __typename: "StatusContext",
          id: "SC_1",
          state: "EXPECTED",
          context: "deploy/ready",
          description: "Deployment is ready",
          targetUrl: "https://status.example.com/deploy/1",
          updatedAt: "2023-11-14T22:13:20.000Z",
        },
      ],
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      graphqlResponse({ contexts }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await asUser.action(
      api.repositoryInventoryChecks.listRepositoryInventoryChecksPage,
      checksActionArgs(ids),
    );

    expect(result).toEqual({
      items: [
        {
          source: "check_run",
          sourceKey: "CR_1",
          name: "Workers Builds: app",
          providerName: "Cloudflare Workers and Pages",
          state: "failure",
          status: "completed",
          conclusion: "failure",
          targetUrl: "https://ci.example.com/builds/CR_1",
          githubUrl: "https://github.com/ada/inventory/runs/CR_1",
          startedAt: 1_699_999_999_000,
          completedAt: now,
          updatedAt: now,
        },
        {
          source: "commit_status",
          sourceKey: "SC_1",
          name: "deploy/ready",
          state: "running",
          status: "expected",
          description: "Deployment is ready",
          targetUrl: "https://status.example.com/deploy/1",
          updatedAt: now,
        },
      ],
      totals: {
        state: "failure",
        totalCount: 2,
        checkRunCount: 1,
        statusContextCount: 1,
        successCount: 0,
        failureCount: 1,
        runningCount: 1,
        neutralCount: 0,
        unknownCount: 0,
      },
      pageSignature: expect.stringMatching(/^[a-f0-9]{64}$/),
      nextCursor: null,
      githubChecksUrl: "https://github.com/ada/inventory/commit/abc123/checks",
    });
    expect(result.items[0]).not.toHaveProperty("previewUrl");
    expect(result.items[0]).not.toHaveProperty("logUrl");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const request = fetchMock.mock.calls[0];
    const init = request[1];
    if (typeof init?.body !== "string") {
      throw new Error("Expected a GitHub GraphQL request body.");
    }
    const requestBody: unknown = JSON.parse(init.body);
    expect(requestBody).toMatchObject({
      variables: { repositoryId: repositoryNodeId, headSha, after: null },
    });
    const budget = await t.run(async (ctx) =>
      ctx.db
        .query("githubGraphqlRateBudgets")
        .withIndex("by_githubAccountId", (q) => q.eq("githubAccountId", 101))
        .unique(),
    );
    expect(budget).toMatchObject({
      githubAccountId: 101,
      remaining: 4_000,
    });
    expect(budget?.lease).toBeUndefined();
  });

  it("returns one 100-item provider page and exposes its opaque next cursor", async () => {
    const { asUser, ids } = await createChecksTest();
    const firstContexts = {
      totalCount: 101,
      checkRunCount: 101,
      statusContextCount: 0,
      checkRunCountsByState: [{ state: "SUCCESS", count: 101 }],
      statusContextCountsByState: [],
      pageInfo: { hasNextPage: true, endCursor: "opaque-next" },
      nodes: [checkRunNode("CR_first")],
    };
    const secondContexts = {
      ...firstContexts,
      pageInfo: { hasNextPage: false, endCursor: "opaque-end" },
      nodes: [checkRunNode("CR_second")],
    };
    const responses = [
      graphqlResponse({ contexts: firstContexts }),
      graphqlResponse({ contexts: secondContexts }),
      graphqlResponse({ contexts: firstContexts }),
      graphqlResponse({ contexts: secondContexts }),
    ];
    const requestBodies: unknown[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof init?.body === "string") {
        requestBodies.push(JSON.parse(init.body));
      }
      const response = responses.shift();
      if (response === undefined) {
        throw new Error("Unexpected GitHub GraphQL request.");
      }
      return response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const firstPage = await asUser.action(
      api.repositoryInventoryChecks.listRepositoryInventoryChecksPage,
      checksActionArgs(ids),
    );
    expect(firstPage.nextCursor).toBe("opaque-next");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstRequest = requestBodies[0];
    expect(firstRequest).toMatchObject({
      query: expect.stringContaining("contexts(first: 100, after: $after)"),
      variables: { after: null },
    });

    const secondPage = await asUser.action(
      api.repositoryInventoryChecks.listRepositoryInventoryChecksPage,
      {
        ...checksActionArgs(ids),
        cursor: "opaque-next",
        previousPageSignatures: [firstPage.pageSignature],
      },
    );
    expect(secondPage.nextCursor).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(requestBodies[1]).toMatchObject({ variables: { after: "opaque-next" } });
    expect(requestBodies.slice(2)).toMatchObject([
      { variables: { after: null } },
      { variables: { after: "opaque-next" } },
    ]);
  });

  it("rejects a same-count provider replacement during multi-page loading", async () => {
    const { asUser, ids } = await createChecksTest();
    const firstContexts = {
      totalCount: 2,
      checkRunCount: 2,
      statusContextCount: 0,
      checkRunCountsByState: [{ state: "SUCCESS", count: 2 }],
      statusContextCountsByState: [],
      pageInfo: { hasNextPage: true, endCursor: "opaque-next" },
      nodes: [checkRunNode("CR_original")],
    };
    const finalContexts = {
      ...firstContexts,
      pageInfo: { hasNextPage: false, endCursor: "opaque-end" },
      nodes: [checkRunNode("CR_second")],
    };
    const changedFirstContexts = {
      ...firstContexts,
      nodes: [checkRunNode("CR_replacement")],
    };
    const responses = [
      graphqlResponse({ contexts: firstContexts }),
      graphqlResponse({ contexts: finalContexts }),
      graphqlResponse({ contexts: changedFirstContexts }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const response = responses.shift();
        if (response === undefined) {
          throw new Error("Unexpected GitHub GraphQL request.");
        }
        return response;
      }),
    );

    const firstPage = await asUser.action(
      api.repositoryInventoryChecks.listRepositoryInventoryChecksPage,
      checksActionArgs(ids),
    );
    await expect(
      asUser.action(api.repositoryInventoryChecks.listRepositoryInventoryChecksPage, {
        ...checksActionArgs(ids),
        cursor: "opaque-next",
        previousPageSignatures: [firstPage.pageSignature],
      }),
    ).rejects.toThrow("GitHub checks changed while loading. Reopen the check list.");
  });

  it("rejects malformed union nodes, inconsistent counts, and missing cursors", async () => {
    const { asUser, ids } = await createChecksTest();
    const cases = [
      {
        contexts: {
          totalCount: 1,
          checkRunCount: 1,
          statusContextCount: 0,
          checkRunCountsByState: [{ state: "SUCCESS", count: 1 }],
          statusContextCountsByState: [],
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [{ __typename: "UnexpectedCheck", id: "bad" }],
        },
        message: "GitHub returned malformed repository checks.",
      },
      {
        contexts: {
          totalCount: 2,
          checkRunCount: 1,
          statusContextCount: 0,
          checkRunCountsByState: [{ state: "SUCCESS", count: 1 }],
          statusContextCountsByState: [],
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [checkRunNode("CR_counts")],
        },
        message: "GitHub returned inconsistent repository check counts.",
      },
      {
        contexts: {
          totalCount: 1,
          checkRunCount: 1,
          statusContextCount: 0,
          checkRunCountsByState: [{ state: "SUCCESS", count: 1 }],
          statusContextCountsByState: [],
          pageInfo: { hasNextPage: true, endCursor: null },
          nodes: [checkRunNode("CR_cursor")],
        },
        message: "GitHub repository check pagination omitted its next cursor.",
      },
    ];

    for (const testCase of cases) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => graphqlResponse({ contexts: testCase.contexts })),
      );
      await expect(
        asUser.action(
          api.repositoryInventoryChecks.listRepositoryInventoryChecksPage,
          checksActionArgs(ids),
        ),
      ).rejects.toThrow(testCase.message);
    }
  });

  it("rejects repository and commit identities that changed after publication", async () => {
    const { asUser, ids } = await createChecksTest();
    const cases = [
      {
        response: graphqlResponse({ repositoryId: "R_other" }),
        message: "GitHub repository identity changed while loading checks.",
      },
      {
        response: graphqlResponse({ nameWithOwner: "ada/other" }),
        message: "GitHub repository identity changed while loading checks.",
      },
      {
        response: graphqlResponse({ commitOid: "changed-sha" }),
        message: "GitHub commit identity changed while loading checks.",
      },
    ];

    for (const testCase of cases) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => testCase.response),
      );
      await expect(
        asUser.action(
          api.repositoryInventoryChecks.listRepositoryInventoryChecksPage,
          checksActionArgs(ids),
        ),
      ).rejects.toThrow(testCase.message);
    }
  });

  it("uses the shared GitHub budget before making an on-demand request", async () => {
    const { asUser, ids, t } = await createChecksTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("githubGraphqlRateBudgets", {
        githubAccountId: 101,
        limit: 5_000,
        remaining: 4_000,
        resetAt: now + 60 * 60_000,
        consecutiveSecondaryBlocks: 0,
        lease: {
          leaseId: "active-inventory",
          owner: {
            kind: "repository_inventory",
            vaultId: ids.vaultId,
            snapshotId: ids.snapshotId,
          },
          startedAt: now,
          expiresAt: now + 60_000,
          reservedPoints: 10,
        },
      });
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const error: unknown = await asUser
      .action(
        api.repositoryInventoryChecks.listRepositoryInventoryChecksPage,
        checksActionArgs(ids),
      )
      .then(
        () => null,
        (reason: unknown) => reason,
      );
    if (!(error instanceof ConvexError)) {
      throw new Error("Expected a structured Convex error.");
    }
    expect(error.data).toEqual({
      code: "github_checks_temporarily_unavailable",
      reason: "queue",
      retryAt: now + 5_000,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enforces the five-point cost ceiling and execution deadline", async () => {
    const { asUser, ids } = await createChecksTest();
    const expensiveFetch = vi.fn(async () => graphqlResponse({ cost: 6 }));
    vi.stubGlobal("fetch", expensiveFetch);
    await expect(
      asUser.action(
        api.repositoryInventoryChecks.listRepositoryInventoryChecksPage,
        checksActionArgs(ids),
      ),
    ).rejects.toThrow("GitHub repository inventory exceeded its cost limit.");
    expect(expensiveFetch).toHaveBeenCalledTimes(1);

    vi.setSystemTime(now);
    const lateFetch = vi.fn(async () => {
      vi.setSystemTime(now + 60_000);
      return graphqlResponse();
    });
    vi.stubGlobal("fetch", lateFetch);
    await expect(
      asUser.action(
        api.repositoryInventoryChecks.listRepositoryInventoryChecksPage,
        checksActionArgs(ids),
      ),
    ).rejects.toThrow("GitHub repository inventory exceeded its execution deadline.");
    expect(lateFetch).toHaveBeenCalledTimes(1);
  });
});
