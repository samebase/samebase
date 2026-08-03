import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

type MigrationInput = {
  operatorUserIdA: Id<"users">;
  operatorUserIdB: Id<"users">;
  billingSourceUserId: Id<"users">;
  retainedVaultIds: Array<Id<"vaults">>;
};

async function runPreparation(t: ConvexTest, input: MigrationInput) {
  return await t.mutation(internal.organizationMigrations.prepareOrganizationOwnership, input);
}

async function runVerification(t: ConvexTest, input: MigrationInput) {
  return await t.query(internal.organizationMigrations.verifyOrganizationOwnership, input);
}

async function seedPlainOperators(t: ConvexTest) {
  return await t.run(async (ctx) => {
    const operatorUserIdA = await ctx.db.insert("users", {
      email: "plain-operator-a@example.test",
    });
    const operatorUserIdB = await ctx.db.insert("users", {
      email: "plain-operator-b@example.test",
    });
    return { operatorUserIdA, operatorUserIdB };
  });
}

async function seedConnectedVault(
  t: ConvexTest,
  args: {
    userId: Id<"users">;
    owner: string;
    name: string;
    ghRepoId: string;
  },
) {
  return await t.run(async (ctx) => {
    const vaultId = await ctx.db.insert("vaults", {
      state: "not_connected",
      userId: args.userId,
      deletion: { state: "not_deleting" },
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId: args.userId,
      vaultId,
      repositoryFullName: `${args.owner}/${args.name}`,
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 2,
    });
    await ctx.db.replace(vaultId, {
      state: "connected",
      githubMode: "connect_existing_repository",
      userId: args.userId,
      deletion: { state: "not_deleting" },
      runId,
      ghRepoId: args.ghRepoId,
      defaultBranch: "main",
      connectedAt: 2,
      owner: args.owner,
      name: args.name,
      visibility: "private",
    });
    return { runId, vaultId };
  });
}

describe("organization ownership migration", () => {
  it("merges the operator accounts, copies the selected billing source, and keeps organization billing authoritative on rerun", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const operatorUserIdA = await ctx.db.insert("users", {
        email: "operator-a@example.test",
      });
      const operatorUserIdB = await ctx.db.insert("users", {
        email: "operator-b@example.test",
        billingProvider: "polar",
        billingPlan: "pro",
        billingStatus: "active",
        billingUpdatedAt: 10,
        billingCurrentPeriodEndAt: 20,
        billingCancelAtPeriodEnd: false,
        billingPolarExternalCustomerId: "customer-selected",
        billingPolarStateChangedAt: 30,
        billingPolarObservationRevision: 4,
        billingPolarAppliedObservationRevision: 3,
        billingPolarCheckoutAttempt: {
          state: "open",
          attemptId: "attempt-selected",
          checkoutId: "checkout-selected",
        },
      });
      const otherUserId = await ctx.db.insert("users", {
        email: "other@example.test",
      });
      return { operatorUserIdA, operatorUserIdB, otherUserId };
    });
    const input = {
      operatorUserIdA: ids.operatorUserIdA,
      operatorUserIdB: ids.operatorUserIdB,
      billingSourceUserId: ids.operatorUserIdB,
      retainedVaultIds: [],
    } satisfies MigrationInput;

    await runPreparation(t, input);

    const first = await t.run(async (ctx) => {
      const memberships = await ctx.db.query("organizationMemberships").take(4);
      const operatorMembershipA = memberships.find(
        (membership) => membership.userId === ids.operatorUserIdA,
      );
      const operatorMembershipB = memberships.find(
        (membership) => membership.userId === ids.operatorUserIdB,
      );
      const otherMembership = memberships.find(
        (membership) => membership.userId === ids.otherUserId,
      );
      if (
        operatorMembershipA === undefined ||
        operatorMembershipB === undefined ||
        otherMembership === undefined
      ) {
        throw new Error("Expected one membership for each migration user.");
      }
      return {
        organizations: await ctx.db.query("organizations").take(3),
        memberships,
        operatorMembershipA,
        operatorMembershipB,
        otherMembership,
        operatorBilling: await ctx.db
          .query("organizationBillingAccounts")
          .withIndex("by_organization", (query) =>
            query.eq("organizationId", operatorMembershipA.organizationId),
          )
          .unique(),
        otherBilling: await ctx.db
          .query("organizationBillingAccounts")
          .withIndex("by_organization", (query) =>
            query.eq("organizationId", otherMembership.organizationId),
          )
          .unique(),
      };
    });

    expect(first.organizations).toHaveLength(2);
    expect(first.memberships).toHaveLength(3);
    expect(first.operatorMembershipA.organizationId).toBe(first.operatorMembershipB.organizationId);
    expect(first.otherMembership.organizationId).not.toBe(first.operatorMembershipA.organizationId);
    expect(first.operatorBilling).toMatchObject({
      organizationId: first.operatorMembershipA.organizationId,
      provider: "polar",
      plan: "pro",
      status: "active",
      updatedAt: 10,
      currentPeriodEndAt: 20,
      cancelAtPeriodEnd: false,
      polarExternalCustomerId: "customer-selected",
      polarStateChangedAt: 30,
      polarObservationRevision: 4,
      polarAppliedObservationRevision: 3,
      polarCheckoutAttempt: {
        state: "open",
        attemptId: "attempt-selected",
        checkoutId: "checkout-selected",
      },
    });
    expect(first.otherBilling).toMatchObject({ plan: "free", status: "inactive" });

    if (first.operatorBilling === null) {
      throw new Error("Expected operator organization billing.");
    }
    const operatorBillingId = first.operatorBilling._id;
    await t.run(async (ctx) => {
      await ctx.db.patch(operatorBillingId, {
        plan: "free",
        status: "inactive",
        polarExternalCustomerId: "customer-authoritative",
      });
      await ctx.db.patch(ids.operatorUserIdB, {
        billingPlan: "pro",
        billingStatus: "active",
        billingPolarExternalCustomerId: "customer-stale",
      });
      await ctx.db.patch(ids.operatorUserIdA, {
        billingPlan: "pro",
        billingStatus: "past_due",
        billingPolarExternalCustomerId: "customer-stale-other-operator",
      });
    });

    await runPreparation(t, input);

    const rerun = await t.run(async (ctx) => ({
      organizations: await ctx.db.query("organizations").take(3),
      memberships: await ctx.db.query("organizationMemberships").take(4),
      billingAccounts: await ctx.db.query("organizationBillingAccounts").take(3),
      operatorBilling: await ctx.db.get(operatorBillingId),
    }));
    expect(rerun.organizations).toHaveLength(2);
    expect(rerun.memberships).toHaveLength(3);
    expect(rerun.billingAccounts).toHaveLength(2);
    expect(rerun.operatorBilling).toMatchObject({
      plan: "free",
      status: "inactive",
      polarExternalCustomerId: "customer-authoritative",
    });

    await expect(runVerification(t, input)).resolves.toMatchObject({
      status: "ready",
      counts: {
        users: 3,
        organizations: 2,
        memberships: 3,
        billingAccounts: 2,
        membershipIssues: 0,
        billingIssues: 0,
      },
    });
  });

  it("uses the explicit billing source while it completes a partial operator merge", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const operatorUserIdA = await ctx.db.insert("users", {
        email: "partial-operator-a@example.test",
      });
      const operatorUserIdB = await ctx.db.insert("users", {
        email: "partial-operator-b@example.test",
        billingProvider: "polar",
        billingPlan: "pro",
        billingStatus: "active",
        billingUpdatedAt: 10,
        billingPolarExternalCustomerId: "customer-partial-source",
      });
      const organizationId = await ctx.db.insert("organizations", {});
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: operatorUserIdA,
      });
      const billingAccountId = await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
      });
      return { operatorUserIdA, operatorUserIdB, organizationId, billingAccountId };
    });
    const input = {
      operatorUserIdA: ids.operatorUserIdA,
      operatorUserIdB: ids.operatorUserIdB,
      billingSourceUserId: ids.operatorUserIdB,
      retainedVaultIds: [],
    } satisfies MigrationInput;

    await runPreparation(t, input);

    const migrated = await t.run(async (ctx) => ({
      organizations: await ctx.db.query("organizations").take(2),
      memberships: await ctx.db.query("organizationMemberships").take(3),
      billingAccounts: await ctx.db.query("organizationBillingAccounts").take(2),
      billingAccount: await ctx.db.get(ids.billingAccountId),
    }));
    expect(migrated.organizations).toHaveLength(1);
    expect(migrated.memberships).toHaveLength(2);
    expect(migrated.memberships.every((row) => row.organizationId === ids.organizationId)).toBe(
      true,
    );
    expect(migrated.billingAccounts).toHaveLength(1);
    expect(migrated.billingAccount).toMatchObject({
      organizationId: ids.organizationId,
      provider: "polar",
      plan: "pro",
      status: "active",
      updatedAt: 10,
      polarExternalCustomerId: "customer-partial-source",
    });
    await expect(runVerification(t, input)).resolves.toMatchObject({ status: "ready" });
  });

  it("accepts one duplicated live subscription identity and rejects other operator billing conflicts", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const operatorUserIdA = await ctx.db.insert("users", {
        email: "billing-operator-a@example.test",
        billingProvider: "polar",
        billingPlan: "pro",
        billingStatus: "active",
        billingPolarExternalCustomerId: "customer-shared",
      });
      const operatorUserIdB = await ctx.db.insert("users", {
        email: "billing-operator-b@example.test",
        billingProvider: "polar",
        billingPlan: "pro",
        billingStatus: "active",
        billingPolarExternalCustomerId: "customer-other",
      });
      return { operatorUserIdA, operatorUserIdB };
    });
    const input = {
      ...ids,
      billingSourceUserId: ids.operatorUserIdA,
      retainedVaultIds: [],
    } satisfies MigrationInput;

    await expect(runPreparation(t, input)).rejects.toThrow(
      "The non-billing operator has a different Polar customer.",
    );

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.operatorUserIdB, {
        billingPolarExternalCustomerId: undefined,
      });
    });
    await expect(runPreparation(t, input)).rejects.toThrow(
      "The non-billing operator has a live Pro entitlement.",
    );

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.operatorUserIdB, {
        billingPolarExternalCustomerId: "customer-shared",
      });
    });
    await expect(runPreparation(t, input)).resolves.toBeNull();
    await expect(runVerification(t, input)).resolves.toMatchObject({ status: "ready" });
  });

  it("rejects a missing billing row whose legacy customer collides with authoritative organization billing", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const operatorUserIdA = await ctx.db.insert("users", {
        email: "collision-operator-a@example.test",
        billingPolarExternalCustomerId: "customer-authoritative",
      });
      const operatorUserIdB = await ctx.db.insert("users", {
        email: "collision-operator-b@example.test",
      });
      const memberUserId = await ctx.db.insert("users", {
        email: "existing-member@example.test",
      });
      const organizationId = await ctx.db.insert("organizations", {});
      await ctx.db.insert("organizationMemberships", { organizationId, userId: memberUserId });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "pro",
        status: "active",
        polarExternalCustomerId: "customer-authoritative",
      });
      return { operatorUserIdA, operatorUserIdB };
    });
    const input = {
      ...ids,
      billingSourceUserId: ids.operatorUserIdA,
      retainedVaultIds: [],
    } satisfies MigrationInput;

    await expect(runPreparation(t, input)).rejects.toThrow(
      "Organization migration found an unlisted billing collision.",
    );
  });

  it("backfills vault, attachment, grant, and actor ownership in dependency order", async () => {
    const t = makeConvexTest();
    const operators = await seedPlainOperators(t);
    const ids = await t.run(async (ctx) => {
      const resourceUserId = await ctx.db.insert("users", {
        email: "resource-owner@example.test",
      });
      const vaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        userId: resourceUserId,
        deletion: { state: "not_deleting" },
      });
      const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        userId: resourceUserId,
        accountId: "cloudflare-account",
        workerName: "resource-worker",
        workerTag: "resource-worker-tag",
        origin: "selected_existing",
      });
      const projectId = await ctx.db.insert("vaultConvexProjects", {
        vaultId,
        userId: resourceUserId,
        teamId: "convex-team",
        projectId: "convex-project",
        convexConfigPath: "convex.json",
        origin: "selected_existing",
      });
      const grantId = await ctx.db.insert("mcpGrants", {
        grantId: "grant-resource-owner",
        userId: resourceUserId,
        clientId: "client-resource-owner",
        resource: "https://samebase.test/mcp",
        scope: "access_dashboard",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const provisioningRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: resourceUserId,
        vaultId,
        repositoryFullName: "resource-owner/repository",
        trigger: "create",
        state: "failed",
        currentStep: "finish",
        lastError: "Fixture failure.",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 2,
      });
      const deletionRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "queued",
        userId: resourceUserId,
        vaultId,
        repositoryFullName: "resource-owner/repository",
        createdAt: 3,
        updatedAt: 3,
        attempt: { kind: "initial" },
        workflow: { state: "not_started" },
        currentStep: "initialize_deletion",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "existing_repository",
              ghRepoId: "resource-repository",
              owner: "resource-owner",
              name: "repository",
              repositoryFullName: "resource-owner/repository",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      });
      const stagedUpdateId = await ctx.db.insert("vaultStagedFileUpdates", {
        vaultId,
        branch: "main",
        filePath: "README.md",
        version: 1,
        clientId: "resource-client",
        changes: "[]",
        userId: resourceUserId,
        timestamp: 4,
      });
      return {
        resourceUserId,
        vaultId,
        workerId,
        projectId,
        grantId,
        provisioningRunId,
        deletionRunId,
        stagedUpdateId,
      };
    });
    const input = {
      ...operators,
      billingSourceUserId: operators.operatorUserIdA,
      retainedVaultIds: [],
    } satisfies MigrationInput;

    await runPreparation(t, input);

    const migrated = await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_user", (query) => query.eq("userId", ids.resourceUserId))
        .unique();
      return {
        membership,
        vault: await ctx.db.get(ids.vaultId),
        worker: await ctx.db.get(ids.workerId),
        project: await ctx.db.get(ids.projectId),
        grant: await ctx.db.get(ids.grantId),
        provisioningRun: await ctx.db.get(ids.provisioningRunId),
        deletionRun: await ctx.db.get(ids.deletionRunId),
        stagedUpdate: await ctx.db.get(ids.stagedUpdateId),
      };
    });
    if (migrated.membership === null) {
      throw new Error("Expected the resource owner membership.");
    }
    expect(migrated.vault).toMatchObject({
      organizationId: migrated.membership.organizationId,
    });
    expect(migrated.worker).toMatchObject({
      organizationId: migrated.membership.organizationId,
    });
    expect(migrated.project).toMatchObject({
      organizationId: migrated.membership.organizationId,
    });
    expect(migrated.grant).toMatchObject({
      organizationId: migrated.membership.organizationId,
    });
    expect(migrated.provisioningRun).toMatchObject({
      requestedByUserId: ids.resourceUserId,
    });
    expect(migrated.deletionRun).toMatchObject({ requestedByUserId: ids.resourceUserId });
    expect(migrated.stagedUpdate).toMatchObject({ editUserId: ids.resourceUserId });

    await expect(runVerification(t, input)).resolves.toEqual({
      status: "ready",
      counts: {
        users: 3,
        organizations: 2,
        memberships: 3,
        billingAccounts: 2,
        vaults: 1,
        attachments: 2,
        grants: 1,
        actorRows: 3,
        events: 0,
        membershipIssues: 0,
        billingIssues: 0,
        vaultOrganizationIssues: 0,
        attachmentOrganizationIssues: 0,
        grantMembershipIssues: 0,
        actorFieldIssues: 0,
        actorReferenceIssues: 0,
        eventReferenceIssues: 0,
        repositoryCollisionGroups: 0,
      },
    });
  });

  it("cleans orphaned vault deletion history in dependency order and is idempotent", async () => {
    const t = makeConvexTest();
    const operators = await seedPlainOperators(t);
    const orphaned = await t.run(async (ctx) => {
      const orphanedVaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        userId: operators.operatorUserIdA,
        deletion: { state: "not_deleting" },
      });
      const orphanedRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "queued",
        userId: operators.operatorUserIdA,
        vaultId: orphanedVaultId,
        repositoryFullName: "orphaned/repository",
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
              owner: "orphaned",
              name: "repository",
              repositoryFullName: "orphaned/repository",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      });
      const orphanedEventId = await ctx.db.insert("workflow_vaultDeletion_events", {
        userId: operators.operatorUserIdA,
        vaultId: orphanedVaultId,
        repositoryFullName: "orphaned/repository",
        runId: orphanedRunId,
        step: "initialize_deletion",
        level: "info",
        message: "Fixture event.",
        createdAt: 1,
      });

      const missingRunVaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        userId: operators.operatorUserIdA,
        deletion: { state: "not_deleting" },
      });
      const missingRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "queued",
        userId: operators.operatorUserIdA,
        vaultId: missingRunVaultId,
        repositoryFullName: "missing-run/repository",
        createdAt: 2,
        updatedAt: 2,
        attempt: { kind: "initial" },
        workflow: { state: "not_started" },
        currentStep: "initialize_deletion",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "failed_repository_setup",
              githubMode: "connect_existing_repository",
              owner: "missing-run",
              name: "repository",
              repositoryFullName: "missing-run/repository",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      });
      const missingRunEventId = await ctx.db.insert("workflow_vaultDeletion_events", {
        userId: operators.operatorUserIdA,
        vaultId: missingRunVaultId,
        repositoryFullName: "missing-run/repository",
        runId: missingRunId,
        step: "initialize_deletion",
        level: "info",
        message: "Fixture event.",
        createdAt: 2,
      });
      await ctx.db.delete(missingRunId);
      await ctx.db.delete(orphanedVaultId);
      await ctx.db.delete(missingRunVaultId);

      return { missingRunEventId, orphanedEventId, orphanedRunId };
    });
    const input = {
      ...operators,
      billingSourceUserId: operators.operatorUserIdA,
      retainedVaultIds: [],
    } satisfies MigrationInput;

    await expect(runPreparation(t, input)).resolves.toBeNull();
    await expect(runPreparation(t, input)).resolves.toBeNull();
    await expect(runVerification(t, input)).resolves.toMatchObject({
      status: "ready",
      counts: { actorRows: 0, events: 0, actorReferenceIssues: 0, eventReferenceIssues: 0 },
    });
    await expect(
      t.run(async (ctx) => ({
        missingRunEvent: await ctx.db.get(orphaned.missingRunEventId),
        orphanedEvent: await ctx.db.get(orphaned.orphanedEventId),
        orphanedRun: await ctx.db.get(orphaned.orphanedRunId),
      })),
    ).resolves.toEqual({ missingRunEvent: null, orphanedEvent: null, orphanedRun: null });
  });

  it("preserves vault deletion history while its parent vault exists", async () => {
    const t = makeConvexTest();
    const operators = await seedPlainOperators(t);
    const retained = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        userId: operators.operatorUserIdA,
        deletion: { state: "not_deleting" },
      });
      const runId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "queued",
        userId: operators.operatorUserIdA,
        vaultId,
        repositoryFullName: "retained/repository",
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
              owner: "retained",
              name: "repository",
              repositoryFullName: "retained/repository",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      });
      const eventId = await ctx.db.insert("workflow_vaultDeletion_events", {
        userId: operators.operatorUserIdA,
        vaultId,
        repositoryFullName: "retained/repository",
        runId,
        step: "initialize_deletion",
        level: "info",
        message: "Fixture event.",
        createdAt: 1,
      });
      return { eventId, runId, vaultId };
    });
    const input = {
      ...operators,
      billingSourceUserId: operators.operatorUserIdA,
      retainedVaultIds: [],
    } satisfies MigrationInput;

    await expect(runPreparation(t, input)).resolves.toBeNull();
    await expect(runVerification(t, input)).resolves.toMatchObject({
      status: "ready",
      counts: { actorRows: 1, events: 1, actorReferenceIssues: 0, eventReferenceIssues: 0 },
    });
    await expect(
      t.run(async (ctx) => ({
        event: await ctx.db.get(retained.eventId),
        run: await ctx.db.get(retained.runId),
        vault: await ctx.db.get(retained.vaultId),
      })),
    ).resolves.toMatchObject({
      event: { runId: retained.runId, vaultId: retained.vaultId },
      run: { requestedByUserId: operators.operatorUserIdA, vaultId: retained.vaultId },
      vault: { organizationId: expect.any(String) },
    });
  });

  it("reports missing workflow runs, vaults, and actor users as reference issues", async () => {
    const t = makeConvexTest();
    const operators = await seedPlainOperators(t);
    const vaultId = await t.run(
      async (ctx) =>
        await ctx.db.insert("vaults", {
          state: "not_connected",
          userId: operators.operatorUserIdA,
          deletion: { state: "not_deleting" },
        }),
    );
    const input = {
      ...operators,
      billingSourceUserId: operators.operatorUserIdA,
      retainedVaultIds: [],
    } satisfies MigrationInput;
    await runPreparation(t, input);

    await t.run(async (ctx) => {
      const missingRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: operators.operatorUserIdA,
        requestedByUserId: operators.operatorUserIdA,
        vaultId,
        repositoryFullName: "reference/repository",
        trigger: "create",
        state: "failed",
        currentStep: "finish",
        lastError: "Fixture failure.",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 2,
      });
      await ctx.db.insert("workflow_vaultProvisioning_events", {
        userId: operators.operatorUserIdA,
        vaultId,
        repositoryFullName: "reference/repository",
        runId: missingRunId,
        step: "finish",
        level: "error",
        message: "Fixture event.",
        createdAt: 2,
      });
      const missingDeletionRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "queued",
        userId: operators.operatorUserIdA,
        requestedByUserId: operators.operatorUserIdA,
        vaultId,
        repositoryFullName: "reference/deletion-repository",
        createdAt: 2,
        updatedAt: 2,
        attempt: { kind: "initial" },
        workflow: { state: "not_started" },
        currentStep: "initialize_deletion",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "failed_repository_setup",
              githubMode: "connect_existing_repository",
              owner: "reference",
              name: "deletion-repository",
              repositoryFullName: "reference/deletion-repository",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      });
      await ctx.db.insert("workflow_vaultDeletion_events", {
        userId: operators.operatorUserIdA,
        vaultId,
        repositoryFullName: "reference/deletion-repository",
        runId: missingDeletionRunId,
        step: "initialize_deletion",
        level: "info",
        message: "Fixture event.",
        createdAt: 2,
      });
      await ctx.db.delete(missingRunId);
      await ctx.db.delete(missingDeletionRunId);
    });

    await expect(runPreparation(t, input)).rejects.toThrow(
      "Organization migration found an invalid provisioning event reference.",
    );

    await t.run(async (ctx) => {
      const missingActorUserId = await ctx.db.insert("users", {
        email: "missing-actor@example.test",
      });
      const deletionRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "queued",
        userId: missingActorUserId,
        requestedByUserId: missingActorUserId,
        vaultId,
        repositoryFullName: "reference/repository",
        createdAt: 3,
        updatedAt: 3,
        attempt: { kind: "initial" },
        workflow: { state: "not_started" },
        currentStep: "initialize_deletion",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "existing_repository",
              ghRepoId: "reference-repository",
              owner: "reference",
              name: "repository",
              repositoryFullName: "reference/repository",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      });
      await ctx.db.insert("workflow_vaultDeletion_events", {
        userId: missingActorUserId,
        vaultId,
        repositoryFullName: "reference/repository",
        runId: deletionRunId,
        step: "initialize_deletion",
        level: "info",
        message: "Fixture event.",
        createdAt: 3,
      });
      const missingVaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        userId: operators.operatorUserIdA,
        deletion: { state: "not_deleting" },
      });
      await ctx.db.insert("vaultStagedFileUpdates", {
        vaultId: missingVaultId,
        branch: "main",
        filePath: "README.md",
        version: 1,
        clientId: "missing-reference-client",
        changes: "[]",
        userId: operators.operatorUserIdA,
        editUserId: operators.operatorUserIdA,
        timestamp: 4,
      });
      await ctx.db.delete(missingVaultId);
      await ctx.db.delete(missingActorUserId);
    });

    await expect(runVerification(t, input)).resolves.toMatchObject({
      status: "not_ready",
      counts: {
        actorReferenceIssues: 2,
        eventReferenceIssues: 3,
        events: 3,
      },
    });
  });

  it("rejects missing attachment parents and attachment owner mismatches before writes", async () => {
    const t = makeConvexTest();
    const operators = await seedPlainOperators(t);
    const orphanWorkerId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        userId: operators.operatorUserIdA,
        deletion: { state: "not_deleting" },
      });
      const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        userId: operators.operatorUserIdA,
        accountId: "orphan-account",
        workerName: "orphan-worker",
        workerTag: "orphan-tag",
        origin: "selected_existing",
      });
      await ctx.db.delete(vaultId);
      return workerId;
    });
    const input = {
      ...operators,
      billingSourceUserId: operators.operatorUserIdA,
      retainedVaultIds: [],
    } satisfies MigrationInput;

    await expect(runPreparation(t, input)).rejects.toThrow(
      "Organization migration found an attachment with a missing parent.",
    );
    await expect(
      t.run(async (ctx) => await ctx.db.query("organizations").take(1)),
    ).resolves.toHaveLength(0);

    await t.run(async (ctx) => {
      await ctx.db.delete(orphanWorkerId);
      const vaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        userId: operators.operatorUserIdA,
        deletion: { state: "not_deleting" },
      });
      await ctx.db.insert("vaultConvexProjects", {
        vaultId,
        userId: operators.operatorUserIdB,
        teamId: "mismatch-team",
        projectId: "mismatch-project",
        convexConfigPath: "convex.json",
        origin: "selected_existing",
      });
    });

    await expect(runPreparation(t, input)).rejects.toThrow(
      "Organization migration found an attachment with a different legacy owner.",
    );
    await expect(
      t.run(async (ctx) => await ctx.db.query("organizations").take(1)),
    ).resolves.toHaveLength(0);
  });

  it("requires explicit local cleanup for repository collisions, then succeeds after complete local cleanup", async () => {
    const t = makeConvexTest();
    const operators = await seedPlainOperators(t);
    const retained = await seedConnectedVault(t, {
      userId: operators.operatorUserIdA,
      owner: "Shared-Owner",
      name: "Shared-Repository",
      ghRepoId: "repository-retained",
    });
    const removed = await seedConnectedVault(t, {
      userId: operators.operatorUserIdB,
      owner: "shared-owner",
      name: "shared-repository",
      ghRepoId: "repository-removed",
    });
    const unlistedInput = {
      ...operators,
      billingSourceUserId: operators.operatorUserIdA,
      retainedVaultIds: [],
    } satisfies MigrationInput;

    await expect(runPreparation(t, unlistedInput)).rejects.toThrow(
      "Organization migration found an unlisted repository collision.",
    );
    const selectedInput = {
      ...unlistedInput,
      retainedVaultIds: [retained.vaultId],
    } satisfies MigrationInput;
    await expect(runPreparation(t, selectedInput)).rejects.toThrow(
      "Repository collision requires local cleanup before organization migration.",
    );

    await t.run(async (ctx) => {
      // This simulates operator cleanup of all local rows for the losing vault.
      // It does not call GitHub, Convex, Cloudflare, or other provider APIs.
      await ctx.db.delete(removed.runId);
      await ctx.db.delete(removed.vaultId);
    });

    await expect(runPreparation(t, selectedInput)).resolves.toBeNull();
    await expect(runVerification(t, selectedInput)).resolves.toMatchObject({
      status: "ready",
      counts: { repositoryCollisionGroups: 0, vaults: 1, actorRows: 1 },
    });
  });

  it("fails closed when a bounded source exceeds the measured deployment cap", async () => {
    const t = makeConvexTest();
    const userIds = await t.run(async (ctx) => {
      const ids: Array<Id<"users">> = [];
      for (let index = 0; index < 501; index += 1) {
        ids.push(
          await ctx.db.insert("users", {
            email: `bounded-user-${index}@example.test`,
          }),
        );
      }
      return ids;
    });
    const operatorUserIdA = userIds[0];
    const operatorUserIdB = userIds[1];
    const input = {
      operatorUserIdA,
      operatorUserIdB,
      billingSourceUserId: operatorUserIdA,
      retainedVaultIds: [],
    } satisfies MigrationInput;

    await expect(runPreparation(t, input)).rejects.toThrow(
      "Organization migration source users exceeds 500 rows.",
    );
  });
});
