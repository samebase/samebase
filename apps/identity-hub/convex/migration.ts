import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";

/**
 * RFC 135, once: copies the rows of this hub's own tables into the broker, which holds every row from
 * broker 0.19.0 on. Run it with `npx convex run migration:importHubRows` while `THIRD_PARTY_PAUSED`
 * is `true` and no app deploys, then check its counts. It is idempotent. RFC 135 PR B deletes it and
 * the tables of convex/schema.ts. Rate limit windows are not copied: nothing registers while paused.
 */
export const importHubRows = internalMutation({
  args: {},
  returns: v.object({
    clientsFilled: v.number(),
    registrationEvents: v.number(),
    initialAccessTokens: v.number(),
    blocks: v.number(),
    blockEvents: v.number(),
    tenantsCleared: v.number(),
  }),
  handler: async (ctx) => {
    const registrations = await ctx.db.query("registrations").collect();
    const tokens = await ctx.db.query("initialAccessTokens").collect();
    const blocks = await ctx.db.query("blocks").collect();
    const blockEvents = await ctx.db.query("audit_block_events").collect();
    return await ctx.runMutation(components.identityBroker.migration.importHubRows, {
      registrations: registrations.map((row) => ({
        clientId: row.clientId,
        githubRepositoryDatabaseId: row.githubRepositoryDatabaseId,
        githubOwnerId: row.githubOwnerId,
        app: row.app,
        registeredAt: row.registeredAt,
        registeredBy:
          row.proof.kind === "github"
            ? {
                kind: "github" as const,
                githubRepository: row.githubRepository,
                githubOwnerId: row.githubOwnerId,
                githubActorId: row.proof.githubActorId,
                githubActorLogin: row.proof.githubActorLogin,
                commitSha: row.proof.commitSha,
              }
            : {
                kind: "initial_access_token" as const,
                githubRepository: row.githubRepository,
                githubOwnerId: row.githubOwnerId,
                issuedAt: row.proof.issuedAt,
              },
      })),
      initialAccessTokens: tokens.map((row) => ({
        tokenHash: row.tokenHash,
        githubRepositoryDatabaseId: row.githubRepositoryDatabaseId,
        githubOwnerId: row.githubOwnerId,
        githubRepository: row.githubRepository,
        app: row.app,
        issuedAt: row.issuedAt,
      })),
      blocks: blocks.map((row) => ({
        kind: row.kind,
        githubId: row.githubId,
        reason: row.reason,
        adminEmail: row.adminEmail,
        at: row._creationTime,
      })),
      blockEvents: blockEvents.map((row) => ({
        action: row.action,
        kind: row.kind,
        githubId: row.githubId,
        reason: row.reason,
        adminEmail: row.adminEmail,
        at: row._creationTime,
      })),
    });
  },
});
