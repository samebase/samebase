import { guard } from "@samebase/dependent/main";
import { ConvexError } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { ManagedProviderPlan } from "./contracts/getUserRepositories";
import type { RepositoryProvisioningMode } from "./provisioningModel";

export type RepositoryProvisioningPlan = Doc<"workflow_repositoryProvisioning_plans">;
export type SamebaseProvisioningPlan = Exclude<
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
plan has none: those resources belong to the repository's GitHub Actions.
*/
export const isSamebaseProvisioningPlan = guard<
  RepositoryProvisioningPlan | null,
  SamebaseProvisioningPlan
>((plan) => (plan && !("provisioning" in plan) ? plan : null));

/**
The refusal of every Samebase provider write to a repository_actions repository. Samebase's write
lock does not coordinate with the repository's GitHub Actions, so only one of them may change the
Convex project and the Worker. It holds no provider text, so MCP shows it.
*/
export const REPOSITORY_ACTIONS_OWN_PROVIDERS_MESSAGE =
  "The GitHub Actions of this repository own its Convex project and Worker, so Samebase does not change them. Nothing changed.";

type SamebaseManagedProviderPlan = Exclude<
  NonNullable<ManagedProviderPlan>,
  { provisioning: "repository_actions" }
>;

/** The same narrowing for the dashboard projection of a plan. */
export const isSamebaseManagedProviderPlan = guard<
  ManagedProviderPlan,
  SamebaseManagedProviderPlan
>((plan) => (plan && !("provisioning" in plan) ? plan : null));

/** The plan of the steps that only the samebase mode runs: claim_infra through finish. */
export function requireSamebaseProvisioningPlan(
  plan: RepositoryProvisioningPlan,
): SamebaseProvisioningPlan {
  if (!isSamebaseProvisioningPlan(plan)) {
    throw new ConvexError(REPOSITORY_ACTIONS_OWN_PROVIDERS_MESSAGE);
  }
  return plan;
}
