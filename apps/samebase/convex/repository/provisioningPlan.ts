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
