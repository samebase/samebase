import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import type { PublishHeartbeatFromConnectorArgs } from "./connectedMachineModel";
import { makeConvexTest } from "./test.setup";

const now = 10_000;

describe("connected machine account deletion access", () => {
  it("stops heartbeat and control credentials as soon as deletion starts", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "deleting-machine@example.test",
        isApproved: true,
      });
      const machineCredentialId = await ctx.db.insert("operations_machineCredentials", {
        userId,
        machineId: "machine-1",
        credentialHash: "machine-credential-hash",
        createdAt: now,
      });
      const machineId = await ctx.db.insert("connectedMachines", {
        userId,
        machineId: "machine-1",
        displayName: "Test machine",
        hostname: "test-machine.local",
        os: "macos",
        status: "online",
        lastSeenAt: now,
        connectorVersion: "1.0.0",
        capabilities: ["presence", "liveControl"],
        allowedRoots: ["/tmp/test"],
        controlStatus: "ready",
        controlUrl: "https://machine.example.test",
      });
      const controlTokenId = await ctx.db.insert("operations_machineControlTokens", {
        userId,
        machineId: "machine-1",
        tokenHash: "machine-control-token-hash",
        createdAt: now,
        expiresAt: now + 60_000,
      });
      return { controlTokenId, machineCredentialId, machineId, userId };
    });

    const heartbeatArgs: PublishHeartbeatFromConnectorArgs = {
      credentialHash: "machine-credential-hash",
      now: now + 1,
      machineId: "machine-1",
      displayName: "Test machine",
      hostname: "test-machine.local",
      os: "macos",
      status: "online",
      connectorVersion: "1.0.1",
      capabilities: ["presence", "liveControl"],
      allowedRoots: ["/tmp/test"],
      controlStatus: "ready",
      controlUrl: "https://machine.example.test",
    };

    await expect(
      t.mutation(internal.connectedMachines.publishHeartbeatFromConnector, heartbeatArgs),
    ).resolves.toEqual({
      ok: true,
      userId: ids.userId,
      machineId: "machine-1",
    });
    await expect(
      t.mutation(internal.connectedMachineControl.introspectMachineControlToken, {
        machineId: "machine-1",
        now: now + 1,
        tokenHash: "machine-control-token-hash",
      }),
    ).resolves.toMatchObject({ active: true, userId: ids.userId });

    await t.run(async (ctx) => {
      const initiatingSessionId = await ctx.db.insert("authSessions", {
        userId: ids.userId,
        expirationTime: now + 60_000,
      });
      const runId = await ctx.db.insert("operations_accountDeletionRuns", {
        identity: {
          state: "active",
          userId: ids.userId,
          email: "deleting-machine@example.test",
        },
        completionCapability: "connected-machine-test",
        state: "running",
        workflow: { state: "started", workflowId: "machine-deletion-test", attempt: 1 },
        currentStep: "revoke_access",
        requestedAt: now + 2,
        updatedAt: now + 2,
        initiatingSessionId,
        retryCount: 0,
        outcomes: {
          billing: { state: "not_started" },
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
      });
      await ctx.db.patch(ids.userId, {
        accountDeletion: { state: "deleting", runId, requestedAt: now + 2 },
      });
    });

    await expect(
      t.mutation(internal.connectedMachines.publishHeartbeatFromConnector, {
        ...heartbeatArgs,
        now: now + 3,
      }),
    ).resolves.toEqual({ ok: false, reason: "not_found" });
    await expect(
      t.mutation(internal.connectedMachineControl.introspectMachineControlToken, {
        machineId: "machine-1",
        now: now + 3,
        tokenHash: "machine-control-token-hash",
      }),
    ).resolves.toEqual({ active: false });

    await expect(
      t.run(async (ctx) => ({
        controlToken: await ctx.db.get(ids.controlTokenId),
        machine: await ctx.db.get(ids.machineId),
        machineCredential: await ctx.db.get(ids.machineCredentialId),
      })),
    ).resolves.toMatchObject({
      controlToken: { lastUsedAt: now + 1 },
      machine: { lastSeenAt: now + 1 },
      machineCredential: { lastUsedAt: now + 1 },
    });
  });
});
