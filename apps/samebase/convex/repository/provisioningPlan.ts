import { guard } from "@samebase/dependent/main";

import type { Doc } from "../_generated/dataModel";
import type { ManagedProviderPlan } from "./contracts/getUserRepositories";
import type { RepositoryProvisioningMode } from "./provisioningModel";

export type RepositoryProvisioningPlan = Doc<"workflow_repositoryProvisioning_plans">;
type SamebaseProvisioningPlan = Exclude<
  RepositoryProvisioningPlan,
  { provisioning: "repository_actions" }
>;

/**
The mode of a stored plan or of its dashboard projection. The samebase plan predates the
`provisioning` field, so a plan without it is samebase.
*/
export function readRepositoryProvisioningMode(
  plan: RepositoryProvisioningPlan | NonNullable<ManagedProviderPlan>,
): RepositoryProvisioningMode {
  return "provisioning" in plan ? plan.provisioning : "samebase";
}

/**
Who changes the provider settings of a repository's Workers and Convex projects: creating them,
connecting Workers Builds, choosing its token, and installing deploy keys.

samebase = Samebase wrote them through an old setup run or a member's manual provider action

setup_stack = the repository's Alchemy setup stack, in alchemy.run.ts and its `alchemy` workflow
*/
export function readProviderInfrastructureWriter(
  plan: RepositoryProvisioningPlan | ManagedProviderPlan,
): "samebase" | "setup_stack" {
  if (!plan) {
    return "samebase";
  }
  const mode = readRepositoryProvisioningMode(plan);
  switch (mode) {
    case "samebase":
      return "samebase";
    case "repository_actions":
      return "setup_stack";
    default:
      mode satisfies never;
      throw new Error("Unknown repository provisioning mode.");
  }
}

/**
The samebase plan, which carries the Convex project and Worker checkpoints. The repository_actions
plan has none: its provider resources belong to the repository's GitHub Actions.
*/
export const isSamebaseProvisioningPlan = guard<
  RepositoryProvisioningPlan | null,
  SamebaseProvisioningPlan
>((plan) => (plan && !("provisioning" in plan) ? plan : null));

type SamebaseManagedProviderPlan = Exclude<
  NonNullable<ManagedProviderPlan>,
  { provisioning: "repository_actions" }
>;

/** The same narrowing for the dashboard projection of a plan. */
export const isSamebaseManagedProviderPlan = guard<
  ManagedProviderPlan,
  SamebaseManagedProviderPlan
>((plan) => (plan && !("provisioning" in plan) ? plan : null));
