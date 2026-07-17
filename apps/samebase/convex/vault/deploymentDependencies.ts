import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Preserve provider key names for later revocation while making every Worker
 * relationship visibly repairable after its shared Convex deployment changes.
 */
export async function markConvexDeploymentDependenciesNotWired(
  ctx: Pick<MutationCtx, "db">,
  convexDeploymentId: Id<"vaultConvexDeployments">,
  now: number,
): Promise<void> {
  const dependencies = await ctx.db
    .query("vaultWorkerDeploymentDependencies")
    .withIndex("by_convex_deployment", (q) => q.eq("convexDeploymentId", convexDeploymentId))
    .collect();

  for (const dependency of dependencies) {
    if (dependency.wiring.state === "not_wired") {
      continue;
    }
    await ctx.db.patch(dependency._id, {
      wiring: {
        state: "not_wired",
        deployKeys: dependency.wiring.deployKeys,
      },
      updatedAt: now,
    });
  }
}
