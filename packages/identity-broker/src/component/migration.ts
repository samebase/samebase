import { v } from "convex/values";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host functions enforce access.
import { mutation } from "./_generated/server";
import { vBlockKind, vRegisteredBy } from "./schema";

// RFC 135, once: the rows of a hub of 0.18.0, which kept them in its own tables. RFC 135 PR B deletes
// this module. Run it right after the deploy, with third-party registration paused. A client that
// registered in between already has its record and its event, and an app whose token was replaced in
// between keeps the new one. Every step is idempotent: a second run changes nothing.

const { array, literal, number, object, string, union } = v;

export const importHubRows = mutation({
  args: {
    registrations: array(
      object({
        clientId: string(),
        githubRepositoryDatabaseId: string(),
        githubOwnerId: string(),
        app: string(),
        registeredAt: number(),
        registeredBy: vRegisteredBy,
      }),
    ),
    initialAccessTokens: array(
      object({
        tokenHash: string(),
        githubRepositoryDatabaseId: string(),
        githubOwnerId: string(),
        githubRepository: string(),
        app: string(),
        issuedAt: number(),
      }),
    ),
    blocks: array(
      object({
        kind: vBlockKind,
        githubId: string(),
        reason: string(),
        adminEmail: string(),
        at: number(),
      }),
    ),
    blockEvents: array(
      object({
        action: union(literal("block"), literal("unblock")),
        kind: vBlockKind,
        githubId: string(),
        reason: string(),
        adminEmail: string(),
        at: number(),
      }),
    ),
  },
  returns: object({
    clientsFilled: number(),
    registrationEvents: number(),
    initialAccessTokens: number(),
    blocks: number(),
    blockEvents: number(),
    tenantsCleared: number(),
  }),
  handler: async (ctx, args) => {
    const result = {
      clientsFilled: 0,
      registrationEvents: 0,
      initialAccessTokens: 0,
      blocks: 0,
      blockEvents: 0,
      tenantsCleared: 0,
    };
    for (const registration of args.registrations) {
      const client = await ctx.db
        .query("clients")
        .withIndex("by_client_id", (q) => q.eq("clientId", registration.clientId))
        .unique();
      if (client !== null && client.registeredBy === undefined) {
        await ctx.db.patch("clients", client._id, {
          app: registration.app,
          registeredBy: registration.registeredBy,
        });
        result.clientsFilled += 1;
      }
      // A registration event of a deleted client still answers whether its owner is new.
      const events = await ctx.db
        .query("events")
        .withIndex("by_github_owner_id", (q) => q.eq("githubOwnerId", registration.githubOwnerId))
        .collect();
      if (
        !events.some(
          (event) => event.kind === "registration" && event.clientId === registration.clientId,
        )
      ) {
        await ctx.db.insert("events", {
          kind: "registration",
          clientId: registration.clientId,
          githubRepositoryDatabaseId: registration.githubRepositoryDatabaseId,
          githubOwnerId: registration.githubOwnerId,
          at: registration.registeredAt,
        });
        result.registrationEvents += 1;
      }
    }
    for (const token of args.initialAccessTokens) {
      // A production run that registered after the deploy already replaced this app's token here:
      // the hub's older row must not come back next to it.
      const existing = await ctx.db
        .query("initialAccessTokens")
        .withIndex("by_repository_and_app", (q) =>
          q.eq("githubRepositoryDatabaseId", token.githubRepositoryDatabaseId).eq("app", token.app),
        )
        .first();
      if (existing === null) {
        await ctx.db.insert("initialAccessTokens", token);
        result.initialAccessTokens += 1;
      }
    }
    for (const block of args.blocks) {
      const existing = await ctx.db
        .query("blocks")
        .withIndex("by_kind_and_github_id", (q) =>
          q.eq("kind", block.kind).eq("githubId", block.githubId),
        )
        .unique();
      if (existing === null) {
        await ctx.db.insert("blocks", block);
        result.blocks += 1;
      }
    }
    const blockEvents = await ctx.db
      .query("events")
      .withIndex("by_kind_and_at", (q) => q.eq("kind", "block_change"))
      .collect();
    for (const event of args.blockEvents) {
      const copied = blockEvents.some(
        (existing) =>
          existing.kind === "block_change" &&
          existing.at === event.at &&
          existing.githubId === event.githubId,
      );
      if (!copied) {
        await ctx.db.insert("events", {
          kind: "block_change",
          action: event.action,
          scope: event.kind,
          githubId: event.githubId,
          reason: event.reason,
          adminEmail: event.adminEmail,
          at: event.at,
        });
        result.blockEvents += 1;
      }
    }
    // `disconnected` is read by nothing now; PR B removes the field.
    for (const tenant of await ctx.db.query("tenants").collect()) {
      if (tenant.disconnected !== undefined) {
        await ctx.db.patch("tenants", tenant._id, { disconnected: undefined });
        result.tenantsCleared += 1;
      }
    }
    return result;
  },
});
