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

  const readState = async () => {
    return await t.run(async (ctx) => {
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
      const grant = await ctx.db
        .query("mcpGrants")
        .withIndex("by_grant_id", (q) => q.eq("grantId", grantId))
        .first();

      return {
        refreshTokens: refreshTokens.map((token) => ({
          tokenHash: token.tokenHash,
          status: token.status,
          rotatedAt: token.rotatedAt,
          replacedByTokenHash: token.replacedByTokenHash,
        })),
        accessTokens: accessTokens.map((token) => ({
          tokenHash: token.tokenHash,
          createdAt: token.createdAt,
        })),
        audits: audits.map((audit) => ({
          grantId: audit.grantId,
          clientId: audit.clientId,
          userId: audit.userId,
          action: audit.action,
          createdAt: audit.createdAt,
          detailsJson: audit.detailsJson,
        })),
        grant:
          grant === null
            ? null
            : {
                updatedAt: grant.updatedAt,
                lastUsedAt: grant.lastUsedAt,
              },
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

  return { exchange, readDatabaseState, readState, userId };
}

describe("MCP OAuth refresh token replay", () => {
  it("revokes the active descendant when the attacker rotates first", async () => {
    const { exchange, readDatabaseState, readState, userId } = await seedRefreshTokenFamily();

    await expect(
      exchange({
        refreshTokenHash: initialRefreshTokenHash,
        newRefreshTokenHash: "refresh_hash_attacker_1",
        accessTokenHash: "access_hash_attacker_1",
        now: now + 1,
      }),
    ).resolves.toEqual(successfulExchange(userId));
    await expect(
      exchange({
        refreshTokenHash: "refresh_hash_attacker_1",
        newRefreshTokenHash: "refresh_hash_attacker_2",
        accessTokenHash: "access_hash_attacker_2",
        now: now + 2,
      }),
    ).resolves.toEqual(successfulExchange(userId));

    await expect(
      exchange({
        refreshTokenHash: initialRefreshTokenHash,
        newRefreshTokenHash: "refresh_hash_legitimate_unused",
        accessTokenHash: "access_hash_legitimate_unused",
        now: now + 3,
      }),
    ).resolves.toEqual(inactiveRefreshTokenError);

    await expect(readState()).resolves.toEqual({
      refreshTokens: [
        {
          tokenHash: initialRefreshTokenHash,
          status: "rotated",
          rotatedAt: now + 1,
          replacedByTokenHash: "refresh_hash_attacker_1",
        },
        {
          tokenHash: "refresh_hash_attacker_1",
          status: "rotated",
          rotatedAt: now + 2,
          replacedByTokenHash: "refresh_hash_attacker_2",
        },
        {
          tokenHash: "refresh_hash_attacker_2",
          status: "revoked",
          rotatedAt: now + 3,
          replacedByTokenHash: undefined,
        },
      ],
      accessTokens: [
        { tokenHash: "access_hash_attacker_1", createdAt: now + 1 },
        { tokenHash: "access_hash_attacker_2", createdAt: now + 2 },
      ],
      audits: [
        {
          grantId,
          clientId,
          userId,
          action: "access_token_issued",
          createdAt: now + 1,
          detailsJson: '{"flow":"refresh_token"}',
        },
        {
          grantId,
          clientId,
          userId,
          action: "access_token_issued",
          createdAt: now + 2,
          detailsJson: '{"flow":"refresh_token"}',
        },
        {
          grantId,
          clientId,
          userId,
          action: "refresh_token_replay_detected",
          createdAt: now + 3,
          detailsJson: '{"outcome":"active_refresh_token_revoked"}',
        },
      ],
      grant: {
        updatedAt: now + 2,
        lastUsedAt: now + 2,
      },
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
        refreshTokenHash: "refresh_hash_attacker_2",
        newRefreshTokenHash: "refresh_hash_attacker_3_unused",
        accessTokenHash: "access_hash_attacker_3_unused",
        now: now + 5,
      }),
    ).resolves.toEqual(inactiveRefreshTokenError);
    await expect(readDatabaseState()).resolves.toEqual(containedState);
  });

  it("revokes the legitimate replacement when the legitimate client rotates first", async () => {
    const { exchange, readDatabaseState, readState, userId } = await seedRefreshTokenFamily();

    await expect(
      exchange({
        refreshTokenHash: initialRefreshTokenHash,
        newRefreshTokenHash: "refresh_hash_legitimate",
        accessTokenHash: "access_hash_legitimate",
        now: now + 1,
      }),
    ).resolves.toEqual(successfulExchange(userId));

    await expect(
      exchange({
        refreshTokenHash: initialRefreshTokenHash,
        newRefreshTokenHash: "refresh_hash_attacker_unused",
        accessTokenHash: "access_hash_attacker_unused",
        now: now + 2,
      }),
    ).resolves.toEqual(inactiveRefreshTokenError);

    await expect(readState()).resolves.toEqual({
      refreshTokens: [
        {
          tokenHash: initialRefreshTokenHash,
          status: "rotated",
          rotatedAt: now + 1,
          replacedByTokenHash: "refresh_hash_legitimate",
        },
        {
          tokenHash: "refresh_hash_legitimate",
          status: "revoked",
          rotatedAt: now + 2,
          replacedByTokenHash: undefined,
        },
      ],
      accessTokens: [{ tokenHash: "access_hash_legitimate", createdAt: now + 1 }],
      audits: [
        {
          grantId,
          clientId,
          userId,
          action: "access_token_issued",
          createdAt: now + 1,
          detailsJson: '{"flow":"refresh_token"}',
        },
        {
          grantId,
          clientId,
          userId,
          action: "refresh_token_replay_detected",
          createdAt: now + 2,
          detailsJson: '{"outcome":"active_refresh_token_revoked"}',
        },
      ],
      grant: {
        updatedAt: now + 1,
        lastUsedAt: now + 1,
      },
    });

    const containedState = await readDatabaseState();
    await expect(
      exchange({
        refreshTokenHash: "refresh_hash_legitimate",
        newRefreshTokenHash: "refresh_hash_legitimate_retry_unused",
        accessTokenHash: "access_hash_legitimate_retry_unused",
        now: now + 3,
      }),
    ).resolves.toEqual(inactiveRefreshTokenError);
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
