import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";

const now = 1_000;
const clientId = "mcpc_refresh_replay";
const grantId = "mcpg_refresh_replay";
const resource = "https://samebase.test/mcp";
const scope = "access_dashboard";
const initialRefreshTokenHash = "refresh_hash_initial";

const inactiveRefreshTokenError = {
  ok: false,
  status: 400,
  error: "invalid_grant",
  errorDescription: "Refresh token is no longer active.",
};

const inactiveGrantError = {
  ok: false,
  status: 400,
  error: "invalid_grant",
  errorDescription: "Grant is no longer active.",
};

function successfulExchange(userId: Id<"users">) {
  return {
    ok: true,
    grantId,
    userId,
    clientId,
    scope,
    resource,
    refreshTokenIssued: true,
  };
}

async function seedRefreshTokenFamily() {
  const t = makeConvexTest();
  const userId = await t.run(async (ctx) => {
    const seededUserId = await ctx.db.insert("users", {
      email: "refresh-replay@example.test",
      isApproved: true,
      name: "Refresh Replay User",
    });
    await ctx.db.insert("mcpOauthClients", {
      clientId,
      clientName: "Refresh replay client",
      redirectUris: ["http://127.0.0.1/callback"],
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "none",
      createdAt: now,
      updatedAt: now,
      createdBy: "dynamic_registration",
      registrationStatus: "active",
      metadataJson: "{}",
    });
    await ctx.db.insert("mcpGrants", {
      grantId,
      userId: seededUserId,
      clientId,
      resource,
      scope,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("mcpRefreshTokens", {
      grantId,
      clientId,
      userId: seededUserId,
      tokenHash: initialRefreshTokenHash,
      status: "active",
      createdAt: now,
      expiresAt: now + 60_000,
    });
    return seededUserId;
  });

  const exchange = async (args: {
    refreshTokenHash: string;
    newRefreshTokenHash: string;
    accessTokenHash: string;
    now: number;
  }) => {
    return await t.mutation(internal.mcp.oauth.exchangeRefreshToken, {
      ...args,
      clientId,
      accessTokenExpiresAt: args.now + 60_000,
      refreshTokenExpiresAt: args.now + 60_000,
    });
  };

  const readContainmentState = async () => {
    return await t.run(async (ctx) => {
      const grant = await ctx.db
        .query("mcpGrants")
        .withIndex("by_grant_id", (q) => q.eq("grantId", grantId))
        .unique();
      const refreshTokens = await ctx.db
        .query("mcpRefreshTokens")
        .withIndex("by_grant_id", (q) => q.eq("grantId", grantId))
        .collect();
      const accessTokens = await ctx.db
        .query("mcpAccessTokens")
        .withIndex("by_grant_id", (q) => q.eq("grantId", grantId))
        .collect();
      const audits = await ctx.db
        .query("mcpAccessAudit")
        .withIndex("by_grant_id", (q) => q.eq("grantId", grantId))
        .collect();

      return {
        accessTokenCount: accessTokens.length,
        grant: grant && {
          lastUsedAt: grant.lastUsedAt,
          status: grant.status,
          updatedAt: grant.updatedAt,
        },
        refreshTokens: refreshTokens.map((token) => ({
          status: token.status,
          tokenHash: token.tokenHash,
        })),
        replayAudits: audits
          .filter((audit) => audit.action === "refresh_token_replay_detected")
          .map((audit) => ({
            createdAt: audit.createdAt,
            detailsJson: audit.detailsJson,
          })),
      };
    });
  };

  const readDatabaseState = async () => {
    return await t.run(async (ctx) => ({
      clients: await ctx.db.query("mcpOauthClients").collect(),
      grants: await ctx.db.query("mcpGrants").collect(),
      refreshTokens: await ctx.db.query("mcpRefreshTokens").collect(),
      accessTokens: await ctx.db.query("mcpAccessTokens").collect(),
      audits: await ctx.db.query("mcpAccessAudit").collect(),
    }));
  };

  return { exchange, readContainmentState, readDatabaseState, userId };
}

describe("MCP OAuth refresh token replay", () => {
  it("revokes the grant once without walking the replacement chain", async () => {
    const { exchange, readContainmentState, readDatabaseState, userId } =
      await seedRefreshTokenFamily();

    await expect(
      exchange({
        refreshTokenHash: initialRefreshTokenHash,
        newRefreshTokenHash: "refresh_hash_descendant_1",
        accessTokenHash: "access_hash_1",
        now: now + 1,
      }),
    ).resolves.toEqual(successfulExchange(userId));
    await expect(
      exchange({
        refreshTokenHash: "refresh_hash_descendant_1",
        newRefreshTokenHash: "refresh_hash_descendant_2",
        accessTokenHash: "access_hash_2",
        now: now + 2,
      }),
    ).resolves.toEqual(successfulExchange(userId));

    await expect(
      exchange({
        refreshTokenHash: initialRefreshTokenHash,
        newRefreshTokenHash: "refresh_hash_replay_unused",
        accessTokenHash: "access_hash_replay_unused",
        now: now + 3,
      }),
    ).resolves.toEqual(inactiveRefreshTokenError);

    await expect(readContainmentState()).resolves.toEqual({
      accessTokenCount: 2,
      grant: {
        lastUsedAt: now + 2,
        status: "revoked",
        updatedAt: now + 3,
      },
      refreshTokens: [
        { status: "rotated", tokenHash: initialRefreshTokenHash },
        { status: "rotated", tokenHash: "refresh_hash_descendant_1" },
        { status: "active", tokenHash: "refresh_hash_descendant_2" },
      ],
      replayAudits: [
        {
          createdAt: now + 3,
          detailsJson: '{"outcome":"grant_revoked"}',
        },
      ],
    });

    const containedState = await readDatabaseState();
    await expect(
      exchange({
        refreshTokenHash: initialRefreshTokenHash,
        newRefreshTokenHash: "refresh_hash_repeated_replay_unused",
        accessTokenHash: "access_hash_repeated_replay_unused",
        now: now + 4,
      }),
    ).resolves.toEqual(inactiveRefreshTokenError);
    await expect(readDatabaseState()).resolves.toEqual(containedState);

    await expect(
      exchange({
        refreshTokenHash: "refresh_hash_descendant_2",
        newRefreshTokenHash: "refresh_hash_descendant_3_unused",
        accessTokenHash: "access_hash_3_unused",
        now: now + 5,
      }),
    ).resolves.toEqual(inactiveGrantError);
    await expect(readDatabaseState()).resolves.toEqual(containedState);
  });

  it("does not write for an unknown refresh token", async () => {
    const { exchange, readDatabaseState } = await seedRefreshTokenFamily();
    const before = await readDatabaseState();

    await expect(
      exchange({
        refreshTokenHash: "refresh_hash_unknown",
        newRefreshTokenHash: "refresh_hash_unknown_replacement_unused",
        accessTokenHash: "access_hash_unknown_unused",
        now: now + 1,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: "invalid_grant",
      errorDescription: "Refresh token is invalid.",
    });

    await expect(readDatabaseState()).resolves.toEqual(before);
  });
});
