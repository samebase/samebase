import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { z } from "zod";

import { internal } from "./_generated/api";
import { internalQuery } from "./_generated/server";
import {
  buildRepositoryInventoryCheckSummaryFromCounts,
  normalizeCommitCheckRun,
  normalizeCommitStatus,
} from "./commitChecks";
import {
  createGitHubGraphqlClient,
  GitHubGraphqlRateLimitError,
  type RepositoryInventoryGraphqlRequest,
} from "./githubRepositoryInventory";
import { action } from "./functions";
import {
  vRepositoryInventoryChecksContext,
  vRepositoryInventoryChecksPage,
  type RepositoryInventoryChecksContext,
  type RepositoryInventoryChecksPage,
  type RepositoryInventoryOrdinaryCheck,
} from "./repositoryInventoryChecksModel";
import { isLiveConnectedVault } from "./vault/state";
import { parseRepositoryFullName } from "../shared/repoName";

const { array, id, null: vNull, string, union } = v;

const GITHUB_REPOSITORY_CHECKS_PAGE_SIZE = 100;
const GITHUB_REPOSITORY_CHECKS_BASE_DEADLINE_MS = 15_000;
const GITHUB_REPOSITORY_CHECKS_VERIFICATION_PAGE_DEADLINE_MS = 2_000;
const GITHUB_REPOSITORY_CHECKS_MAXIMUM_DEADLINE_MS = 120_000;
const GITHUB_REPOSITORY_CHECKS_MAXIMUM_PAGE_COUNT = 50;
const GITHUB_REPOSITORY_CHECKS_MAXIMUM_COST_PER_REQUEST = 5;

const pageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
});

const checkStateCountSchema = z.object({
  state: z.string(),
  count: z.number().int().nonnegative(),
});

const checkRunSchema = z.object({
  __typename: z.literal("CheckRun"),
  id: z.string(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  detailsUrl: z.string().nullable(),
  url: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  checkSuite: z.object({
    app: z
      .object({
        name: z.string(),
      })
      .nullable(),
  }),
});

const statusContextSchema = z.object({
  __typename: z.literal("StatusContext"),
  id: z.string(),
  state: z.string(),
  context: z.string(),
  description: z.string().nullable(),
  targetUrl: z.string().nullable(),
  updatedAt: z.string(),
});

const checkContextSchema = z.discriminatedUnion("__typename", [
  checkRunSchema,
  statusContextSchema,
]);

const checkContextsSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  checkRunCount: z.number().int().nonnegative(),
  statusContextCount: z.number().int().nonnegative(),
  checkRunCountsByState: z.array(checkStateCountSchema),
  statusContextCountsByState: z.array(checkStateCountSchema),
  pageInfo: pageInfoSchema,
  nodes: z.array(checkContextSchema).max(GITHUB_REPOSITORY_CHECKS_PAGE_SIZE),
});

const commitSchema = z.object({
  __typename: z.literal("Commit"),
  oid: z.string(),
  statusCheckRollup: z
    .object({
      contexts: checkContextsSchema,
    })
    .nullable(),
});

const repositoryChecksResponseSchema = z.object({
  repository: z
    .object({
      __typename: z.literal("Repository"),
      id: z.string(),
      nameWithOwner: z.string(),
      object: z.unknown().nullable(),
    })
    .nullable(),
});

const REPOSITORY_CHECKS_QUERY = `
  query RepositoryInventoryChecksPage(
    $repositoryId: ID!
    $headSha: GitObjectID!
    $after: String
  ) {
    repository: node(id: $repositoryId) {
      __typename
      ... on Repository {
        id
        nameWithOwner
        object(oid: $headSha) {
          __typename
          ... on Commit {
            oid
            statusCheckRollup {
              contexts(first: 100, after: $after) {
                totalCount
                checkRunCount
                statusContextCount
                checkRunCountsByState { state count }
                statusContextCountsByState { state count }
                pageInfo { hasNextPage endCursor }
                nodes {
                  __typename
                  ... on CheckRun {
                    id
                    name
                    status
                    conclusion
                    detailsUrl
                    url
                    startedAt
                    completedAt
                    checkSuite { app { name } }
                  }
                  ... on StatusContext {
                    id
                    state
                    context
                    description
                    targetUrl
                    updatedAt
                  }
                }
              }
            }
          }
        }
      }
    }
    rateLimit { cost limit remaining resetAt }
  }
`;

function unavailableRepositoryChecks(): never {
  throw new Error("Repository checks are unavailable.");
}

export const resolveRepositoryInventoryChecksContext = internalQuery({
  args: {
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    rowKey: string(),
  },
  returns: vRepositoryInventoryChecksContext,
  handler: async (ctx, args): Promise<RepositoryInventoryChecksContext> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return unavailableRepositoryChecks();
    }

    const [vault, inventory, snapshot, item] = await Promise.all([
      ctx.db.get(args.vaultId),
      ctx.db
        .query("vaultRepositoryInventories")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .unique(),
      ctx.db.get(args.snapshotId),
      ctx.db
        .query("vaultRepositoryInventoryItems")
        .withIndex("by_snapshot_and_rowKey", (q) =>
          q.eq("snapshotId", args.snapshotId).eq("rowKey", args.rowKey),
        )
        .unique(),
    ]);
    if (
      !isLiveConnectedVault(vault) ||
      vault.userId !== userId ||
      inventory?.userId !== userId ||
      inventory.vaultId !== args.vaultId ||
      inventory.publication?.snapshotId !== args.snapshotId ||
      !snapshot ||
      snapshot.state !== "ready" ||
      snapshot.vaultId !== args.vaultId ||
      !item ||
      item.vaultId !== args.vaultId
    ) {
      return unavailableRepositoryChecks();
    }

    const publication = inventory.publication;
    const connectedRepositoryFullName = `${vault.githubOwner}/${vault.githubName}`;
    if (
      publication.repositoryNodeId !== vault.ghRepoNodeId ||
      snapshot.repositoryNodeId !== publication.repositoryNodeId ||
      snapshot.repositoryFullName.toLowerCase() !== publication.repositoryFullName.toLowerCase() ||
      connectedRepositoryFullName.toLowerCase() !== publication.repositoryFullName.toLowerCase()
    ) {
      throw new Error("Published repository identity is inconsistent.");
    }
    parseRepositoryFullName(publication.repositoryFullName);
    if (item.headCommit.sha.length === 0) {
      throw new Error("Published repository item has no head commit.");
    }

    const repositoryIdentity =
      item.kind === "branch"
        ? {
            repositoryNodeId: publication.repositoryNodeId,
            repositoryFullName: publication.repositoryFullName,
          }
        : item.headRepository.state === "available"
          ? {
              repositoryNodeId: item.headRepository.repositoryNodeId,
              repositoryFullName: item.headRepository.repositoryFullName,
            }
          : unavailableRepositoryChecks();
    parseRepositoryFullName(repositoryIdentity.repositoryFullName);

    return {
      userId,
      ...repositoryIdentity,
      headSha: item.headCommit.sha,
    };
  },
});

function normalizeCheckContext(
  context: z.infer<typeof checkContextSchema>,
): RepositoryInventoryOrdinaryCheck {
  if (context.__typename === "CheckRun") {
    const normalized = normalizeCommitCheckRun({
      id: context.id,
      name: context.name,
      status: context.status.toLowerCase(),
      conclusion: context.conclusion?.toLowerCase(),
      detailsUrl: context.detailsUrl ?? undefined,
      htmlUrl: context.url,
      appName: context.checkSuite.app?.name,
      startedAt: context.startedAt ?? undefined,
      completedAt: context.completedAt ?? undefined,
    });
    return {
      source: "check_run",
      sourceKey: normalized.sourceKey,
      name: normalized.name,
      providerName: normalized.providerName,
      state: normalized.state,
      status: normalized.status,
      conclusion: normalized.conclusion,
      targetUrl: normalized.targetUrl,
      githubUrl: normalized.githubUrl,
      startedAt: normalized.startedAt,
      completedAt: normalized.completedAt,
      updatedAt: normalized.updatedAt,
    };
  }

  const normalized = normalizeCommitStatus({
    id: context.id,
    state: context.state.toLowerCase(),
    context: context.context,
    description: context.description,
    targetUrl: context.targetUrl,
    updatedAt: context.updatedAt,
  });
  return {
    source: "commit_status",
    sourceKey: normalized.sourceKey,
    name: normalized.name,
    state: normalized.state,
    status: normalized.status,
    description: normalized.conclusion,
    targetUrl: normalized.targetUrl,
    updatedAt: normalized.updatedAt,
  };
}

function validateCheckContexts(contexts: z.infer<typeof checkContextsSchema>): void {
  if (
    contexts.totalCount !== contexts.checkRunCount + contexts.statusContextCount ||
    contexts.nodes.length > contexts.totalCount
  ) {
    throw new Error("GitHub returned inconsistent repository check counts.");
  }
  const checkRunPageCount = contexts.nodes.filter(
    (context) => context.__typename === "CheckRun",
  ).length;
  const statusContextPageCount = contexts.nodes.length - checkRunPageCount;
  if (
    checkRunPageCount > contexts.checkRunCount ||
    statusContextPageCount > contexts.statusContextCount
  ) {
    throw new Error("GitHub returned inconsistent repository check page counts.");
  }
  const seenContexts = new Set<string>();
  for (const context of contexts.nodes) {
    const key = `${context.__typename}:${context.id}`;
    if (seenContexts.has(key)) {
      throw new Error("GitHub returned a duplicate repository check.");
    }
    seenContexts.add(key);
  }
  if (
    contexts.pageInfo.hasNextPage &&
    (contexts.pageInfo.endCursor === null || contexts.pageInfo.endCursor.length === 0)
  ) {
    throw new Error("GitHub repository check pagination omitted its next cursor.");
  }
}

function githubCommitChecksUrl(context: RepositoryInventoryChecksContext): string {
  const { owner, name } = parseRepositoryFullName(context.repositoryFullName);
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commit/${encodeURIComponent(context.headSha)}/checks`;
}

async function repositoryChecksPageSignature(args: {
  items: RepositoryInventoryOrdinaryCheck[];
  totals: RepositoryInventoryChecksPage["totals"];
}): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(args));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function fetchRepositoryInventoryChecksPage(args: {
  context: RepositoryInventoryChecksContext;
  cursor: string | null;
  requestGraphql: RepositoryInventoryGraphqlRequest;
}): Promise<RepositoryInventoryChecksPage> {
  const rawResponse = await args.requestGraphql(REPOSITORY_CHECKS_QUERY, {
    repositoryId: args.context.repositoryNodeId,
    headSha: args.context.headSha,
    after: args.cursor,
  });
  const parsedResponse = repositoryChecksResponseSchema.safeParse(rawResponse);
  if (!parsedResponse.success) {
    throw new Error("GitHub returned malformed repository checks.");
  }
  const repository = parsedResponse.data.repository;
  if (
    repository === null ||
    repository.id !== args.context.repositoryNodeId ||
    repository.nameWithOwner.toLowerCase() !== args.context.repositoryFullName.toLowerCase()
  ) {
    throw new Error("GitHub repository identity changed while loading checks.");
  }
  const rawCommit = repository.object;
  if (
    rawCommit === null ||
    typeof rawCommit !== "object" ||
    !("__typename" in rawCommit) ||
    rawCommit.__typename !== "Commit"
  ) {
    throw new Error("GitHub commit identity changed while loading checks.");
  }
  const parsedCommit = commitSchema.safeParse(rawCommit);
  if (!parsedCommit.success) {
    throw new Error("GitHub returned malformed repository checks.");
  }
  const commit = parsedCommit.data;
  if (commit.oid !== args.context.headSha) {
    throw new Error("GitHub commit identity changed while loading checks.");
  }
  const contexts = commit.statusCheckRollup?.contexts ?? {
    totalCount: 0,
    checkRunCount: 0,
    statusContextCount: 0,
    checkRunCountsByState: [],
    statusContextCountsByState: [],
    pageInfo: { hasNextPage: false, endCursor: null },
    nodes: [],
  };
  validateCheckContexts(contexts);
  const totals = (() => {
    try {
      return buildRepositoryInventoryCheckSummaryFromCounts(contexts);
    } catch {
      throw new Error("GitHub returned inconsistent repository check counts.");
    }
  })();
  const items = contexts.nodes.map(normalizeCheckContext);
  return {
    items,
    totals,
    pageSignature: await repositoryChecksPageSignature({ items, totals }),
    nextCursor: contexts.pageInfo.hasNextPage ? contexts.pageInfo.endCursor : null,
    githubChecksUrl: githubCommitChecksUrl(args.context),
  };
}

async function verifyRepositoryInventoryCheckPages(args: {
  context: RepositoryInventoryChecksContext;
  expectedPageSignatures: string[];
  requestGraphql: RepositoryInventoryGraphqlRequest;
}): Promise<void> {
  let cursor: string | null = null;
  for (const [index, expectedSignature] of args.expectedPageSignatures.entries()) {
    const page = await fetchRepositoryInventoryChecksPage({
      context: args.context,
      cursor,
      requestGraphql: args.requestGraphql,
    });
    if (page.pageSignature !== expectedSignature) {
      throw new Error("GitHub checks changed while loading. Reopen the check list.");
    }
    const isLastExpectedPage = index === args.expectedPageSignatures.length - 1;
    if (isLastExpectedPage !== (page.nextCursor === null)) {
      throw new Error("GitHub checks changed while loading. Reopen the check list.");
    }
    cursor = page.nextCursor;
  }
}

export const listRepositoryInventoryChecksPage = action({
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    rowKey: string(),
    cursor: union(string(), vNull()),
    previousPageSignatures: array(string()),
  },
  returns: vRepositoryInventoryChecksPage,
  handler: async (ctx, args): Promise<RepositoryInventoryChecksPage> => {
    const context: RepositoryInventoryChecksContext = await ctx.runQuery(
      internal.repositoryInventoryChecks.resolveRepositoryInventoryChecksContext,
      {
        vaultId: args.vaultId,
        snapshotId: args.snapshotId,
        rowKey: args.rowKey,
      },
    );
    const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: context.userId,
      kind: "github",
    });
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected.");
    }
    if ((args.cursor === null) !== (args.previousPageSignatures.length === 0)) {
      throw new Error("GitHub check pagination is inconsistent.");
    }
    if (args.previousPageSignatures.length >= GITHUB_REPOSITORY_CHECKS_MAXIMUM_PAGE_COUNT) {
      throw new Error("GitHub returned too many check pages.");
    }
    const maximumRequestCount =
      args.previousPageSignatures.length === 0 ? 1 : args.previousPageSignatures.length + 2;
    const maximumCost = maximumRequestCount * GITHUB_REPOSITORY_CHECKS_MAXIMUM_COST_PER_REQUEST;
    const deadlineMs = Math.min(
      GITHUB_REPOSITORY_CHECKS_BASE_DEADLINE_MS +
        args.previousPageSignatures.length * GITHUB_REPOSITORY_CHECKS_VERIFICATION_PAGE_DEADLINE_MS,
      GITHUB_REPOSITORY_CHECKS_MAXIMUM_DEADLINE_MS,
    );
    const leaseId = crypto.randomUUID();
    const requestStartedAt = Date.now();
    const budgetClaim = await ctx.runMutation(
      internal.githubGraphqlRateBudget.claimGitHubGraphqlRateBudget,
      {
        githubAccountId: githubConnection.githubAccountId,
        leaseId,
        owner: {
          kind: "repository_inventory_checks",
          vaultId: args.vaultId,
          snapshotId: args.snapshotId,
        },
        estimatedCost: maximumRequestCount,
      },
    );
    if (budgetClaim.kind === "wait") {
      throw new Error("GitHub checks are temporarily unavailable.");
    }
    let leaseOwned = true;
    const graphqlClient = createGitHubGraphqlClient({
      credential: githubConnection.auth.credential,
      limits: {
        deadlineAt: Date.now() + deadlineMs,
        maximumCost,
        maximumRequestCount,
      },
    });
    try {
      const result = await fetchRepositoryInventoryChecksPage({
        context,
        cursor: args.cursor,
        requestGraphql: graphqlClient.request,
      });
      if (
        result.nextCursor !== null &&
        args.previousPageSignatures.length + 1 >= GITHUB_REPOSITORY_CHECKS_MAXIMUM_PAGE_COUNT
      ) {
        throw new Error("GitHub returned too many check pages.");
      }
      if (result.nextCursor === null && args.previousPageSignatures.length > 0) {
        await verifyRepositoryInventoryCheckPages({
          context,
          expectedPageSignatures: [...args.previousPageSignatures, result.pageSignature],
          requestGraphql: graphqlClient.request,
        });
      }
      const usage = graphqlClient.getUsage();
      if (usage === undefined) {
        throw new Error("GitHub GraphQL accounting was not collected.");
      }
      await ctx.runMutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetLease, {
        githubAccountId: githubConnection.githubAccountId,
        leaseId,
        durationMs: Date.now() - requestStartedAt,
        outcome: { kind: "success", usage },
      });
      leaseOwned = false;
      return result;
    } catch (error) {
      if (error instanceof GitHubGraphqlRateLimitError) {
        await ctx.runMutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetLease, {
          githubAccountId: githubConnection.githubAccountId,
          leaseId,
          durationMs: Date.now() - requestStartedAt,
          outcome: {
            kind: "rate_limited",
            limitKind: error.limitKind,
            retryAt: error.retryAt,
            usage: error.usage,
          },
        });
        leaseOwned = false;
      } else if (leaseOwned) {
        await ctx.runMutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetLease, {
          githubAccountId: githubConnection.githubAccountId,
          leaseId,
          durationMs: Date.now() - requestStartedAt,
          outcome: { kind: "failed", usage: graphqlClient.getUsage() },
        });
        leaseOwned = false;
      }
      throw error;
    }
  },
});
