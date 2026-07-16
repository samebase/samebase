import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  collectRepositoryInventoryWithRetry,
  createGitHubGraphqlClient,
  GitHubGraphqlRateLimitError,
  resolveGitHubRepositoryIdentity,
} from "./githubRepositoryInventory";

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

function graphqlRateHeaders(args?: {
  limit?: number;
  remaining?: number;
  resetAtSeconds?: number;
}): Record<string, string> {
  return {
    "x-ratelimit-limit": String(args?.limit ?? 5_000),
    "x-ratelimit-remaining": String(args?.remaining ?? 4_000),
    "x-ratelimit-reset": String(args?.resetAtSeconds ?? 1_700_003_600),
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
    expect(client.getRequestCount()).toBe(2);
    expect(client.getUsage()).toEqual({
      cost: 11,
      limit: 7_500,
      remaining: 7_413,
      resetAt: 1_700_003_600_000,
    });
  });

  it("stops a repository generation at its aggregate request bound", async () => {
    const { fetchImpl, getCallCount } = responseQueue([
      jsonResponse({
        data: { result: "first", rateLimit: graphqlRateLimit({ cost: 1 }) },
      }),
    ]);
    const client = createGitHubGraphqlClient({
      credential: "github-token",
      fetchImpl,
      limits: {
        deadlineAt: now + 60_000,
        maximumCost: 10,
        maximumRequestCount: 1,
      },
    });

    await expect(client.request("query First { viewer { login } }", {})).resolves.toMatchObject({
      result: "first",
    });
    await expect(client.request("query Second { viewer { login } }", {})).rejects.toThrow(
      "GitHub repository inventory exceeded its request limit.",
    );
    expect(getCallCount()).toBe(1);
  });

  it("rejects a response that crosses the generation cost bound", async () => {
    const { fetchImpl, getCallCount } = responseQueue([
      jsonResponse({
        data: { result: "too-expensive", rateLimit: graphqlRateLimit({ cost: 6 }) },
      }),
    ]);
    const client = createGitHubGraphqlClient({
      credential: "github-token",
      fetchImpl,
      limits: {
        deadlineAt: now + 60_000,
        maximumCost: 5,
        maximumRequestCount: 10,
      },
    });

    await expect(client.request("query Expensive { viewer { login } }", {})).rejects.toThrow(
      "GitHub repository inventory exceeded its cost limit.",
    );
    expect(getCallCount()).toBe(1);
  });

  it("stops before requesting after the generation deadline", async () => {
    const { fetchImpl, getCallCount } = responseQueue([]);
    const client = createGitHubGraphqlClient({
      credential: "github-token",
      fetchImpl,
      limits: {
        deadlineAt: now,
        maximumCost: 5,
        maximumRequestCount: 10,
      },
    });

    await expect(client.request("query Late { viewer { login } }", {})).rejects.toThrow(
      "GitHub repository inventory exceeded its execution deadline.",
    );
    expect(getCallCount()).toBe(0);
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

  it.each([
    ["network", () => new TypeError("connection closed")],
    ["abort", () => new DOMException("The operation was aborted.", "AbortError")],
  ] as const)("does not retry a %s failure", async (_kind, errorFactory) => {
    let callCount = 0;
    const fetchImpl: typeof fetch = async () => {
      callCount += 1;
      throw errorFactory();
    };
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });

    const error = await rejectionOf(
      collectRepositoryInventoryWithRetry({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        requestGraphql: client.request,
        requestGraphqlPartial: client.requestPartial,
      }),
    );

    expect(error).toBeInstanceOf(Error);
    expect(callCount).toBe(1);
    expect(client.getUsage()).toBeUndefined();
  });

  it("discards prior usage after an unreadable response with no accounting", async () => {
    const { fetchImpl, getCallCount } = responseQueue([
      jsonResponse({
        data: {
          viewer: { login: "samebase" },
          rateLimit: graphqlRateLimit({ cost: 3, remaining: 4_200 }),
        },
      }),
      new Response("{", {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    ]);
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });
    await client.request("query { viewer { login } }", {});
    expect(client.getUsage()?.cost).toBe(3);

    await expect(
      collectRepositoryInventoryWithRetry({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        requestGraphql: client.request,
        requestGraphqlPartial: client.requestPartial,
      }),
    ).rejects.toThrow("unreadable response");

    expect(getCallCount()).toBe(2);
    expect(client.getUsage()).toBeUndefined();
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

    const error = await rejectionOf(
      collectRepositoryInventoryWithRetry({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "123",
        requestGraphql: client.request,
        requestGraphqlPartial: client.requestPartial,
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

  it("exposes accounted partial data only through the explicit partial request", async () => {
    const { fetchImpl } = responseQueue([
      jsonResponse({
        data: {
          repository: { ready: { id: "PR_ready" }, missing: null },
          rateLimit: graphqlRateLimit({ cost: 1 }),
        },
        errors: [
          {
            message: "Could not resolve head ref.",
            type: "NOT_FOUND",
            path: ["repository", "missing", "baseRef", "comparison"],
          },
        ],
      }),
    ]);
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });

    await expect(
      client.requestPartial("query PartialComparison { repository { id } }", {}),
    ).resolves.toEqual({
      data: {
        repository: { ready: { id: "PR_ready" }, missing: null },
        rateLimit: graphqlRateLimit({ cost: 1 }),
      },
      errors: [
        {
          message: "Could not resolve head ref.",
          type: "NOT_FOUND",
          path: ["repository", "missing", "baseRef", "comparison"],
        },
      ],
    });
    expect(client.getUsage()?.cost).toBe(1);
  });

  it("stops an underestimated multi-request crawl at the observed safety floor", async () => {
    const resetAt = "2023-11-14T23:13:20.000Z";
    const { fetchImpl, getCallCount } = responseQueue([
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
          rateLimit: graphqlRateLimit({ cost: 1, remaining: 250, resetAt }),
        },
      }),
    ]);
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });

    const error = await rejectionOf(
      collectRepositoryInventoryWithRetry({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        requestGraphql: client.request,
        requestGraphqlPartial: client.requestPartial,
      }),
    );

    expect(error).toBeInstanceOf(GitHubGraphqlRateLimitError);
    if (!(error instanceof GitHubGraphqlRateLimitError)) {
      throw new Error("Expected a GitHub GraphQL rate-limit error.");
    }
    expect(error.limitKind).toBe("primary");
    expect(error.retryAt).toBe(Date.parse(resetAt) + 1_000);
    expect(error.usage).toEqual({
      cost: 1,
      limit: 5_000,
      remaining: 250,
      resetAt: Date.parse(resetAt),
    });
    expect(getCallCount()).toBe(1);
  });

  it("does not start a smaller-page retry after the response reaches the safety floor", async () => {
    const resetAt = "2023-11-14T23:13:20.000Z";
    const { fetchImpl, getCallCount, getRequestBodies } = responseQueue([
      jsonResponse(
        {
          data: {
            rateLimit: graphqlRateLimit({ cost: 1, remaining: 250, resetAt }),
          },
          errors: [{ message: "Query timed out", type: "TIMEOUT" }],
        },
        { headers: graphqlRateHeaders({ remaining: 250 }) },
      ),
    ]);
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });

    const error = await rejectionOf(
      collectRepositoryInventoryWithRetry({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        requestGraphql: client.request,
        requestGraphqlPartial: client.requestPartial,
      }),
    );

    expect(error).toBeInstanceOf(GitHubGraphqlRateLimitError);
    if (!(error instanceof GitHubGraphqlRateLimitError)) {
      throw new Error("Expected a GitHub GraphQL rate-limit error.");
    }
    expect(error.limitKind).toBe("primary");
    expect(error.usage?.remaining).toBe(250);
    expect(getCallCount()).toBe(1);
    expect(getRequestBodies()).toHaveLength(1);
    expect(getRequestBodies()[0]).toContain('"pageSize":50');
  });

  it("uses rate headers from an unreadable response to stop the smaller-page retry", async () => {
    const resetAtSeconds = 1_700_003_600;
    const { fetchImpl, getCallCount } = responseQueue([
      new Response("{", {
        status: 500,
        headers: {
          "content-type": "application/json",
          "x-ratelimit-limit": "5000",
          "x-ratelimit-remaining": "250",
          "x-ratelimit-reset": String(resetAtSeconds),
        },
      }),
    ]);
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });

    const error = await rejectionOf(
      collectRepositoryInventoryWithRetry({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        requestGraphql: client.request,
        requestGraphqlPartial: client.requestPartial,
      }),
    );

    expect(error).toBeInstanceOf(GitHubGraphqlRateLimitError);
    expect(client.getUsage()).toEqual({
      cost: 0,
      limit: 5_000,
      remaining: 250,
      resetAt: resetAtSeconds * 1_000,
    });
    expect(getCallCount()).toBe(1);
  });

  it("does not retry an unreadable response when its point usage is unknown", async () => {
    const { fetchImpl, getCallCount } = responseQueue([
      new Response("{", {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    ]);
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });

    const error = await rejectionOf(
      collectRepositoryInventoryWithRetry({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        requestGraphql: client.request,
        requestGraphqlPartial: client.requestPartial,
      }),
    );

    expect(error).not.toBeInstanceOf(GitHubGraphqlRateLimitError);
    expect(error).toBeInstanceOf(Error);
    expect(client.getUsage()).toBeUndefined();
    expect(getCallCount()).toBe(1);
  });

  it.each([200, 500])(
    "does not retry an HTTP %s GraphQL failure without current accounting",
    async (status) => {
      const { fetchImpl, getCallCount } = responseQueue([
        jsonResponse(
          {
            data: { repository: null },
            errors: [{ message: "Query timed out", type: "TIMEOUT" }],
          },
          { status },
        ),
      ]);
      const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });

      await expect(
        collectRepositoryInventoryWithRetry({
          repositoryNodeId: "R_base",
          expectedRepositoryDatabaseId: "42",
          requestGraphql: client.request,
          requestGraphqlPartial: client.requestPartial,
        }),
      ).rejects.toThrow("Query timed out");

      expect(getCallCount()).toBe(1);
      expect(client.getUsage()).toBeUndefined();
    },
  );

  it.each([
    [
      "partial",
      {
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": "3900",
      },
    ],
    ["inconsistent", graphqlRateHeaders({ limit: 5_000, remaining: 6_000 })],
  ])("does not retry when the current rate headers are %s", async (_kind, headers) => {
    const { fetchImpl, getCallCount } = responseQueue([
      jsonResponse(
        {
          data: {
            rateLimit: graphqlRateLimit({ cost: 2, remaining: 3_900 }),
          },
          errors: [{ message: "Query timed out", type: "TIMEOUT" }],
        },
        { headers },
      ),
    ]);
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });

    await expect(
      collectRepositoryInventoryWithRetry({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        requestGraphql: client.request,
        requestGraphqlPartial: client.requestPartial,
      }),
    ).rejects.toThrow("Query timed out");

    expect(getCallCount()).toBe(1);
    expect(client.getUsage()).toEqual({
      cost: 2,
      limit: 5_000,
      remaining: 3_900,
      resetAt: 1_700_003_600_000,
    });
  });

  it("retries an unreadable server response with complete current headers above the floor", async () => {
    const { fetchImpl, getCallCount, getRequestBodies } = responseQueue([
      new Response("{", {
        status: 500,
        headers: {
          "content-type": "application/json",
          ...graphqlRateHeaders(),
        },
      }),
    ]);
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });

    await expect(
      collectRepositoryInventoryWithRetry({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        requestGraphql: client.request,
        requestGraphqlPartial: client.requestPartial,
      }),
    ).rejects.toThrow("Unexpected GitHub GraphQL request");

    expect(getCallCount()).toBe(2);
    expect(getRequestBodies()[0]).toContain('"pageSize":50');
    expect(getRequestBodies()[1]).toContain('"pageSize":25');
  });

  it.each([
    ["RESOURCE_LIMIT", "Query exceeded a resource limit"],
    ["TIMEOUT", "Query timed out"],
    ["INTERNAL", "Something went wrong while executing the query"],
  ])("retries an HTTP 200 %s error with complete current headers", async (type, message) => {
    const { fetchImpl, getCallCount, getRequestBodies } = responseQueue([
      jsonResponse(
        {
          data: {
            rateLimit: graphqlRateLimit({ cost: 1 }),
          },
          errors: [{ message, type }],
        },
        { headers: graphqlRateHeaders() },
      ),
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
    ]);
    const client = createGitHubGraphqlClient({ credential: "github-token", fetchImpl });

    await expect(
      collectRepositoryInventoryWithRetry({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        requestGraphql: client.request,
        requestGraphqlPartial: client.requestPartial,
      }),
    ).resolves.toMatchObject({ branchCount: 0, pullRequestCount: 0 });

    expect(getCallCount()).toBe(5);
    const requestBodies = getRequestBodies();
    expect(requestBodies[0]).toContain('"pageSize":50');
    expect(requestBodies[1]).toContain('"pageSize":25');
    expect(requestBodies[2]).toContain('"pageSize":25');
    expect(requestBodies[3]).toContain("RepositoryInventoryBranchSignaturePage");
    expect(requestBodies[4]).toContain("RepositoryInventoryPullRequestSignaturePage");
  });
});

describe("GitHub repository identity bootstrap", () => {
  it("returns current canonical coordinates from the persisted GraphQL node id", async () => {
    const { fetchImpl, getCallCount } = responseQueue([
      jsonResponse({
        data: {
          repository: {
            __typename: "Repository",
            id: "R_base",
            databaseId: 42,
            name: "new-name",
            nameWithOwner: "new-owner/new-name",
            owner: { login: "new-owner", databaseId: 7 },
          },
          rateLimit: graphqlRateLimit({ cost: 1 }),
        },
      }),
    ]);

    await expect(
      resolveGitHubRepositoryIdentity({
        credential: "github-token",
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        fetchImpl,
      }),
    ).resolves.toEqual({
      databaseId: "42",
      nodeId: "R_base",
      ownerDatabaseId: "7",
      owner: "new-owner",
      name: "new-name",
      fullName: "new-owner/new-name",
    });
    expect(getCallCount()).toBe(1);
  });

  it("rejects a repository identity response for another numeric id", async () => {
    const { fetchImpl } = responseQueue([
      jsonResponse({
        data: {
          repository: {
            __typename: "Repository",
            id: "R_base",
            databaseId: 99,
            name: "other",
            nameWithOwner: "new-owner/other",
            owner: { login: "new-owner", databaseId: 7 },
          },
          rateLimit: graphqlRateLimit({ cost: 1 }),
        },
      }),
    ]);

    await expect(
      resolveGitHubRepositoryIdentity({
        credential: "github-token",
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        fetchImpl,
      }),
    ).rejects.toThrow("GitHub returned another repository.");
  });

  it("fails closed when the current connection cannot resolve the persisted node id", async () => {
    const { fetchImpl } = responseQueue([
      jsonResponse({
        data: {
          repository: null,
          rateLimit: graphqlRateLimit({ cost: 1 }),
        },
        errors: [
          {
            type: "NOT_FOUND",
            path: ["repository"],
            message: "Could not resolve to a node with the global id.",
          },
        ],
      }),
    ]);

    await expect(
      resolveGitHubRepositoryIdentity({
        credential: "github-token",
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        fetchImpl,
      }),
    ).rejects.toThrow("Could not resolve to a node with the global id.");
  });
});
