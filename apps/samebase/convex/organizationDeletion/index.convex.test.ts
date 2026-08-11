import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { buildOrganizationDeletionConfirmationPhrase } from "../../shared/organizationDeletionPhrase";
import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";
import {
  ACTION_BLOB_RESERVATION_MS,
  buildPendingUploadStorageContentType,
} from "../pendingUploads";
import { ORGANIZATION_DELETION_STALE_EXECUTION_MS } from "./executor";

afterEach(() => {
  vi.useRealTimers();
});

async function seedOrganization(t: ReturnType<typeof makeConvexTest>) {
  const ids = await t.run(async (ctx) => {
    const ownerUserId = await ctx.db.insert("users", {
      state: "active",
      email: "organization-owner@example.invalid",
      isApproved: true,
    });
    const memberUserId = await ctx.db.insert("users", {
      state: "active",
      email: "organization-member@example.invalid",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "samebase-owner-id",
      githubOwnerType: "organization",
      githubOwnerLogin: "Samebase",
      githubOwnerLoginNormalized: "samebase",
      githubInstallationId: "samebase-installation",
    });
    const ownerMembershipId = await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: ownerUserId,
      role: "owner",
    });
    await ctx.db.insert("organizationBillingAccounts", {
      organizationId,
      plan: "free",
      status: "inactive",
    });
    return { memberUserId, organizationId, ownerMembershipId, ownerUserId };
  });
  return {
    ...ids,
    member: t.withIdentity({
      subject: `${ids.memberUserId}|member-session`,
      tokenIdentifier: `test:${ids.memberUserId}`,
    }),
    owner: t.withIdentity({
      subject: `${ids.ownerUserId}|owner-session`,
      tokenIdentifier: `test:${ids.ownerUserId}`,
    }),
  };
}

async function seedPendingUpload(
  t: ReturnType<typeof makeConvexTest>,
  seed: Awaited<ReturnType<typeof seedOrganization>>,
  expiresAt: number,
) {
  return await t.run(async (ctx) => {
    const vaultId = await ctx.db.insert("vaults", {
      state: "not_connected",
      organizationId: seed.organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
    });
    const originalContentType = "image/png";
    const uploadId = await ctx.db.insert("vaultPendingUploads", {
      organizationId: seed.organizationId,
      vaultId,
      userId: seed.ownerUserId,
      purpose: "browser_media",
      originalContentType,
      expiresAt,
    });
    const storageId = await ctx.storage.store(
      new Blob(["pending image"], {
        type: buildPendingUploadStorageContentType({ originalContentType, uploadId }),
      }),
    );
    // convex-test 0.0.53 omits Blob.type from its synthetic _storage row.
    // @ts-expect-error Test-only system-table patch models the real upload metadata.
    await ctx.db.patch(storageId, {
      contentType: buildPendingUploadStorageContentType({ originalContentType, uploadId }),
    });
    return { storageId, uploadId, vaultId };
  });
}

describe("organization deletion request", () => {
  it("requires the exact phrase, starts one run, and gates new organization writes", async () => {
    vi.useFakeTimers();
    const t = makeConvexTest();
    const seed = await seedOrganization(t);
    const confirmationPhrase = buildOrganizationDeletionConfirmationPhrase("Samebase");

    await expect(
      seed.owner.query(api.organizationDeletion.index.settings, {
        organizationId: seed.organizationId,
      }),
    ).resolves.toMatchObject({
      confirmationPhrase,
      deletion: { state: "eligible" },
    });
    await expect(
      seed.owner.mutation(api.organizationDeletion.index.request, {
        organizationId: seed.organizationId,
        confirmationPhrase: "delete something else",
      }),
    ).resolves.toEqual({ state: "confirmation_mismatch" });

    const accepted = await seed.owner.mutation(api.organizationDeletion.index.request, {
      organizationId: seed.organizationId,
      confirmationPhrase,
    });
    if (accepted.state !== "accepted") {
      throw new Error("Organization deletion request was not accepted.");
    }
    const repeated = await seed.owner.mutation(api.organizationDeletion.index.request, {
      organizationId: seed.organizationId,
      confirmationPhrase: "a lost response does not create another run",
    });
    expect(repeated).toEqual(accepted);

    const snapshot = await t.run(async (ctx) => ({
      organization: await ctx.db.get(seed.organizationId),
      runs: await ctx.db.query("workflow_organizationDeletion_runs").collect(),
    }));
    expect(snapshot.runs).toHaveLength(1);
    expect(snapshot.organization?.deletion).toMatchObject({
      state: "deleting",
      runId: accepted.status.runId,
    });

    await expect(
      t.mutation(internal.billing.ensurePolarExternalCustomerId, {
        userId: seed.ownerUserId,
        organizationId: seed.organizationId,
      }),
    ).rejects.toThrow("Organization deletion is in progress.");
    await expect(
      seed.owner.mutation(api.vault.folders.createVaultFolder, {
        organizationId: seed.organizationId,
        name: "Blocked folder",
      }),
    ).rejects.toThrow("Organization deletion is in progress.");
    await expect(
      t.mutation(internal.oauthState.createOauthState, {
        provider: "convex",
        userId: seed.ownerUserId,
        organizationId: seed.organizationId,
        state: "blocked-oauth-state",
        codeVerifier: "blocked-code-verifier",
        createdAt: 1,
        expiresAt: 2,
      }),
    ).rejects.toThrow("Organization deletion is in progress.");
    await expect(
      t.mutation(internal.organizationAdmin.addExistingUserToOrganization, {
        organizationId: seed.organizationId,
        role: "member",
        userEmail: "organization-member@example.invalid",
      }),
    ).rejects.toThrow("Organization deletion is in progress.");
  });

  it("fails closed when the required organization billing row is missing", async () => {
    const t = makeConvexTest();
    const seed = await seedOrganization(t);
    await t.run(async (ctx) => {
      const billing = await ctx.db
        .query("organizationBillingAccounts")
        .withIndex("by_organization", (query) => query.eq("organizationId", seed.organizationId))
        .unique();
      if (billing === null) {
        throw new Error("Billing account is required by the test.");
      }
      await ctx.db.delete(billing._id);
    });

    await expect(
      seed.owner.mutation(api.organizationDeletion.index.request, {
        organizationId: seed.organizationId,
        confirmationPhrase: buildOrganizationDeletionConfirmationPhrase("Samebase"),
      }),
    ).rejects.toThrow("Organization billing state is missing.");
    await expect(
      t.run(async (ctx) => (await ctx.db.get(seed.organizationId))?.deletion),
    ).resolves.toBeNull();
  });

  it("keeps a shared organization unchanged", async () => {
    const t = makeConvexTest();
    const seed = await seedOrganization(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("organizationMemberships", {
        organizationId: seed.organizationId,
        userId: seed.memberUserId,
        role: "member",
      });
    });

    await expect(
      seed.owner.query(api.organizationDeletion.index.settings, {
        organizationId: seed.organizationId,
      }),
    ).resolves.toMatchObject({ deletion: { state: "shared_organization" } });
    await expect(
      seed.member.query(api.organizationDeletion.index.settings, {
        organizationId: seed.organizationId,
      }),
    ).resolves.toMatchObject({ deletion: { state: "not_owner" } });
    await expect(
      seed.member.mutation(api.organizationDeletion.index.request, {
        organizationId: seed.organizationId,
        confirmationPhrase: buildOrganizationDeletionConfirmationPhrase("Samebase"),
      }),
    ).rejects.toThrow("Organization owner access is required.");
    await expect(
      seed.owner.mutation(api.organizationDeletion.index.request, {
        organizationId: seed.organizationId,
        confirmationPhrase: buildOrganizationDeletionConfirmationPhrase("Samebase"),
      }),
    ).resolves.toEqual({ state: "shared_organization" });

    const snapshot = await t.run(async (ctx) => ({
      organization: await ctx.db.get(seed.organizationId),
      runs: await ctx.db.query("workflow_organizationDeletion_runs").collect(),
    }));
    expect(snapshot.organization?.deletion).toBeUndefined();
    expect(snapshot.runs).toEqual([]);
  });

  it("blocks an invitation acceptance after deletion starts", async () => {
    vi.useFakeTimers();
    const t = makeConvexTest();
    const seed = await seedOrganization(t);
    await seed.owner.mutation(api.organizationDeletion.index.request, {
      organizationId: seed.organizationId,
      confirmationPhrase: buildOrganizationDeletionConfirmationPhrase("Samebase"),
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("authAccounts", {
        userId: seed.memberUserId,
        provider: "github",
        providerAccountId: "invited-github-user",
        secret: "github-secret",
      });
      await ctx.db.insert("organizationInvitations", {
        state: "pending",
        organizationId: seed.organizationId,
        githubAccountId: "invited-github-user",
        githubLogin: "invited-user",
        code: "a".repeat(64),
        createdByUserId: seed.ownerUserId,
        createdAt: 1,
        expiresAt: 2_000_000_000_000,
      });
    });

    await expect(
      seed.member.mutation(api.organizationMembers.acceptInvitation, { code: "a".repeat(64) }),
    ).rejects.toThrow("Organization deletion is in progress.");
  });

  it("waits for a reserved Polar checkout to record its provider identity", async () => {
    vi.useFakeTimers();
    const t = makeConvexTest();
    const seed = await seedOrganization(t);
    await t.run(async (ctx) => {
      const billing = await ctx.db
        .query("organizationBillingAccounts")
        .withIndex("by_organization", (query) => query.eq("organizationId", seed.organizationId))
        .unique();
      if (billing === null) {
        throw new Error("Billing account is required.");
      }
      await ctx.db.patch(billing._id, { polarExternalCustomerId: "samebase_checkout_customer" });
    });
    const reservation = await t.mutation(internal.polarCheckout.reserveAttempt, {
      userId: seed.ownerUserId,
      organizationId: seed.organizationId,
    });
    if (reservation.state !== "pending") {
      throw new Error("A pending checkout reservation is required.");
    }
    const accepted = await seed.owner.mutation(api.organizationDeletion.index.request, {
      organizationId: seed.organizationId,
      confirmationPhrase: buildOrganizationDeletionConfirmationPhrase("Samebase"),
    });
    if (accepted.state !== "accepted") {
      throw new Error("Organization deletion request was not accepted.");
    }

    await expect(
      t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toEqual({ state: "waiting", blocker: "active_polar_checkout" });
    await expect(
      t.mutation(internal.polarCheckout.recordOpen, {
        organizationId: seed.organizationId,
        attemptId: reservation.attemptId,
        checkoutId: "checkout-created-before-deletion",
      }),
    ).resolves.toBe(true);
    await expect(
      t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toEqual({ state: "done" });
  });

  it("rejects delayed Polar observations after the deletion gate starts", async () => {
    vi.useFakeTimers();
    const t = makeConvexTest();
    const seed = await seedOrganization(t);
    await t.run(async (ctx) => {
      const billing = await ctx.db
        .query("organizationBillingAccounts")
        .withIndex("by_organization", (query) => query.eq("organizationId", seed.organizationId))
        .unique();
      if (billing === null) {
        throw new Error("Billing account is required.");
      }
      await ctx.db.patch(billing._id, { polarExternalCustomerId: "delayed_observation_customer" });
    });
    const observationRevision = await t.mutation(internal.polarBillingState.beginObservation, {
      externalCustomerId: "delayed_observation_customer",
    });
    if (observationRevision === null) {
      throw new Error("Polar observation did not start.");
    }
    await seed.owner.mutation(api.organizationDeletion.index.request, {
      organizationId: seed.organizationId,
      confirmationPhrase: buildOrganizationDeletionConfirmationPhrase("Samebase"),
    });

    await expect(
      t.mutation(internal.polarBillingState.applyObservation, {
        observationRevision,
        state: {
          plan: "pro",
          status: "active",
          externalCustomerId: "delayed_observation_customer",
          currentPeriodEndAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          cancelAtPeriodEnd: false,
        },
      }),
    ).resolves.toBe(false);
    await expect(
      t.mutation(internal.polarBillingState.beginObservation, {
        externalCustomerId: "delayed_observation_customer",
      }),
    ).resolves.toBeNull();
    const billing = await t.run(
      async (ctx) =>
        await ctx.db
          .query("organizationBillingAccounts")
          .withIndex("by_organization", (query) => query.eq("organizationId", seed.organizationId))
          .unique(),
    );
    expect(billing).toMatchObject({ plan: "free", status: "inactive" });
    expect(billing?.polarAppliedObservationRevision).toBeUndefined();
  });

  it("drains generic GitHub setup and blocks a new setup during deletion", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const t = makeConvexTest();
    const seed = await seedOrganization(t);
    const setupStateId = await t.mutation(internal.githubAppInstallation.createSetupState, {
      userId: seed.ownerUserId,
      state: "installation-created-before-deletion",
      purpose: "installation",
      createdAt: now,
      expiresAt: now + 60_000,
    });
    const accepted = await seed.owner.mutation(api.organizationDeletion.index.request, {
      organizationId: seed.organizationId,
      confirmationPhrase: buildOrganizationDeletionConfirmationPhrase("Samebase"),
    });
    if (accepted.state !== "accepted") {
      throw new Error("Organization deletion request was not accepted.");
    }

    await expect(
      t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toEqual({ state: "waiting", blocker: "active_github_setup" });
    await expect(
      t.mutation(internal.githubAppInstallation.createSetupState, {
        userId: seed.ownerUserId,
        state: "installation-created-during-deletion",
        purpose: "installation",
        createdAt: now,
        expiresAt: now + 60_000,
      }),
    ).rejects.toThrow("Finish organization deletion");

    vi.setSystemTime(now + 60_001);
    await expect(
      t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toEqual({ state: "done" });
    await expect(t.run(async (ctx) => await ctx.db.get(setupStateId))).resolves.toBeNull();
  });

  it("waits for every organization provider write, including a former member write", async () => {
    vi.useFakeTimers();
    const t = makeConvexTest();
    const seed = await seedOrganization(t);
    const accepted = await seed.owner.mutation(api.organizationDeletion.index.request, {
      organizationId: seed.organizationId,
      confirmationPhrase: buildOrganizationDeletionConfirmationPhrase("Samebase"),
    });
    if (accepted.state !== "accepted") {
      throw new Error("Organization deletion request was not accepted.");
    }
    const vaultId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        organizationId: seed.organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
      });
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId,
        lastWriteAt: {},
        updatedAt: Date.now(),
        owner: {
          kind: "manual_provider_write",
          userId: seed.memberUserId,
          actionId: "former-member-write",
          action: "create_convex_project",
          expiresAt: Date.now() + 60_000,
        },
        state: "active",
      });
      return vaultId;
    });

    await expect(
      t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toEqual({ state: "waiting", blocker: "active_manual_provider_write" });

    await t.run(async (ctx) => {
      const otherOrganizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "other-provider-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "OtherProviderOwner",
        githubOwnerLoginNormalized: "otherproviderowner",
        githubInstallationId: "other-provider-installation",
      });
      await ctx.db.patch(vaultId, { organizationId: otherOrganizationId });
    });
    await expect(
      t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toEqual({ state: "done" });
  });

  it("waits for active vault workflows and continues after their terminal states", async () => {
    const t = makeConvexTest();
    const seed = await seedOrganization(t);
    const accepted = await seed.owner.mutation(api.organizationDeletion.index.request, {
      organizationId: seed.organizationId,
      confirmationPhrase: buildOrganizationDeletionConfirmationPhrase("Samebase"),
    });
    if (accepted.state !== "accepted") {
      throw new Error("Organization deletion request was not accepted.");
    }
    const ids = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        organizationId: seed.organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
      });
      const deletionRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "queued",
        organizationId: seed.organizationId,
        userId: seed.ownerUserId,
        vaultId,
        repositoryFullName: "Samebase/workflow-blocker",
        createdAt: 1,
        updatedAt: 1,
        attempt: { kind: "initial" },
        workflow: { state: "not_started" },
        currentStep: "initialize_deletion",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "failed_repository_setup",
              githubMode: "connect_existing_repository",
              owner: "Samebase",
              name: "workflow-blocker",
              repositoryFullName: "Samebase/workflow-blocker",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "no_confirmed_identity" },
          },
        },
      });
      const provisioningRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        organizationId: seed.organizationId,
        userId: seed.ownerUserId,
        vaultId,
        repositoryFullName: "Samebase/workflow-blocker",
        trigger: "create",
        state: "running",
        currentStep: "sync_tree",
        createdAt: 1,
        updatedAt: 1,
      });
      return { deletionRunId, provisioningRunId };
    });

    await expect(
      t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toEqual({ state: "waiting", blocker: "active_vault_deletion" });
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.deletionRunId, {
        state: "failed",
        lastError: "Expected terminal test state.",
        completedAt: 2,
        updatedAt: 2,
      });
    });
    await expect(
      t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toEqual({ state: "waiting", blocker: "active_app_provisioning" });
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.provisioningRunId, {
        state: "failed",
        lastError: "Expected terminal test state.",
        completedAt: 2,
        updatedAt: 2,
      });
    });
    await expect(
      t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toEqual({ state: "done" });
  });

  it("commits uploaded-blob compensation after the deletion gate closes", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const t = makeConvexTest();
    const seed = await seedOrganization(t);
    const pending = await seedPendingUpload(t, seed, now + 60_000);
    await seed.owner.mutation(api.organizationDeletion.index.request, {
      organizationId: seed.organizationId,
      confirmationPhrase: buildOrganizationDeletionConfirmationPhrase("Samebase"),
    });

    await expect(
      t.mutation(internal.pendingUploads.claimUploadedBlob, {
        uploadId: pending.uploadId,
        storageId: pending.storageId,
        userId: seed.ownerUserId,
      }),
    ).resolves.toEqual({ state: "unavailable" });
    await expect(
      t.run(async (ctx) => await ctx.storage.get(pending.storageId)),
    ).resolves.toBeNull();
  });

  it("waits for an upload URL to expire and removes an unclaimed blob", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const t = makeConvexTest();
    const seed = await seedOrganization(t);
    const pending = await seedPendingUpload(t, seed, now + 60_000);
    const accepted = await seed.owner.mutation(api.organizationDeletion.index.request, {
      organizationId: seed.organizationId,
      confirmationPhrase: buildOrganizationDeletionConfirmationPhrase("Samebase"),
    });
    if (accepted.state !== "accepted") {
      throw new Error("Organization deletion request was not accepted.");
    }

    await expect(
      t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toEqual({ state: "waiting", blocker: "active_media_upload" });
    vi.setSystemTime(now + 60_001);
    await expect(
      t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toEqual({ state: "waiting", blocker: "active_media_upload" });
    await expect(
      t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toEqual({ state: "done" });
    await expect(
      t.run(async (ctx) => ({
        storageExists: (await ctx.storage.get(pending.storageId)) !== null,
        upload: await ctx.db.get(pending.uploadId),
      })),
    ).resolves.toEqual({ storageExists: false, upload: null });
  });

  it("removes an action blob when the action stops before saving its cache row", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const t = makeConvexTest();
    const seed = await seedOrganization(t);
    const vaultId = await t.run(
      async (ctx) =>
        await ctx.db.insert("vaults", {
          state: "not_connected",
          organizationId: seed.organizationId,
          convexTeamId: "convex-team",
          cloudflareAccountId: "cloudflare-account",
          deletion: { state: "not_deleting" },
        }),
    );
    const reservation = await t.mutation(internal.pendingUploads.reserveActionBlob, {
      vaultId,
      userId: seed.ownerUserId,
      contentType: "image/png",
    });
    const storageId = await t.run(async (ctx) => {
      const stored = await ctx.storage.store(
        new Blob(["stopped action blob"], { type: reservation.storageContentType }),
      );
      // convex-test 0.0.53 omits Blob.type from its synthetic _storage row.
      // @ts-expect-error Test-only system-table patch models the real upload metadata.
      await ctx.db.patch(stored, { contentType: reservation.storageContentType });
      return stored;
    });
    const accepted = await seed.owner.mutation(api.organizationDeletion.index.request, {
      organizationId: seed.organizationId,
      confirmationPhrase: buildOrganizationDeletionConfirmationPhrase("Samebase"),
    });
    if (accepted.state !== "accepted") {
      throw new Error("Organization deletion request was not accepted.");
    }

    await expect(
      t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toEqual({ state: "waiting", blocker: "active_media_upload" });
    vi.setSystemTime(now + ACTION_BLOB_RESERVATION_MS + 1);
    await expect(
      t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toEqual({ state: "waiting", blocker: "active_media_upload" });
    await expect(
      t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toEqual({ state: "done" });
    await expect(t.run(async (ctx) => await ctx.storage.get(storageId))).resolves.toBeNull();
  });

  it("waits for an authorized vault action and rejects a new action after the gate", async () => {
    const t = makeConvexTest();
    const seed = await seedOrganization(t);
    const vaultId = await t.run(
      async (ctx) =>
        await ctx.db.insert("vaults", {
          state: "not_connected",
          organizationId: seed.organizationId,
          convexTeamId: "convex-team",
          cloudflareAccountId: "cloudflare-account",
          deletion: { state: "not_deleting" },
        }),
    );
    const leaseId = await t.mutation(internal.pendingUploads.acquireVaultActionLease, {
      vaultId,
      userId: seed.ownerUserId,
      operation: "commit_staged_files",
    });
    const accepted = await seed.owner.mutation(api.organizationDeletion.index.request, {
      organizationId: seed.organizationId,
      confirmationPhrase: buildOrganizationDeletionConfirmationPhrase("Samebase"),
    });
    if (accepted.state !== "accepted") {
      throw new Error("Organization deletion request was not accepted.");
    }

    await expect(
      t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toEqual({ state: "waiting", blocker: "active_vault_action" });
    await expect(
      t.mutation(internal.pendingUploads.acquireVaultActionLease, {
        vaultId,
        userId: seed.ownerUserId,
        operation: "create_draft_pull_request",
      }),
    ).rejects.toThrow("Vault action is not available.");

    await t.mutation(internal.pendingUploads.releaseVaultActionLease, { leaseId });
    await expect(
      t.mutation(internal.organizationDeletion.cleanup.inspectQuiescence, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toEqual({ state: "done" });
  });

  it("restarts a stale running execution with a new attempt fence", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const t = makeConvexTest();
    const seed = await seedOrganization(t);
    const accepted = await seed.owner.mutation(api.organizationDeletion.index.request, {
      organizationId: seed.organizationId,
      confirmationPhrase: buildOrganizationDeletionConfirmationPhrase("Samebase"),
    });
    if (accepted.state !== "accepted") {
      throw new Error("Organization deletion request was not accepted.");
    }
    vi.setSystemTime(now + ORGANIZATION_DELETION_STALE_EXECUTION_MS + 1);
    await expect(
      t.mutation(internal.organizationDeletion.executor.restartStaleExecution, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toBe(true);
    await expect(
      t.run(async (ctx) => await ctx.db.get(accepted.status.runId)),
    ).resolves.toMatchObject({
      state: "running",
      executionAttempt: 2,
      automaticRestartCount: 1,
    });
    await expect(
      t.mutation(internal.organizationDeletion.executor.restartStaleExecution, {
        runId: accepted.status.runId,
        executionAttempt: 1,
      }),
    ).resolves.toBe(false);

    vi.setSystemTime(now + ORGANIZATION_DELETION_STALE_EXECUTION_MS * 2 + 2);
    await expect(
      t.mutation(internal.organizationDeletion.executor.restartStaleExecution, {
        runId: accepted.status.runId,
        executionAttempt: 2,
      }),
    ).resolves.toBe(false);
    await expect(
      t.run(async (ctx) => ({
        organization: await ctx.db.get(seed.organizationId),
        run: await ctx.db.get(accepted.status.runId),
      })),
    ).resolves.toMatchObject({
      organization: {
        deletion: { state: "delete_failed", runId: accepted.status.runId },
      },
      run: {
        state: "needs_attention",
        latestSafeError: "Organization deletion stopped repeatedly and needs staff attention.",
      },
    });
  });

  it("keeps failed cleanup visible and lets staff retry the same run", async () => {
    vi.useFakeTimers();
    const t = makeConvexTest();
    const seed = await seedOrganization(t);
    const adminUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
        email: "nicu@samebase.com",
        isApproved: true,
      });
    });
    const admin = t.withIdentity({
      subject: `${adminUserId}|admin-session`,
      tokenIdentifier: `test:${adminUserId}`,
    });
    const accepted = await seed.owner.mutation(api.organizationDeletion.index.request, {
      organizationId: seed.organizationId,
      confirmationPhrase: buildOrganizationDeletionConfirmationPhrase("Samebase"),
    });
    if (accepted.state !== "accepted") {
      throw new Error("Organization deletion request was not accepted.");
    }
    await t.run(async (ctx) => {
      await ctx.db.patch(accepted.status.runId, { providerWriteScanCursor: "next-vault-page" });
    });

    await expect(
      t.mutation(internal.organizationDeletion.executor.markNeedsAttention, {
        runId: accepted.status.runId,
        executionAttempt: 1,
        safeError: "Polar billing cleanup needs staff attention.",
      }),
    ).resolves.toBe(true);
    await expect(
      seed.owner.query(api.organizationDeletion.index.settings, {
        organizationId: seed.organizationId,
      }),
    ).resolves.toMatchObject({
      deletion: {
        state: "needs_attention",
        latestSafeError: "Polar billing cleanup needs staff attention.",
      },
    });
    await expect(
      admin.query(api.organizationDeletion.index.listForAdmin, {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).resolves.toMatchObject({
      page: [
        {
          runId: accepted.status.runId,
          state: "needs_attention",
          githubOwnerLogin: "Samebase",
        },
      ],
    });

    await expect(
      admin.mutation(api.organizationDeletion.index.retryForAdmin, {
        runId: accepted.status.runId,
      }),
    ).resolves.toMatchObject({ state: "running", runId: accepted.status.runId });
    const retained = await t.run(async (ctx) => ({
      billing: await ctx.db.query("organizationBillingAccounts").collect(),
      memberships: await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_role", (query) =>
          query.eq("organizationId", seed.organizationId),
        )
        .collect(),
      organization: await ctx.db.get(seed.organizationId),
      run: await ctx.db.get(accepted.status.runId),
    }));
    expect(retained.billing).toHaveLength(1);
    expect(retained.memberships).toHaveLength(1);
    expect(retained.organization?.deletion?.state).toBe("deleting");
    expect(retained.run).toMatchObject({
      state: "running",
      retryCount: 1,
      executionAttempt: 2,
      providerWriteScanCursor: "next-vault-page",
    });
  });
});
