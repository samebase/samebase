import { z } from "zod";

import { toErrorMessage } from "./jsonUtils";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const GITHUB_GRAPHQL_REQUEST_TIMEOUT_MS = 30_000;
const GITHUB_GRAPHQL_MINIMUM_RATE_SAFETY_FLOOR = 50;
const GITHUB_GRAPHQL_RATE_SAFETY_FLOOR_RATIO = 0.05;

const graphqlErrorSchema = z.object({
  message: z.string(),
  type: z.string().optional(),
  path: z.array(z.union([z.string(), z.number()])).optional(),
});

const graphqlEnvelopeSchema = z.object({
  data: z.unknown().optional(),
  message: z.string().optional(),
  errors: z.array(graphqlErrorSchema).optional(),
});

const graphqlRateLimitSchema = z.object({
  cost: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  remaining: z.number().int().nonnegative(),
  resetAt: z.string(),
});

type GraphqlVariable =
  | string
  | number
  | boolean
  | null
  | readonly GraphqlVariable[]
  | { readonly [key: string]: GraphqlVariable };

export type GitHubGraphqlVariables = Record<string, GraphqlVariable>;

export type GitHubGraphqlRateUsage = {
  cost: number;
  limit: number;
  remaining: number;
  resetAt: number;
};

export type GitHubGraphqlClient = {
  request: (query: string, variables: GitHubGraphqlVariables) => Promise<unknown>;
  getRequestCount: () => number;
  getUsage: () => GitHubGraphqlRateUsage | undefined;
};

export class GitHubGraphqlRateLimitError extends Error {
  constructor(
    message: string,
    readonly limitKind: "primary" | "secondary",
    readonly retryAt: number,
    readonly usage: GitHubGraphqlRateUsage | undefined,
  ) {
    super(message);
    this.name = "GitHubGraphqlRateLimitError";
  }
}

export class GitHubGraphqlBudgetError extends Error {
  constructor(
    message: string,
    readonly reason: "cost_limit" | "deadline" | "request_limit",
  ) {
    super(message);
    this.name = "GitHubGraphqlBudgetError";
  }
}

function rateSafetyFloor(limit: number): number {
  return Math.max(
    GITHUB_GRAPHQL_MINIMUM_RATE_SAFETY_FLOOR,
    Math.ceil(limit * GITHUB_GRAPHQL_RATE_SAFETY_FLOOR_RATIO),
  );
}

function headerInteger(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (value === null || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function retryAfterTimestamp(headers: Headers, now: number): number | undefined {
  const value = headers.get("retry-after");
  if (value === null) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return now + Math.ceil(seconds * 1_000);
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function responseHeaderRateUsage(args: {
  headers: Headers;
  accumulatedCost: number;
}): GitHubGraphqlRateUsage | undefined {
  const limit = headerInteger(args.headers, "x-ratelimit-limit");
  const remaining = headerInteger(args.headers, "x-ratelimit-remaining");
  const resetAtSeconds = headerInteger(args.headers, "x-ratelimit-reset");
  if (
    limit === undefined ||
    limit === 0 ||
    remaining === undefined ||
    remaining > limit ||
    resetAtSeconds === undefined ||
    resetAtSeconds === 0
  ) {
    return undefined;
  }
  const resetAt = resetAtSeconds * 1_000;
  if (!Number.isSafeInteger(resetAt)) {
    return undefined;
  }
  return { cost: args.accumulatedCost, limit, remaining, resetAt };
}

function responseRateUsage(args: {
  data: unknown;
  headerUsage: GitHubGraphqlRateUsage | undefined;
  accumulatedCost: number;
}): GitHubGraphqlRateUsage | undefined {
  const parsed = z.object({ rateLimit: graphqlRateLimitSchema }).safeParse(args.data);
  if (!parsed.success || parsed.data.rateLimit.remaining > parsed.data.rateLimit.limit) {
    return undefined;
  }
  const graphqlResetAt = Date.parse(parsed.data.rateLimit.resetAt);
  const resetAt = args.headerUsage?.resetAt ?? graphqlResetAt;
  if (Number.isNaN(resetAt)) {
    return undefined;
  }
  return {
    cost: args.accumulatedCost + parsed.data.rateLimit.cost,
    limit: args.headerUsage?.limit ?? parsed.data.rateLimit.limit,
    remaining: args.headerUsage?.remaining ?? parsed.data.rateLimit.remaining,
    resetAt,
  };
}

function rateLimitFailure(args: {
  response: Response;
  errors: readonly z.infer<typeof graphqlErrorSchema>[];
  topLevelMessage: string | undefined;
}): boolean {
  if (args.response.status === 429) {
    return true;
  }
  if (args.errors.some((error) => error.type?.toUpperCase() === "RATE_LIMITED")) {
    return true;
  }
  if (
    args.errors.some((error) =>
      /rate limit|abuse detection|temporarily blocked/i.test(error.message),
    ) ||
    (args.topLevelMessage !== undefined &&
      /rate limit|abuse detection|temporarily blocked/i.test(args.topLevelMessage))
  ) {
    return true;
  }
  return (
    args.response.status === 403 &&
    (args.response.headers.has("retry-after") ||
      headerInteger(args.response.headers, "x-ratelimit-remaining") === 0)
  );
}

function rateLimitRetryAt(args: {
  response: Response;
  usage: GitHubGraphqlRateUsage | undefined;
  now: number;
}): number {
  const remainingFromHeader = headerInteger(args.response.headers, "x-ratelimit-remaining");
  const resetFromHeader = headerInteger(args.response.headers, "x-ratelimit-reset");
  const retryAfter = retryAfterTimestamp(args.response.headers, args.now);
  const headerReset =
    remainingFromHeader === 0 && resetFromHeader !== undefined
      ? resetFromHeader * 1_000 + 1_000
      : undefined;
  const usageReset = args.usage?.remaining === 0 ? args.usage.resetAt + 1_000 : undefined;

  return Math.max(args.now + 60_000, retryAfter ?? 0, headerReset ?? 0, usageReset ?? 0);
}

async function fetchGitHubJson(args: {
  fetchImpl: typeof fetch;
  credential: string;
  query: string;
  variables: GitHubGraphqlVariables;
  timeoutMs: number;
}): Promise<{ response: Response; payload: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await args.fetchImpl(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${args.credential}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ query: args.query, variables: args.variables }),
      signal: controller.signal,
    });
    try {
      return { response, payload: await response.json() };
    } catch (error) {
      if (controller.signal.aborted) {
        throw error;
      }
      return { response, payload: undefined };
    }
  } finally {
    clearTimeout(timeout);
  }
}

export function createGitHubGraphqlClient(args: {
  credential: string;
  limits: {
    deadlineAt: number;
    maximumCost: number;
    maximumRequestCount: number;
  };
  fetchImpl?: typeof fetch;
}): GitHubGraphqlClient {
  const fetchImpl = args.fetchImpl ?? fetch;
  let requestCount = 0;
  let usage: GitHubGraphqlRateUsage | undefined;

  const request = async (query: string, variables: GitHubGraphqlVariables): Promise<unknown> => {
    const now = Date.now();
    if (now >= args.limits.deadlineAt) {
      throw new GitHubGraphqlBudgetError(
        "GitHub GraphQL exceeded its execution deadline.",
        "deadline",
      );
    }
    if (requestCount >= args.limits.maximumRequestCount) {
      throw new GitHubGraphqlBudgetError(
        "GitHub GraphQL exceeded its request limit.",
        "request_limit",
      );
    }
    if (usage !== undefined && usage.cost >= args.limits.maximumCost) {
      throw new GitHubGraphqlBudgetError("GitHub GraphQL reached its cost limit.", "cost_limit");
    }
    if (usage !== undefined && usage.remaining <= rateSafetyFloor(usage.limit)) {
      throw new GitHubGraphqlRateLimitError(
        "GitHub GraphQL remaining points reached the safety floor.",
        "primary",
        Math.max(now + 60_000, usage.resetAt + 1_000),
        usage,
      );
    }

    const accumulatedCost = usage?.cost ?? 0;
    let response: Response;
    let payload: unknown;
    requestCount += 1;
    try {
      ({ response, payload } = await fetchGitHubJson({
        fetchImpl,
        credential: args.credential,
        query,
        variables,
        timeoutMs: Math.max(
          1,
          Math.min(GITHUB_GRAPHQL_REQUEST_TIMEOUT_MS, args.limits.deadlineAt - now),
        ),
      }));
    } catch (error) {
      usage = undefined;
      throw new Error(`GitHub GraphQL request failed: ${toErrorMessage(error)}`);
    }

    const headerUsage = responseHeaderRateUsage({
      headers: response.headers,
      accumulatedCost,
    });
    if (headerUsage !== undefined) {
      usage = headerUsage;
    }

    const envelope = graphqlEnvelopeSchema.safeParse(payload);
    const errors = envelope.success ? (envelope.data.errors ?? []) : [];
    const topLevelMessage = envelope.success ? envelope.data.message : undefined;
    const observedUsage = envelope.success
      ? responseRateUsage({
          data: envelope.data.data,
          headerUsage,
          accumulatedCost,
        })
      : undefined;
    if (observedUsage !== undefined) {
      usage = observedUsage;
    }

    if (rateLimitFailure({ response, errors, topLevelMessage })) {
      const remaining =
        headerInteger(response.headers, "x-ratelimit-remaining") ?? usage?.remaining;
      throw new GitHubGraphqlRateLimitError(
        `GitHub paused GraphQL requests (${response.status}).`,
        remaining === 0 ? "primary" : "secondary",
        rateLimitRetryAt({ response, usage, now: Date.now() }),
        usage,
      );
    }
    if (!envelope.success) {
      if (headerUsage === undefined) {
        usage = undefined;
      }
      throw new Error(`GitHub GraphQL returned an invalid response (${response.status}).`);
    }
    if (!response.ok || topLevelMessage !== undefined || envelope.data.data === undefined) {
      const details = [
        ...errors.map((error) => error.message),
        ...(topLevelMessage === undefined ? [] : [topLevelMessage]),
      ];
      throw new Error(
        `GitHub GraphQL request failed (${response.status})${
          details.length === 0 ? "" : `: ${details.join("; ")}`
        }`,
      );
    }
    if (errors.length > 0) {
      throw new Error(
        `GitHub GraphQL request failed (200): ${errors.map((error) => error.message).join("; ")}`,
      );
    }
    if (observedUsage === undefined) {
      throw new Error("GitHub GraphQL did not return rate-limit accounting.");
    }
    if (Date.now() >= args.limits.deadlineAt) {
      throw new GitHubGraphqlBudgetError(
        "GitHub GraphQL exceeded its execution deadline.",
        "deadline",
      );
    }
    if (observedUsage.cost > args.limits.maximumCost) {
      throw new GitHubGraphqlBudgetError("GitHub GraphQL exceeded its cost limit.", "cost_limit");
    }
    return envelope.data.data;
  };

  return {
    request,
    getRequestCount: () => requestCount,
    getUsage: () => usage,
  };
}
