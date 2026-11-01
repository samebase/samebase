import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";

import { components, internal } from "../_generated/api";
import { env, internalAction, type DatabaseReader, type MutationCtx } from "../_generated/server";

const workflow = new WorkflowManager(components.workflow);
const { boolean, number, string } = v;

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

const vTenantConnection = {
  githubRepositoryDatabaseId: string(),
  connected: boolean(),
  /** The count of this change. Every retry sends the same one, and the hub ignores an older one. */
  revision: number(),
};

/**
Sends one change. It does not read the repository: a request can stall past a newer change, and only
the hub can put the two in order, by their revisions.
*/
export const sendTenantConnection = internalAction({
  args: vTenantConnection,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const hub = readHub();
    if (hub === null) {
      return null;
    }

    const response = await fetch(`${hub.issuer}/tenant-connection`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hub.registrationKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenant_id: `gh-${args.githubRepositoryDatabaseId}`,
        connected: args.connected,
        revision: args.revision,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`The identity hub answered ${response.status}.`);
    }
    return null;
  },
});

export const syncTenantConnection = workflow.define({
  args: vTenantConnection,
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    await step.runAction(
      internal.hubClients.tenantConnection.sendTenantConnection,
      {
        githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
        connected: args.connected,
        revision: args.revision,
      },
      { name: "send_tenant_connection", retry: hubOutageRetry },
    );
    return null;
  },
});

/**
Runs in the transaction that connects a repository or removes it from Samebase. This covers every
app and client of the repository, so a repository that leaves stops new sign-ins, and one that
connects again gets the same user IDs back. An administrator's suspension is separate at the hub,
so connecting again does not clear it. The count goes up in this transaction, so the revisions follow
the order in which the changes commit.
*/
export async function startTenantConnectionSync(
  ctx: MutationCtx,
  githubRepositoryDatabaseId: string,
  connected: boolean,
): Promise<void> {
  if (readHub() === null) {
    return;
  }
  const row = await ctx.db
    .query("hubClientConnectionRevisions")
    .withIndex("by_github_repository_database_id", (query) =>
      query.eq("githubRepositoryDatabaseId", githubRepositoryDatabaseId),
    )
    .unique();
  const revision = (row?.revision ?? 0) + 1;
  if (row === null) {
    await ctx.db.insert("hubClientConnectionRevisions", { githubRepositoryDatabaseId, revision });
  } else {
    await ctx.db.patch(row._id, { revision });
  }
  await workflow.start(
    ctx,
    internal.hubClients.tenantConnection.syncTenantConnection,
    { githubRepositoryDatabaseId, connected, revision },
    { startAsync: true },
  );
}
