import { v, type Infer } from "convex/values";

import type { Doc, Id, TableNames } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type DatabaseReader,
  type DatabaseWriter,
} from "./_generated/server";

const { array, id, literal, null: nullValue, number, object, union } = v;

const MIGRATION_ROW_CAP = 500;

const organizationMigrationInput = object({
  operatorUserIdA: id("users"),
  operatorUserIdB: id("users"),
  billingSourceUserId: id("users"),
  retainedVaultIds: array(id("vaults")),
});
type OrganizationMigrationInput = Infer<typeof organizationMigrationInput>;

const organizationMigrationVerification = object({
  status: union(literal("ready"), literal("not_ready")),
  counts: object({
    users: number(),
    organizations: number(),
    memberships: number(),
    billingAccounts: number(),
    vaults: number(),
    attachments: number(),
    grants: number(),
    actorRows: number(),
    events: number(),
    membershipIssues: number(),
    billingIssues: number(),
    vaultOrganizationIssues: number(),
    attachmentOrganizationIssues: number(),
    grantMembershipIssues: number(),
    actorFieldIssues: number(),
    actorReferenceIssues: number(),
    eventReferenceIssues: number(),
    repositoryCollisionGroups: number(),
  }),
});
type OrganizationMigrationVerification = Infer<typeof organizationMigrationVerification>;

async function readBoundedTable<TableName extends TableNames>(
  db: DatabaseReader,
  tableName: TableName,
): Promise<Array<Doc<TableName>>> {
  const rows = await db.query(tableName).take(MIGRATION_ROW_CAP + 1);
  if (rows.length > MIGRATION_ROW_CAP) {
    throw new Error(
      `Organization migration source ${tableName} exceeds ${MIGRATION_ROW_CAP} rows.`,
    );
  }

  return rows;
}

async function readOrganizationMigrationSnapshot(db: DatabaseReader) {
  const [
    users,
    organizations,
    memberships,
    billingAccounts,
    vaults,
    workers,
    projects,
    grants,
    provisioningRuns,
    provisioningEvents,
    deletionRuns,
    deletionEvents,
    stagedUpdates,
  ] = await Promise.all([
    readBoundedTable(db, "users"),
    readBoundedTable(db, "organizations"),
    readBoundedTable(db, "organizationMemberships"),
    readBoundedTable(db, "organizationBillingAccounts"),
    readBoundedTable(db, "vaults"),
    readBoundedTable(db, "vaultCloudflareWorkers"),
    readBoundedTable(db, "vaultConvexProjects"),
    readBoundedTable(db, "mcpGrants"),
    readBoundedTable(db, "workflow_vaultProvisioning_runs"),
    readBoundedTable(db, "workflow_vaultProvisioning_events"),
    readBoundedTable(db, "workflow_vaultDeletion_runs"),
    readBoundedTable(db, "workflow_vaultDeletion_events"),
    readBoundedTable(db, "vaultStagedFileUpdates"),
  ]);

  return {
    users,
    organizations,
    memberships,
    billingAccounts,
    vaults,
    workers,
    projects,
    grants,
    provisioningRuns,
    provisioningEvents,
    deletionRuns,
    deletionEvents,
    stagedUpdates,
  };
}

type OrganizationMigrationSnapshot = Awaited<ReturnType<typeof readOrganizationMigrationSnapshot>>;

async function cleanupOrphanedVaultDeletionHistory(
  db: DatabaseWriter,
  snapshot: OrganizationMigrationSnapshot,
): Promise<OrganizationMigrationSnapshot> {
  const vaultIds = new Set(snapshot.vaults.map((vault) => vault._id));
  const deletionRunsById = new Map(snapshot.deletionRuns.map((run) => [run._id, run]));
  const orphanedRunIds = new Set<Id<"workflow_vaultDeletion_runs">>();
  for (const run of snapshot.deletionRuns) {
    if (!vaultIds.has(run.vaultId)) {
      orphanedRunIds.add(run._id);
    }
  }

  const deletedEventIds = new Set<Id<"workflow_vaultDeletion_events">>();
  for (const event of snapshot.deletionEvents) {
    const run = deletionRunsById.get(event.runId);
    const isSafeMissingRunOrphan = run === undefined && !vaultIds.has(event.vaultId);
    if (!orphanedRunIds.has(event.runId) && !isSafeMissingRunOrphan) {
      continue;
    }
    await db.delete(event._id);
    deletedEventIds.add(event._id);
  }

  for (const runId of orphanedRunIds) {
    await db.delete(runId);
  }

  return {
    ...snapshot,
    deletionRuns: snapshot.deletionRuns.filter((run) => !orphanedRunIds.has(run._id)),
    deletionEvents: snapshot.deletionEvents.filter((event) => !deletedEventIds.has(event._id)),
  };
}

type CurrentGraph = {
  organizationIds: Set<Id<"organizations">>;
  organizationByUser: Map<Id<"users">, Id<"organizations">>;
  usersByOrganization: Map<Id<"organizations">, Set<Id<"users">>>;
  billingByOrganization: Map<Id<"organizations">, Doc<"organizationBillingAccounts">>;
};

function requireMigrationInputUsers(
  snapshot: OrganizationMigrationSnapshot,
  input: OrganizationMigrationInput,
) {
  if (input.operatorUserIdA === input.operatorUserIdB) {
    throw new Error("Organization migration requires two different operator users.");
  }
  if (
    input.billingSourceUserId !== input.operatorUserIdA &&
    input.billingSourceUserId !== input.operatorUserIdB
  ) {
    throw new Error("The billing source must be one of the two operator users.");
  }
  if (input.retainedVaultIds.length > MIGRATION_ROW_CAP) {
    throw new Error("The retained vault selection exceeds the migration row cap.");
  }

  const usersById = new Map<Id<"users">, Doc<"users">>();
  for (const user of snapshot.users) {
    usersById.set(user._id, user);
  }
  if (!usersById.has(input.operatorUserIdA) || !usersById.has(input.operatorUserIdB)) {
    throw new Error("Organization migration operator users must exist.");
  }

  return usersById;
}

function buildCurrentGraph(
  snapshot: OrganizationMigrationSnapshot,
  usersById: Map<Id<"users">, Doc<"users">>,
  input: OrganizationMigrationInput,
): CurrentGraph {
  const organizationIds = new Set<Id<"organizations">>();
  for (const organization of snapshot.organizations) {
    organizationIds.add(organization._id);
  }

  const organizationByUser = new Map<Id<"users">, Id<"organizations">>();
  const usersByOrganization = new Map<Id<"organizations">, Set<Id<"users">>>();
  for (const membership of snapshot.memberships) {
    if (!usersById.has(membership.userId) || !organizationIds.has(membership.organizationId)) {
      throw new Error("Organization migration found an invalid membership reference.");
    }
    if (organizationByUser.has(membership.userId)) {
      throw new Error("Organization migration found more than one membership for a user.");
    }
    organizationByUser.set(membership.userId, membership.organizationId);
    const members = usersByOrganization.get(membership.organizationId) ?? new Set<Id<"users">>();
    members.add(membership.userId);
    usersByOrganization.set(membership.organizationId, members);
  }

  for (const organizationId of organizationIds) {
    const members = usersByOrganization.get(organizationId);
    if (members === undefined) {
      throw new Error("Organization migration found an organization without a membership.");
    }
    if (
      members.size > 1 &&
      !(
        members.size === 2 &&
        members.has(input.operatorUserIdA) &&
        members.has(input.operatorUserIdB)
      )
    ) {
      throw new Error("Organization migration found an unlisted shared organization.");
    }
  }

  const operatorOrganizationA = organizationByUser.get(input.operatorUserIdA);
  const operatorOrganizationB = organizationByUser.get(input.operatorUserIdB);
  if (
    operatorOrganizationA !== undefined &&
    operatorOrganizationB !== undefined &&
    operatorOrganizationA !== operatorOrganizationB
  ) {
    throw new Error("The operator users already belong to different organizations.");
  }

  const billingByOrganization = new Map<Id<"organizations">, Doc<"organizationBillingAccounts">>();
  const organizationByPolarCustomer = new Map<string, Id<"organizations">>();
  for (const billingAccount of snapshot.billingAccounts) {
    if (!organizationIds.has(billingAccount.organizationId)) {
      throw new Error("Organization migration found billing for a missing organization.");
    }
    if (billingByOrganization.has(billingAccount.organizationId)) {
      throw new Error(
        "Organization migration found more than one billing row for an organization.",
      );
    }
    billingByOrganization.set(billingAccount.organizationId, billingAccount);
    const externalCustomerId = billingAccount.polarExternalCustomerId;
    if (externalCustomerId) {
      const existingOrganizationId = organizationByPolarCustomer.get(externalCustomerId);
      if (
        existingOrganizationId !== undefined &&
        existingOrganizationId !== billingAccount.organizationId
      ) {
        throw new Error("Organization migration found an unlisted billing collision.");
      }
      organizationByPolarCustomer.set(externalCustomerId, billingAccount.organizationId);
    }
  }

  return {
    organizationIds,
    organizationByUser,
    usersByOrganization,
    billingByOrganization,
  };
}

function hadAuthoritativeOperatorBilling(
  graph: CurrentGraph,
  input: OrganizationMigrationInput,
): boolean {
  const organizationA = graph.organizationByUser.get(input.operatorUserIdA);
  const organizationB = graph.organizationByUser.get(input.operatorUserIdB);
  return (
    organizationA !== undefined &&
    organizationA === organizationB &&
    graph.billingByOrganization.has(organizationA)
  );
}

function targetUserGroup(input: OrganizationMigrationInput, userId: Id<"users">): string {
  return userId === input.operatorUserIdA || userId === input.operatorUserIdB
    ? "operator"
    : `user:${userId}`;
}

function normalizeRepositoryCoordinate(value: string): string {
  return value.trim().toLowerCase();
}

function addRepositoryIdentity(
  vaultIdsByIdentity: Map<string, Set<Id<"vaults">>>,
  identity: string,
  vaultId: Id<"vaults">,
): void {
  const vaultIds = vaultIdsByIdentity.get(identity) ?? new Set<Id<"vaults">>();
  vaultIds.add(vaultId);
  vaultIdsByIdentity.set(identity, vaultIds);
}

function assertRepositorySelectionsAreReady(
  snapshot: OrganizationMigrationSnapshot,
  usersById: Map<Id<"users">, Doc<"users">>,
  input: OrganizationMigrationInput,
): void {
  const vaultsById = new Map<Id<"vaults">, Doc<"vaults">>();
  const vaultIdsByIdentity = new Map<string, Set<Id<"vaults">>>();
  for (const vault of snapshot.vaults) {
    if (!usersById.has(vault.userId)) {
      throw new Error("Organization migration found a vault with a missing owner.");
    }
    vaultsById.set(vault._id, vault);
    if (vault.state === "not_connected") {
      continue;
    }

    const group = targetUserGroup(input, vault.userId);
    const coordinate = `${normalizeRepositoryCoordinate(vault.owner)}/${normalizeRepositoryCoordinate(vault.name)}`;
    addRepositoryIdentity(vaultIdsByIdentity, `${group}:coordinate:${coordinate}`, vault._id);
    if (vault.state === "connected") {
      addRepositoryIdentity(vaultIdsByIdentity, `${group}:github:${vault.ghRepoId}`, vault._id);
    }
  }

  const retainedVaultIds = new Set(input.retainedVaultIds);
  if (retainedVaultIds.size !== input.retainedVaultIds.length) {
    throw new Error("Retained vault selections must be unique.");
  }
  for (const retainedVaultId of retainedVaultIds) {
    const retainedVault = vaultsById.get(retainedVaultId);
    if (retainedVault === undefined || retainedVault.state === "not_connected") {
      throw new Error("A retained vault selection is not a repository vault.");
    }
  }

  for (const vaultIds of vaultIdsByIdentity.values()) {
    if (vaultIds.size < 2) {
      continue;
    }
    let retainedCount = 0;
    for (const vaultId of vaultIds) {
      if (retainedVaultIds.has(vaultId)) {
        retainedCount += 1;
      }
    }
    if (retainedCount === 0) {
      throw new Error("Organization migration found an unlisted repository collision.");
    }
    if (retainedCount > 1) {
      throw new Error("A repository collision must have one retained vault selection.");
    }

    // The migration never hides or deletes a losing vault. The operator must
    // remove its complete local vault data, without deleting provider
    // infrastructure, before this non-destructive backfill can continue.
    throw new Error("Repository collision requires local cleanup before organization migration.");
  }
}

function assertLegacyBillingHasNoUnlistedCollision(
  snapshot: OrganizationMigrationSnapshot,
  usersById: Map<Id<"users">, Doc<"users">>,
  graph: CurrentGraph,
  input: OrganizationMigrationInput,
  operatorBillingWasAuthoritative: boolean,
): void {
  const billingSource = usersById.get(input.billingSourceUserId);
  if (billingSource === undefined) {
    throw new Error("Organization migration billing source user must exist.");
  }
  const otherOperator = usersById.get(
    input.billingSourceUserId === input.operatorUserIdA
      ? input.operatorUserIdB
      : input.operatorUserIdA,
  );
  if (otherOperator === undefined) {
    throw new Error("Organization migration operator user must exist.");
  }
  if (!operatorBillingWasAuthoritative) {
    const billingSourceCustomerId = billingSource.billingPolarExternalCustomerId;
    const otherOperatorCustomerId = otherOperator.billingPolarExternalCustomerId;
    const operatorsShareCustomer =
      billingSourceCustomerId !== undefined && billingSourceCustomerId === otherOperatorCustomerId;
    if (otherOperatorCustomerId !== undefined && !operatorsShareCustomer) {
      throw new Error("The non-billing operator has a different Polar customer.");
    }
    if (
      otherOperator.billingPlan === "pro" &&
      (otherOperator.billingStatus === "active" || otherOperator.billingStatus === "past_due") &&
      !operatorsShareCustomer
    ) {
      throw new Error("The non-billing operator has a live Pro entitlement.");
    }
  }

  const groupByCustomer = new Map<string, string>();
  const addCustomerGroup = (externalCustomerId: string, group: string) => {
    const existingGroup = groupByCustomer.get(externalCustomerId);
    if (existingGroup !== undefined && existingGroup !== group) {
      throw new Error("Organization migration found an unlisted billing collision.");
    }
    groupByCustomer.set(externalCustomerId, group);
  };
  const operatorOrganizationId =
    graph.organizationByUser.get(input.operatorUserIdA) ??
    graph.organizationByUser.get(input.operatorUserIdB);
  for (const account of graph.billingByOrganization.values()) {
    if (
      !operatorBillingWasAuthoritative &&
      operatorOrganizationId !== undefined &&
      account.organizationId === operatorOrganizationId
    ) {
      continue;
    }
    if (account.polarExternalCustomerId) {
      addCustomerGroup(account.polarExternalCustomerId, `organization:${account.organizationId}`);
    }
  }

  for (const user of snapshot.users) {
    const isOperator = user._id === input.operatorUserIdA || user._id === input.operatorUserIdB;
    if (isOperator) {
      if (operatorBillingWasAuthoritative || user._id !== input.billingSourceUserId) {
        continue;
      }
    }
    const currentOrganizationId = isOperator
      ? operatorOrganizationId
      : graph.organizationByUser.get(user._id);
    const currentBillingWillBeReplaced =
      isOperator && !operatorBillingWasAuthoritative && currentOrganizationId !== undefined;
    if (
      !currentBillingWillBeReplaced &&
      currentOrganizationId !== undefined &&
      graph.billingByOrganization.has(currentOrganizationId)
    ) {
      continue;
    }
    const externalCustomerId = user.billingPolarExternalCustomerId;
    if (!externalCustomerId) {
      continue;
    }
    addCustomerGroup(
      externalCustomerId,
      currentOrganizationId === undefined
        ? targetUserGroup(input, user._id)
        : `organization:${currentOrganizationId}`,
    );
  }
}

type WorkflowReference = {
  userId: Id<"users">;
  vaultId: Id<"vaults">;
  repositoryFullName: string;
};

function hasValidWorkflowEventReference(
  event: WorkflowReference,
  run: WorkflowReference | undefined,
  usersById: Map<Id<"users">, Doc<"users">>,
  vaultsById: Map<Id<"vaults">, Doc<"vaults">>,
): boolean {
  return (
    run !== undefined &&
    vaultsById.has(event.vaultId) &&
    usersById.has(event.userId) &&
    event.vaultId === run.vaultId &&
    event.userId === run.userId &&
    event.repositoryFullName === run.repositoryFullName
  );
}

function assertResourceParentsExist(
  snapshot: OrganizationMigrationSnapshot,
  usersById: Map<Id<"users">, Doc<"users">>,
): void {
  const vaultsById = new Map(snapshot.vaults.map((vault) => [vault._id, vault]));
  const provisioningRunsById = new Map(snapshot.provisioningRuns.map((run) => [run._id, run]));
  const deletionRunsById = new Map(snapshot.deletionRuns.map((run) => [run._id, run]));
  for (const attachment of [...snapshot.workers, ...snapshot.projects]) {
    const parentVault = vaultsById.get(attachment.vaultId);
    if (parentVault === undefined || !usersById.has(attachment.userId)) {
      throw new Error("Organization migration found an attachment with a missing parent.");
    }
    if (attachment.userId !== parentVault.userId) {
      throw new Error("Organization migration found an attachment with a different legacy owner.");
    }
  }
  for (const grant of snapshot.grants) {
    if (!usersById.has(grant.userId)) {
      throw new Error("Organization migration found a grant with a missing user.");
    }
  }
  for (const run of [...snapshot.provisioningRuns, ...snapshot.deletionRuns]) {
    if (!vaultsById.has(run.vaultId) || !usersById.has(run.userId)) {
      throw new Error("Organization migration found a workflow run with a missing parent.");
    }
  }
  for (const update of snapshot.stagedUpdates) {
    if (!vaultsById.has(update.vaultId) || !usersById.has(update.userId)) {
      throw new Error("Organization migration found a staged update with a missing parent.");
    }
  }
  for (const event of snapshot.provisioningEvents) {
    const run = provisioningRunsById.get(event.runId);
    if (!hasValidWorkflowEventReference(event, run, usersById, vaultsById)) {
      throw new Error("Organization migration found an invalid provisioning event reference.");
    }
  }
  for (const event of snapshot.deletionEvents) {
    const run = deletionRunsById.get(event.runId);
    if (!hasValidWorkflowEventReference(event, run, usersById, vaultsById)) {
      throw new Error("Organization migration found an invalid deletion event reference.");
    }
  }
}

async function insertMembership(
  db: DatabaseWriter,
  graph: CurrentGraph,
  userId: Id<"users">,
  organizationId: Id<"organizations">,
): Promise<void> {
  await db.insert("organizationMemberships", { organizationId, userId });
  graph.organizationByUser.set(userId, organizationId);
  const members = graph.usersByOrganization.get(organizationId) ?? new Set<Id<"users">>();
  members.add(userId);
  graph.usersByOrganization.set(organizationId, members);
}

async function prepareMembershipGraph(
  db: DatabaseWriter,
  snapshot: OrganizationMigrationSnapshot,
  graph: CurrentGraph,
  input: OrganizationMigrationInput,
): Promise<void> {
  const operatorOrganizationA = graph.organizationByUser.get(input.operatorUserIdA);
  const operatorOrganizationB = graph.organizationByUser.get(input.operatorUserIdB);
  let operatorOrganizationId = operatorOrganizationA ?? operatorOrganizationB;
  if (operatorOrganizationId === undefined) {
    operatorOrganizationId = await db.insert("organizations", {});
    graph.organizationIds.add(operatorOrganizationId);
    graph.usersByOrganization.set(operatorOrganizationId, new Set());
  }
  if (operatorOrganizationA === undefined) {
    await insertMembership(db, graph, input.operatorUserIdA, operatorOrganizationId);
  }
  if (operatorOrganizationB === undefined) {
    await insertMembership(db, graph, input.operatorUserIdB, operatorOrganizationId);
  }

  for (const user of snapshot.users) {
    if (graph.organizationByUser.has(user._id)) {
      continue;
    }
    const organizationId = await db.insert("organizations", {});
    graph.organizationIds.add(organizationId);
    graph.usersByOrganization.set(organizationId, new Set());
    await insertMembership(db, graph, user._id, organizationId);
  }
}

async function prepareOrganizationBilling(
  db: DatabaseWriter,
  graph: CurrentGraph,
  usersById: Map<Id<"users">, Doc<"users">>,
  input: OrganizationMigrationInput,
  operatorBillingWasAuthoritative: boolean,
): Promise<void> {
  for (const organizationId of graph.organizationIds) {
    const members = graph.usersByOrganization.get(organizationId);
    if (members === undefined || members.size === 0) {
      throw new Error("Organization migration found an organization without a billing source.");
    }

    let sourceUserId: Id<"users"> | undefined;
    if (members.has(input.operatorUserIdA) || members.has(input.operatorUserIdB)) {
      if (
        members.size !== 2 ||
        !members.has(input.operatorUserIdA) ||
        !members.has(input.operatorUserIdB)
      ) {
        throw new Error("The operator organization membership is incomplete.");
      }
      sourceUserId = input.billingSourceUserId;
    } else if (members.size === 1) {
      for (const memberUserId of members) {
        sourceUserId = memberUserId;
      }
    } else {
      throw new Error("Organization migration found an unlisted billing source collision.");
    }
    const sourceUser = sourceUserId === undefined ? undefined : usersById.get(sourceUserId);
    if (sourceUser === undefined) {
      throw new Error("Organization migration billing source user is missing.");
    }
    const billingState = {
      provider: sourceUser.billingProvider,
      plan: sourceUser.billingPlan ?? "free",
      status: sourceUser.billingStatus ?? "inactive",
      updatedAt: sourceUser.billingUpdatedAt,
      currentPeriodEndAt: sourceUser.billingCurrentPeriodEndAt,
      cancelAtPeriodEnd: sourceUser.billingCancelAtPeriodEnd,
      polarExternalCustomerId: sourceUser.billingPolarExternalCustomerId,
      polarStateChangedAt: sourceUser.billingPolarStateChangedAt,
      polarObservationRevision: sourceUser.billingPolarObservationRevision,
      polarAppliedObservationRevision: sourceUser.billingPolarAppliedObservationRevision,
      polarCheckoutAttempt: sourceUser.billingPolarCheckoutAttempt,
    };
    const existing = graph.billingByOrganization.get(organizationId);
    const isOperatorOrganization =
      members.has(input.operatorUserIdA) && members.has(input.operatorUserIdB);
    if (existing !== undefined) {
      if (!isOperatorOrganization || operatorBillingWasAuthoritative) {
        continue;
      }
      await db.patch(existing._id, billingState);
      continue;
    }
    await db.insert("organizationBillingAccounts", { organizationId, ...billingState });
  }
}

function requireOrganizationForUser(graph: CurrentGraph, userId: Id<"users">): Id<"organizations"> {
  const organizationId = graph.organizationByUser.get(userId);
  if (organizationId === undefined) {
    throw new Error("Organization migration requires one membership for the resource user.");
  }
  return organizationId;
}

function assertOptionalOrganizationMatches(
  currentOrganizationId: Id<"organizations"> | undefined,
  expectedOrganizationId: Id<"organizations">,
): void {
  if (currentOrganizationId !== undefined && currentOrganizationId !== expectedOrganizationId) {
    throw new Error("Organization migration found a conflicting resource organization.");
  }
}

async function prepareResourceOwnership(
  db: DatabaseWriter,
  snapshot: OrganizationMigrationSnapshot,
  graph: CurrentGraph,
): Promise<void> {
  const organizationByVault = new Map<Id<"vaults">, Id<"organizations">>();
  for (const vault of snapshot.vaults) {
    const organizationId = requireOrganizationForUser(graph, vault.userId);
    assertOptionalOrganizationMatches(vault.organizationId, organizationId);
    organizationByVault.set(vault._id, organizationId);
    if (vault.organizationId === undefined) {
      await db.patch(vault._id, { organizationId });
    }
  }

  for (const attachment of [...snapshot.workers, ...snapshot.projects]) {
    const organizationId = organizationByVault.get(attachment.vaultId);
    if (organizationId === undefined) {
      throw new Error("Organization migration found an attachment without a parent vault.");
    }
    assertOptionalOrganizationMatches(attachment.organizationId, organizationId);
    if (attachment.organizationId === undefined) {
      await db.patch(attachment._id, { organizationId });
    }
  }

  for (const grant of snapshot.grants) {
    const organizationId = requireOrganizationForUser(graph, grant.userId);
    assertOptionalOrganizationMatches(grant.organizationId, organizationId);
    if (grant.organizationId === undefined) {
      await db.patch(grant._id, { organizationId });
    }
  }

  for (const run of [...snapshot.provisioningRuns, ...snapshot.deletionRuns]) {
    if (run.requestedByUserId !== undefined && run.requestedByUserId !== run.userId) {
      throw new Error("Organization migration found a conflicting workflow requester.");
    }
    if (run.requestedByUserId === undefined) {
      await db.patch(run._id, { requestedByUserId: run.userId });
    }
  }
  for (const update of snapshot.stagedUpdates) {
    if (update.editUserId !== undefined && update.editUserId !== update.userId) {
      throw new Error("Organization migration found a conflicting staged-update editor.");
    }
    if (update.editUserId === undefined) {
      await db.patch(update._id, { editUserId: update.userId });
    }
  }
}

export const prepareOrganizationOwnership = internalMutation({
  args: organizationMigrationInput.fields,
  returns: nullValue(),
  handler: async (ctx, args) => {
    const currentSnapshot = await readOrganizationMigrationSnapshot(ctx.db);
    const usersById = requireMigrationInputUsers(currentSnapshot, args);
    const snapshot = await cleanupOrphanedVaultDeletionHistory(ctx.db, currentSnapshot);
    const graph = buildCurrentGraph(snapshot, usersById, args);
    const operatorBillingWasAuthoritative = hadAuthoritativeOperatorBilling(graph, args);

    assertRepositorySelectionsAreReady(snapshot, usersById, args);
    assertLegacyBillingHasNoUnlistedCollision(
      snapshot,
      usersById,
      graph,
      args,
      operatorBillingWasAuthoritative,
    );
    assertResourceParentsExist(snapshot, usersById);

    await prepareMembershipGraph(ctx.db, snapshot, graph, args);
    await prepareOrganizationBilling(
      ctx.db,
      graph,
      usersById,
      args,
      operatorBillingWasAuthoritative,
    );
    await prepareResourceOwnership(ctx.db, snapshot, graph);

    return null;
  },
});

function countRepositoryCollisionGroups(snapshot: OrganizationMigrationSnapshot): number {
  const vaultIdsByIdentity = new Map<string, Set<Id<"vaults">>>();
  for (const vault of snapshot.vaults) {
    if (vault.state === "not_connected" || vault.organizationId === undefined) {
      continue;
    }
    const coordinate = `${normalizeRepositoryCoordinate(vault.owner)}/${normalizeRepositoryCoordinate(vault.name)}`;
    addRepositoryIdentity(
      vaultIdsByIdentity,
      `${vault.organizationId}:coordinate:${coordinate}`,
      vault._id,
    );
    if (vault.state === "connected") {
      addRepositoryIdentity(
        vaultIdsByIdentity,
        `${vault.organizationId}:github:${vault.ghRepoId}`,
        vault._id,
      );
    }
  }

  let collisions = 0;
  for (const vaultIds of vaultIdsByIdentity.values()) {
    if (vaultIds.size > 1) {
      collisions += 1;
    }
  }
  return collisions;
}

function verifyOrganizationMigration(
  snapshot: OrganizationMigrationSnapshot,
  input: OrganizationMigrationInput,
): OrganizationMigrationVerification {
  const usersById = requireMigrationInputUsers(snapshot, input);
  const organizationIds = new Set(snapshot.organizations.map((organization) => organization._id));
  const membershipsByUser = new Map<Id<"users">, Array<Doc<"organizationMemberships">>>();
  const membershipsByOrganization = new Map<
    Id<"organizations">,
    Array<Doc<"organizationMemberships">>
  >();
  let membershipIssues = 0;
  for (const membership of snapshot.memberships) {
    if (!usersById.has(membership.userId) || !organizationIds.has(membership.organizationId)) {
      membershipIssues += 1;
    }
    const userMemberships = membershipsByUser.get(membership.userId) ?? [];
    userMemberships.push(membership);
    membershipsByUser.set(membership.userId, userMemberships);
    const organizationMemberships = membershipsByOrganization.get(membership.organizationId) ?? [];
    organizationMemberships.push(membership);
    membershipsByOrganization.set(membership.organizationId, organizationMemberships);
  }
  for (const user of snapshot.users) {
    if (membershipsByUser.get(user._id)?.length !== 1) {
      membershipIssues += 1;
    }
  }
  for (const organization of snapshot.organizations) {
    const memberships = membershipsByOrganization.get(organization._id) ?? [];
    if (memberships.length === 0) {
      membershipIssues += 1;
    } else if (
      memberships.length > 1 &&
      !(
        memberships.length === 2 &&
        memberships.some((membership) => membership.userId === input.operatorUserIdA) &&
        memberships.some((membership) => membership.userId === input.operatorUserIdB)
      )
    ) {
      membershipIssues += 1;
    }
  }
  const operatorMembershipA = membershipsByUser.get(input.operatorUserIdA)?.[0];
  const operatorMembershipB = membershipsByUser.get(input.operatorUserIdB)?.[0];
  if (
    operatorMembershipA === undefined ||
    operatorMembershipB === undefined ||
    operatorMembershipA.organizationId !== operatorMembershipB.organizationId
  ) {
    membershipIssues += 1;
  }

  const billingByOrganization = new Map<
    Id<"organizations">,
    Array<Doc<"organizationBillingAccounts">>
  >();
  let billingIssues = 0;
  for (const account of snapshot.billingAccounts) {
    if (!organizationIds.has(account.organizationId)) {
      billingIssues += 1;
    }
    const accounts = billingByOrganization.get(account.organizationId) ?? [];
    accounts.push(account);
    billingByOrganization.set(account.organizationId, accounts);
  }
  const organizationByCustomer = new Map<string, Id<"organizations">>();
  for (const organization of snapshot.organizations) {
    const accounts = billingByOrganization.get(organization._id) ?? [];
    if (accounts.length !== 1) {
      billingIssues += 1;
      continue;
    }
    const customerId = accounts[0].polarExternalCustomerId;
    if (customerId) {
      const existingOrganizationId = organizationByCustomer.get(customerId);
      if (existingOrganizationId !== undefined && existingOrganizationId !== organization._id) {
        billingIssues += 1;
      }
      organizationByCustomer.set(customerId, organization._id);
    }
  }

  const organizationByUser = new Map<Id<"users">, Id<"organizations">>();
  for (const [userId, memberships] of membershipsByUser) {
    if (memberships.length === 1) {
      organizationByUser.set(userId, memberships[0].organizationId);
    }
  }
  const vaultsById = new Map<Id<"vaults">, Doc<"vaults">>();
  let vaultOrganizationIssues = 0;
  for (const vault of snapshot.vaults) {
    vaultsById.set(vault._id, vault);
    if (
      vault.organizationId === undefined ||
      vault.organizationId !== organizationByUser.get(vault.userId)
    ) {
      vaultOrganizationIssues += 1;
    }
  }

  let attachmentOrganizationIssues = 0;
  for (const attachment of [...snapshot.workers, ...snapshot.projects]) {
    const parent = vaultsById.get(attachment.vaultId);
    if (
      parent === undefined ||
      attachment.userId !== parent.userId ||
      attachment.organizationId === undefined ||
      attachment.organizationId !== parent.organizationId
    ) {
      attachmentOrganizationIssues += 1;
    }
  }

  let grantMembershipIssues = 0;
  for (const grant of snapshot.grants) {
    if (
      grant.organizationId === undefined ||
      grant.organizationId !== organizationByUser.get(grant.userId)
    ) {
      grantMembershipIssues += 1;
    }
  }

  let actorFieldIssues = 0;
  for (const run of [...snapshot.provisioningRuns, ...snapshot.deletionRuns]) {
    if (run.requestedByUserId !== run.userId) {
      actorFieldIssues += 1;
    }
  }
  for (const update of snapshot.stagedUpdates) {
    if (update.editUserId !== update.userId) {
      actorFieldIssues += 1;
    }
  }

  let actorReferenceIssues = 0;
  for (const run of [...snapshot.provisioningRuns, ...snapshot.deletionRuns]) {
    if (
      !vaultsById.has(run.vaultId) ||
      !usersById.has(run.userId) ||
      (run.requestedByUserId !== undefined && !usersById.has(run.requestedByUserId))
    ) {
      actorReferenceIssues += 1;
    }
  }
  for (const update of snapshot.stagedUpdates) {
    if (
      !vaultsById.has(update.vaultId) ||
      !usersById.has(update.userId) ||
      (update.editUserId !== undefined && !usersById.has(update.editUserId))
    ) {
      actorReferenceIssues += 1;
    }
  }

  const provisioningRunsById = new Map(snapshot.provisioningRuns.map((run) => [run._id, run]));
  const deletionRunsById = new Map(snapshot.deletionRuns.map((run) => [run._id, run]));
  let eventReferenceIssues = 0;
  for (const event of snapshot.provisioningEvents) {
    const run = provisioningRunsById.get(event.runId);
    if (!hasValidWorkflowEventReference(event, run, usersById, vaultsById)) {
      eventReferenceIssues += 1;
    }
  }
  for (const event of snapshot.deletionEvents) {
    const run = deletionRunsById.get(event.runId);
    if (!hasValidWorkflowEventReference(event, run, usersById, vaultsById)) {
      eventReferenceIssues += 1;
    }
  }

  const repositoryCollisionGroups = countRepositoryCollisionGroups(snapshot);
  const issueCount =
    membershipIssues +
    billingIssues +
    vaultOrganizationIssues +
    attachmentOrganizationIssues +
    grantMembershipIssues +
    actorFieldIssues +
    actorReferenceIssues +
    eventReferenceIssues +
    repositoryCollisionGroups;

  return {
    status: issueCount === 0 ? "ready" : "not_ready",
    counts: {
      users: snapshot.users.length,
      organizations: snapshot.organizations.length,
      memberships: snapshot.memberships.length,
      billingAccounts: snapshot.billingAccounts.length,
      vaults: snapshot.vaults.length,
      attachments: snapshot.workers.length + snapshot.projects.length,
      grants: snapshot.grants.length,
      actorRows:
        snapshot.provisioningRuns.length +
        snapshot.deletionRuns.length +
        snapshot.stagedUpdates.length,
      events: snapshot.provisioningEvents.length + snapshot.deletionEvents.length,
      membershipIssues,
      billingIssues,
      vaultOrganizationIssues,
      attachmentOrganizationIssues,
      grantMembershipIssues,
      actorFieldIssues,
      actorReferenceIssues,
      eventReferenceIssues,
      repositoryCollisionGroups,
    },
  };
}

export const verifyOrganizationOwnership = internalQuery({
  args: organizationMigrationInput.fields,
  returns: organizationMigrationVerification,
  handler: async (ctx, args): Promise<OrganizationMigrationVerification> => {
    const snapshot = await readOrganizationMigrationSnapshot(ctx.db);
    return verifyOrganizationMigration(snapshot, args);
  },
});
