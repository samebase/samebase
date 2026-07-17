import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createGitHubGraphqlClient, GitHubGraphqlRateLimitError } from "./githubGraphql";

const now = 1_700_000_000_000;

function jsonResponse(body: unknown, init?: { status?: number; headers?: HeadersInit }): Response {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), {
    status: init?.status,
    headers,
  });
}

function responseQueue(responses: Response[]): {
  fetchImpl: typeof fetch;
  callCount: () => number;
} {
  const queue = [...responses];
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    const response = queue.shift();
    if (response === undefined) {
      throw new Error("Unexpected GitHub GraphQL request.");
    }
    return response;
  };
  return { fetchImpl, callCount: () => calls };
}

function rateLimit(cost: number, remaining = 4_000) {
  return {
    cost,
    limit: 5_000,
    remaining,
    resetAt: "2023-11-14T23:13:20.000Z",
  };
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject.");
}

describe("GitHub GraphQL transport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accounts for cumulative cost and enforces request limits", async () => {
    const responses = responseQueue([
      jsonResponse({ data: { viewer: { login: "one" }, rateLimit: rateLimit(2) } }),
    ]);
    const client = createGitHubGraphqlClient({
      credential: "token",
      fetchImpl: responses.fetchImpl,
      limits: {
        deadlineAt: now + 60_000,
        maximumCost: 10,
        maximumRequestCount: 1,
      },
    });

    await expect(client.request("query One { viewer { login } }", {})).resolves.toMatchObject({
      viewer: { login: "one" },
    });
    await expect(client.request("query Two { viewer { login } }", {})).rejects.toThrow(
      "request limit",
    );
    expect(responses.callCount()).toBe(1);
    expect(client.getUsage()?.cost).toBe(2);
  });

  it("rejects a response that crosses the total cost limit", async () => {
    const responses = responseQueue([
      jsonResponse({ data: { viewer: { login: "one" }, rateLimit: rateLimit(6) } }),
    ]);
    const client = createGitHubGraphqlClient({
      credential: "token",
      fetchImpl: responses.fetchImpl,
      limits: {
        deadlineAt: now + 60_000,
        maximumCost: 5,
        maximumRequestCount: 4,
      },
    });

    await expect(client.request("query One { viewer { login } }", {})).rejects.toThrow(
      "cost limit",
    );
  });

  it("classifies a primary rate limit and uses the reset timestamp", async () => {
    const resetAtSeconds = 1_700_000_120;
    const responses = responseQueue([
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
    const client = createGitHubGraphqlClient({
      credential: "token",
      fetchImpl: responses.fetchImpl,
      limits: {
        deadlineAt: now + 60_000,
        maximumCost: 50,
        maximumRequestCount: 4,
      },
    });

    const error = await rejectionOf(client.request("query One { viewer { login } }", {}));
    expect(error).toBeInstanceOf(GitHubGraphqlRateLimitError);
    if (!(error instanceof GitHubGraphqlRateLimitError)) {
      throw new Error("Expected a GitHub GraphQL rate-limit error.");
    }
    expect(error.limitKind).toBe("primary");
    expect(error.retryAt).toBe(resetAtSeconds * 1_000 + 1_000);
  });

  it("classifies a secondary rate limit and honors Retry-After", async () => {
    const responses = responseQueue([
      jsonResponse({ message: "slow down" }, { status: 429, headers: { "retry-after": "90" } }),
    ]);
    const client = createGitHubGraphqlClient({
      credential: "token",
      fetchImpl: responses.fetchImpl,
      limits: {
        deadlineAt: now + 60_000,
        maximumCost: 50,
        maximumRequestCount: 4,
      },
    });

    const error = await rejectionOf(client.request("query One { viewer { login } }", {}));
    expect(error).toBeInstanceOf(GitHubGraphqlRateLimitError);
    if (!(error instanceof GitHubGraphqlRateLimitError)) {
      throw new Error("Expected a GitHub GraphQL rate-limit error.");
    }
    expect(error.limitKind).toBe("secondary");
    expect(error.retryAt).toBe(now + 90_000);
  });

  it("classifies an accounted GraphQL RATE_LIMITED response as secondary", async () => {
    const responses = responseQueue([
      jsonResponse({
        data: { rateLimit: rateLimit(1, 37) },
        errors: [{ message: "API rate limit exceeded", type: "RATE_LIMITED" }],
      }),
    ]);
    const client = createGitHubGraphqlClient({
      credential: "token",
      fetchImpl: responses.fetchImpl,
      limits: {
        deadlineAt: now + 60_000,
        maximumCost: 50,
        maximumRequestCount: 4,
      },
    });

    const error = await rejectionOf(client.request("query One { viewer { login } }", {}));
    expect(error).toBeInstanceOf(GitHubGraphqlRateLimitError);
    if (!(error instanceof GitHubGraphqlRateLimitError)) {
      throw new Error("Expected a GitHub GraphQL rate-limit error.");
    }
    expect(error.limitKind).toBe("secondary");
    expect(error.retryAt).toBe(now + 60_000);
    expect(error.usage?.cost).toBe(1);
  });
});
