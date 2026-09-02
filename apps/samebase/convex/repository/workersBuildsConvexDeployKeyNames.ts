import type { Id } from "../_generated/dataModel";

/**
 * Convex deploy-key names are provider-visible ownership identifiers.
 *
 * The exact v2 strings are an external contract. Never edit this version in
 * place; a future format must introduce a new version. Names are derived from
 * stable Samebase attachment ids when an operation runs and are never stored
 * in a Samebase table. Superseded provider keys are one-time operator cleanup,
 * not compatibility state for the product to persist.
 *
 * v1 identified only the repository, so two Workers sharing one Convex project
 * could rotate each other's keys. v2 includes the complete Worker attachment
 * id to give every Worker its own production and preview credentials.
 */
export function buildWorkersBuildsConvexDeployKeyNames(args: {
  repositoryId: Id<"repositories">;
  workerId: Id<"repositoryCloudflareWorkers">;
}) {
  const owner = `samebase-workers-builds-v2-${args.repositoryId}-${args.workerId}`;

  return {
    production: `${owner}-production`,
    preview: `${owner}-preview`,
  };
}
