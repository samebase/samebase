import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";

import { components, internal } from "../_generated/api";
import {
  env,
  internalAction,
  internalQuery,
  type DatabaseReader,
  type MutationCtx,
} from "../_generated/server";
import { isLiveConnectedRepository } from "../repository/state";

const workflow = new WorkflowManager(components.workflow);
const { boolean, string } = v;

/** About 34 hours from the first failure to the last attempt, so a hub outage does not lose a call. */
const hubOutageRetry = {
  maxAttempts: 12,
  initialBackoffMs: 60_000,
  base: 2,
} as const;

/**
The identity hub that third-party clients register at, or null while the feature is off. A local
backend holds the no-hub values of `scripts/lib/convexAuthKeys.ts`.
*/
export function readHub() {
  const registrationKey = env.HUB_REGISTRATION_KEY?.trim();
  return registrationKey && env.HUB_CLIENT_ID !== "no-hub"
    ? { issuer: env.HUB_ISSUER, registrationKey }
    : null;
}

/** The numeric GitHub id is the stable identity: an owner or a name can change. */
export async function readRepositoryByGitHubId(
  db: DatabaseReader,
  githubRepositoryDatabaseId: string,
) {
  return await db
    .query("repositories")
    .withIndex("by_github_repository_database_id", (query) =>
      query.eq("githubRepositoryDatabaseId", githubRepositoryDatabaseId),
    )
    .unique();
}

export const isRepositoryLive = internalQuery({
  args: { githubRepositoryDatabaseId: string() },
  returns: boolean(),
  handler: async (ctx, args) =>
    isLiveConnectedRepository(
      await readRepositoryByGitHubId(ctx.db, args.githubRepositoryDatabaseId),
    ),
});

/**
Sends the repository's current state, not the state that started this call, so that a retry after
a hub outage cannot undo a later removal or a later connection.
*/
export const sendTenantSuspension = internalAction({
  args: { githubRepositoryDatabaseId: string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const hub = readHub();
    if (hub === null) {
      return null;
    }

    const connected: boolean = await ctx.runQuery(
      internal.hubClients.tenantSuspension.isRepositoryLive,
      {
        githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      },
    );
    const response = await fetch(`${hub.issuer}/tenant-suspension`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hub.registrationKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenant_id: `gh-${args.githubRepositoryDatabaseId}`,
        suspended: !connected,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`The identity hub answered ${response.status}.`);
    }
    return null;
  },
});

export const syncTenantSuspension = workflow.define({
  args: { githubRepositoryDatabaseId: string() },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    await step.runAction(
      internal.hubClients.tenantSuspension.sendTenantSuspension,
      { githubRepositoryDatabaseId: args.githubRepositoryDatabaseId },
      { name: "send_tenant_suspension", retry: hubOutageRetry },
    );
    return null;
  },
});

/**
Runs in the transaction that connects a repository or removes it from Samebase. The hub's switch
covers every app and client of the repository, so a repository that leaves stops new sign-ins, and
one that connects again gets the same user IDs back. It takes only the GitHub id: the repository
row is gone by the time a late retry runs.
*/
export async function startTenantSuspensionSync(
  ctx: MutationCtx,
  githubRepositoryDatabaseId: string,
): Promise<void> {
  if (readHub() === null) {
    return;
  }
  await workflow.start(
    ctx,
    internal.hubClients.tenantSuspension.syncTenantSuspension,
    { githubRepositoryDatabaseId },
    { startAsync: true },
  );
}
