import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  collectRepositoryInventoryWithRetry,
  createGitHubGraphqlClient,
  GitHubGraphqlRateLimitError,
  resolveGitHubRepositoryNodeId,
} from "./githubRepositoryInventory";
import { makeConvexTest } from "./test.setup";

const now = 1_700_000_000_000;

function graphqlRateLimit(args: {
  cost: number;
  limit?: number;
  remaining?: number;
  resetAt?: string;
}) {
  return {
    cost: args.cost,
    limit: args.limit ?? 5_000,
    remaining: args.remaining ?? 4_000,
    resetAt: args.resetAt ?? "2023-11-14T23:13:20.000Z",
  };
}

function jsonResponse(
  body: unknown,
  init?: {
    headers?: HeadersInit;
    status?: number;
  },
): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new Response(JSON.stringify(body), {
    headers,
    status: init?.status,
  });
}

function responseQueue(responses: Response[]): {
  fetchImpl: typeof fetch;
  getCallCount: () => number;
  getRequestBodies: () => string[];
} {
  const queue = [...responses];
  const requestBodies: string[] = [];
  let callCount = 0;
  const fetchImpl: typeof fetch = async (_input, init) => {
    const response = queue.shift();
    callCount += 1;
    if (typeof init?.body === "string") {
      requestBodies.push(init.body);
    }
    if (response === undefined) {
      throw new Error("Unexpected GitHub GraphQL request.");
    }
    return response;
  };
  return {
    fetchImpl,
    getCallCount: () => callCount,
    getRequestBodies: () => requestBodies,
  };
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the promise to reject.");
}

describe("GitHub GraphQL client rate accounting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("accumulates GraphQL cost and prefers the latest rate headers", async () => {
    const { fetchImpl, getCallCount } = responseQueue([
      jsonResponse(
        {
          data: {
            result: "first",
            rateLimit: graphqlRateLimit({ cost: 4, limit: 5_000, remaining: 4_900 }),
          },
        },
        {
          headers: {
            "x-ratelimit-limit": "7500",
            "x-ratelimit-remaining": "7420",
            "x-ratelimit-reset": "1700003600",
          },
        },
      ),
      jsonResponse(
        {
          data: {
            result: "second",
            rateLimit: graphqlRateLimit({ cost: 7, limit: 5_000, remaining: 4_800 }),
          },
        },
        {
          headers: {
            "x-ratelimit-limit": "7500",
            "x-ratelimit-remaining": "7413",
            "x-ratelimit-reset": "1700003600",
          },
        },
      ),
    ]);
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });

    await expect(client.request("query First { viewer { login } }", {})).resolves.toMatchObject({
      result: "first",
    });
    await expect(client.request("query Second { viewer { login } }", {})).resolves.toMatchObject({
      result: "second",
    });

    expect(getCallCount()).toBe(2);
    expect(client.getUsage()).toEqual({
      cost: 11,
      limit: 7_500,
      remaining: 7_413,
      resetAt: 1_700_003_600_000,
    });
  });

  it("keeps the request deadline active while the response body is loading", async () => {
    let responseBodyAborted = false;
    const fetchImpl: typeof fetch = async (_input, init) => {
      const signal = init?.signal;
      const body = new ReadableStream({
        start(controller) {
          signal?.addEventListener("abort", () => {
            responseBodyAborted = true;
            controller.error(new DOMException("The operation was aborted.", "AbortError"));
          });
        },
      });
      return new Response(body, {
        headers: { "content-type": "application/json" },
      });
    };
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });
    const request = client.request("query { viewer { login } }", {});
    const rejection = rejectionOf(request);

    await vi.advanceTimersByTimeAsync(30_000);

    const error = await rejection;
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) {
      throw new Error("Expected a GitHub GraphQL request error.");
    }
    expect(error.message).toContain("GitHub GraphQL request failed");
    expect(responseBodyAborted).toBe(true);
  });

  it("classifies an HTTP 200 RATE_LIMITED response without retrying collection", async () => {
    const { fetchImpl, getCallCount } = responseQueue([
      jsonResponse({
        data: {
          rateLimit: graphqlRateLimit({ cost: 1, remaining: 37 }),
        },
        errors: [{ message: "API rate limit exceeded", type: "RATE_LIMITED" }],
      }),
    ]);
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });
    const t = makeConvexTest();
    const context = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      return { userId, vaultId, generation: 1, syncedAt: now };
    });

    const error = await rejectionOf(
      collectRepositoryInventoryWithRetry({
        context,
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "123",
        requestGraphql: client.request,
      }),
    );

    expect(error).toBeInstanceOf(GitHubGraphqlRateLimitError);
    if (!(error instanceof GitHubGraphqlRateLimitError)) {
      throw new Error("Expected a GitHub GraphQL rate-limit error.");
    }
    expect(error.limitKind).toBe("secondary");
    expect(error.retryAt).toBe(now + 60_000);
    expect(error.usage).toEqual({
      cost: 1,
      limit: 5_000,
      remaining: 37,
      resetAt: 1_700_003_600_000,
    });
    expect(getCallCount()).toBe(1);
  });

  it("classifies a primary HTTP 403 limit and honors its reset time", async () => {
    const resetAtSeconds = 1_700_000_120;
    const { fetchImpl } = responseQueue([
      jsonResponse(
        { message: "rate limited" },
        {
          status: 403,
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(resetAtSeconds),
          },
        },
      ),
    ]);
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });

    const error = await rejectionOf(client.request("query { viewer { login } }", {}));

    expect(error).toBeInstanceOf(GitHubGraphqlRateLimitError);
    if (!(error instanceof GitHubGraphqlRateLimitError)) {
      throw new Error("Expected a GitHub GraphQL rate-limit error.");
    }
    expect(error.limitKind).toBe("primary");
    expect(error.retryAt).toBe(resetAtSeconds * 1_000 + 1_000);
  });

  it("classifies a top-level secondary-limit HTTP 403 message", async () => {
    const { fetchImpl } = responseQueue([
      jsonResponse(
        {
          message: "You have exceeded a secondary rate limit. Please wait a few minutes.",
        },
        {
          status: 403,
          headers: {
            "x-ratelimit-remaining": "42",
          },
        },
      ),
    ]);
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });

    const error = await rejectionOf(client.request("query { viewer { login } }", {}));

    expect(error).toBeInstanceOf(GitHubGraphqlRateLimitError);
    if (!(error instanceof GitHubGraphqlRateLimitError)) {
      throw new Error("Expected a GitHub GraphQL rate-limit error.");
    }
    expect(error.limitKind).toBe("secondary");
    expect(error.retryAt).toBe(now + 60_000);
  });

  it("classifies HTTP 429 as secondary and honors Retry-After", async () => {
    const { fetchImpl } = responseQueue([
      jsonResponse(
        { message: "slow down" },
        {
          status: 429,
          headers: { "retry-after": "90" },
        },
      ),
    ]);
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });

    const error = await rejectionOf(client.request("query { viewer { login } }", {}));

    expect(error).toBeInstanceOf(GitHubGraphqlRateLimitError);
    if (!(error instanceof GitHubGraphqlRateLimitError)) {
      throw new Error("Expected a GitHub GraphQL rate-limit error.");
    }
    expect(error.limitKind).toBe("secondary");
    expect(error.retryAt).toBe(now + 90_000);
  });

  it("does not classify a plain HTTP 403 permission failure as rate limited", async () => {
    const { fetchImpl } = responseQueue([
      jsonResponse(
        {
          data: null,
          errors: [
            {
              message: "Resource not accessible by integration",
              type: "FORBIDDEN",
            },
          ],
        },
        { status: 403 },
      ),
    ]);
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });

    const error = await rejectionOf(client.request("query { viewer { login } }", {}));

    expect(error).not.toBeInstanceOf(GitHubGraphqlRateLimitError);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) {
      throw new Error("Expected a GitHub GraphQL request error.");
    }
    expect(error.message).toContain("Resource not accessible by integration");
  });

  it("rejects partial GraphQL data when the response also contains errors", async () => {
    const { fetchImpl } = responseQueue([
      jsonResponse({
        data: {
          viewer: { login: "samebase" },
          rateLimit: graphqlRateLimit({ cost: 2 }),
        },
        errors: [{ message: "One field could not be resolved", type: "NOT_FOUND" }],
      }),
    ]);
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });

    const error = await rejectionOf(client.request("query { viewer { login } }", {}));

    expect(error).not.toBeInstanceOf(GitHubGraphqlRateLimitError);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) {
      throw new Error("Expected a GitHub GraphQL request error.");
    }
    expect(error.message).toContain("One field could not be resolved");
    expect(client.getUsage()).toEqual({
      cost: 2,
      limit: 5_000,
      remaining: 4_000,
      resetAt: 1_700_003_600_000,
    });
  });

  it.each([
    ["RESOURCE_LIMIT", "Query exceeded a resource limit"],
    ["TIMEOUT", "Query timed out"],
    ["INTERNAL", "Something went wrong while executing the query"],
  ])("retries an HTTP 200 %s error with smaller pages", async (type, message) => {
    const { fetchImpl, getCallCount, getRequestBodies } = responseQueue([
      jsonResponse({
        data: {
          rateLimit: graphqlRateLimit({ cost: 1 }),
        },
        errors: [{ message, type }],
      }),
      jsonResponse({
        data: {
          repository: {
            id: "R_base",
            databaseId: 42,
            nameWithOwner: "samebase/samebase",
            defaultBranchRef: null,
            refs: {
              totalCount: 0,
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [],
            },
          },
          rateLimit: graphqlRateLimit({ cost: 1 }),
        },
      }),
      jsonResponse({
        data: {
          repository: {
            id: "R_base",
            databaseId: 42,
            nameWithOwner: "samebase/samebase",
            pullRequests: {
              totalCount: 0,
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [],
            },
          },
          rateLimit: graphqlRateLimit({ cost: 1 }),
        },
      }),
      jsonResponse({
        data: {
          repository: {
            id: "R_base",
            databaseId: 42,
            nameWithOwner: "samebase/samebase",
            defaultBranchRef: null,
            refs: {
              totalCount: 0,
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [],
            },
          },
          rateLimit: graphqlRateLimit({ cost: 1 }),
        },
      }),
    ]);
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });
    const t = makeConvexTest();
    const context = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      return { userId, vaultId, generation: 1, syncedAt: now };
    });

    await expect(
      collectRepositoryInventoryWithRetry({
        context,
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        requestGraphql: client.request,
      }),
    ).resolves.toMatchObject({ branchCount: 0, pullRequestCount: 0 });

    expect(getCallCount()).toBe(4);
    const requestBodies = getRequestBodies();
    expect(requestBodies[0]).toContain('"pageSize":50');
    expect(requestBodies[1]).toContain('"pageSize":25');
    expect(requestBodies[2]).toContain('"pageSize":25');
    expect(requestBodies[3]).toContain("RepositoryInventoryBranchSignaturePage");
  });
});

describe("GitHub repository identity bootstrap", () => {
  it("resolves the GraphQL node id from the stable numeric repository id", async () => {
    const { fetchImpl, getCallCount } = responseQueue([
      jsonResponse({
        id: 42,
        node_id: "R_base",
        full_name: "new-owner/new-name",
      }),
    ]);

    await expect(
      resolveGitHubRepositoryNodeId({
        credential: "github-token",
        repositoryDatabaseId: "42",
        fetchImpl,
      }),
    ).resolves.toBe("R_base");
    expect(getCallCount()).toBe(1);
  });

  it("rejects a repository identity response for another numeric id", async () => {
    const { fetchImpl } = responseQueue([
      jsonResponse({
        id: 99,
        node_id: "R_other",
        full_name: "other/repository",
      }),
    ]);

    await expect(
      resolveGitHubRepositoryNodeId({
        credential: "github-token",
        repositoryDatabaseId: "42",
        fetchImpl,
      }),
    ).rejects.toThrow("GitHub returned another repository.");
  });
});
