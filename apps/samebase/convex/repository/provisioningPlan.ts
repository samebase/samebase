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
Who changes the provider settings of a repository's Workers and Convex projects: creating them,
connecting Workers Builds, choosing its token, and installing deploy keys.

samebase = Samebase, through its setup run or a member's manual provider action

setup_stack = the repository's Alchemy setup stack, in alchemy.run.ts and its `alchemy` workflow;
Samebase's write lock does not coordinate with that workflow, so Samebase refuses these writes

Attaching, detaching, and updating a stored Worker name or root stay with Samebase's members for
every repository. The backend admission, the Settings actions, and the MCP repair advice all read
this one rule.
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

/**
The refusal of every Samebase provider write to a repository_actions repository. Samebase's write
lock does not coordinate with the repository's GitHub Actions, so only one of them may change the
provider resources. It holds no provider text, so MCP shows it.
*/
export const REPOSITORY_ACTIONS_OWN_PROVIDERS_MESSAGE =
  "The GitHub Actions of this repository own its provider resources, so Samebase does not change them. Nothing changed.";

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
