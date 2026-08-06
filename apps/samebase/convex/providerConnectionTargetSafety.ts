import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";
import type { ProviderKind } from "./providerConnectionModel";

export type ProviderTarget =
  | { kind: "convex"; teamId: string }
  | { kind: "cloudflare"; accountId: string };

const PROVIDER_TARGET_VERIFICATION_LIMIT = 200;

function requireWithinVerificationLimit<Row>(rows: Row[]): Row[] {
  if (rows.length > PROVIDER_TARGET_VERIFICATION_LIMIT) {
    throw new Error(
      `Provider target verification exceeded its ${PROVIDER_TARGET_VERIFICATION_LIMIT}-row operational limit.`,
    );
  }
  return rows;
}

function targetMismatchError(kind: ProviderKind): Error {
  return new Error(
    kind === "convex"
      ? "Convex connection team must match all retained organization resources."
      : "Cloudflare connection account must match all retained organization resources.",
  );
}

function assertTargetMatches(
  target: ProviderTarget,
  retained: { kind: "convex"; teamId: string } | { kind: "cloudflare"; accountId: string },
): void {
  if (target.kind !== retained.kind) {
    return;
  }
  switch (target.kind) {
    case "convex":
      if (retained.kind === "convex" && target.teamId !== retained.teamId) {
        throw targetMismatchError(target.kind);
      }
      return;
    case "cloudflare":
      if (retained.kind === "cloudflare" && target.accountId !== retained.accountId) {
        throw targetMismatchError(target.kind);
      }
      return;
  }
}

function manualWriteUsesProvider(
  write: Extract<
    Doc<"workflow_vaultProvisioning_writeLocks">,
    { owner: { kind: "manual_provider_write" } }
  >,
  kind: ProviderKind,
): boolean {
  switch (write.owner.action) {
    case "create_convex_project":
      return kind === "convex";
    case "connect_cloudflare_worker":
    case "create_cloudflare_worker":
    case "configure_workers_builds_for_github":
      return kind === "cloudflare";
    case "rotate_convex_deploy_keys_for_workers_builds":
      return true;
    default:
      write.owner.action satisfies never;
      throw new Error("Unknown manual provider write action.");
  }
}

function activeWriteUsesProvider(
  write: Doc<"workflow_vaultProvisioning_writeLocks">,
  kind: ProviderKind,
  now: number,
): boolean {
  if (write.state !== "active") {
    return false;
  }
  if (write.owner.kind === "managed_run") {
    return true;
  }
  if (write.owner.expiresAt <= now) {
    return false;
  }
  return manualWriteUsesProvider({ ...write, owner: write.owner }, kind);
}

function assertDeletionPlanTarget(
  target: ProviderTarget,
  run: Exclude<Doc<"workflow_vaultDeletion_runs">, { state: "succeeded" }>,
): void {
  const plan = run.snapshot.plan;
  switch (target.kind) {
    case "convex":
      if (plan.convex.action === "delete_projects") {
        for (const project of plan.convex.projects) {
          assertTargetMatches(target, { kind: "convex", teamId: project.teamId });
        }
      }
      return;
    case "cloudflare":
      if (plan.cloudflare.action === "delete_workers") {
        for (const worker of plan.cloudflare.workers) {
          assertTargetMatches(target, { kind: "cloudflare", accountId: worker.accountId });
        }
      }
      return;
  }
}

async function isRetryableFailedDeletionRun(
  db: DatabaseReader,
  run: Extract<Doc<"workflow_vaultDeletion_runs">, { state: "failed" }>,
): Promise<boolean> {
  const vault = await db.get(run.vaultId);
  return (
    vault !== null &&
    vault.organizationId === run.organizationId &&
    vault.deletion.state === "delete_failed" &&
    vault.deletion.runId === run._id
  );
}

/**
 * A new singleton target cannot strand retained resources or race an in-flight
 * provider write that can still record an older target.
 */
export async function assertProviderTargetCanBeEstablished(
  db: DatabaseReader,
  args: { organizationId: Id<"organizations">; target: ProviderTarget },
): Promise<void> {
  const vaults = await db
    .query("vaults")
    .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
    .take(PROVIDER_TARGET_VERIFICATION_LIMIT + 1)
    .then(requireWithinVerificationLimit);
  const now = Date.now();

  for (const vault of vaults) {
    const [plan, write] = await Promise.all([
      db
        .query("workflow_vaultProvisioning_plans")
        .withIndex("by_vault", (query) => query.eq("vaultId", vault._id))
        .unique(),
      db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (query) => query.eq("vaultId", vault._id))
        .unique(),
    ]);
    if (write !== null && activeWriteUsesProvider(write, args.target.kind, now)) {
      throw new Error(
        `Cannot establish a ${args.target.kind} connection while an organization provider write is active.`,
      );
    }
    if (plan !== null) {
      switch (args.target.kind) {
        case "convex":
          assertTargetMatches(args.target, { kind: "convex", teamId: plan.convex.teamId });
          break;
        case "cloudflare":
          assertTargetMatches(args.target, {
            kind: "cloudflare",
            accountId: plan.cloudflare.accountId,
          });
          break;
      }
    }
  }

  switch (args.target.kind) {
    case "convex": {
      const projects = await db
        .query("vaultConvexProjects")
        .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
        .take(PROVIDER_TARGET_VERIFICATION_LIMIT + 1)
        .then(requireWithinVerificationLimit);
      for (const project of projects) {
        assertTargetMatches(args.target, { kind: "convex", teamId: project.teamId });
      }
      break;
    }
    case "cloudflare": {
      const workers = await db
        .query("vaultCloudflareWorkers")
        .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
        .take(PROVIDER_TARGET_VERIFICATION_LIMIT + 1)
        .then(requireWithinVerificationLimit);
      for (const worker of workers) {
        assertTargetMatches(args.target, { kind: "cloudflare", accountId: worker.accountId });
      }
      break;
    }
  }

  const deletionRuns = await db
    .query("workflow_vaultDeletion_runs")
    .withIndex("by_organization_and_updated_at", (query) =>
      query.eq("organizationId", args.organizationId),
    )
    .take(PROVIDER_TARGET_VERIFICATION_LIMIT + 1)
    .then(requireWithinVerificationLimit);
  for (const run of deletionRuns) {
    if (run.state === "succeeded") {
      continue;
    }
    if (run.state === "failed" && !(await isRetryableFailedDeletionRun(db, run))) {
      continue;
    }
    assertDeletionPlanTarget(args.target, run);
  }
}
