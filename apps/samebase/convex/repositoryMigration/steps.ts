import type { AppProvisioningRunStep, AppProvisioningStep } from "../appProvisioningModel";
import type {
  RepositoryProvisioningRunStep,
  RepositoryProvisioningStep,
} from "../repository/provisioningModel";
import type { RepositoryDeletionPlan, RepositoryDeletionStep } from "../repository/deletion/model";
import type { VaultDeletionPlan, VaultDeletionStep } from "../vault/deletion/model";

export function toRepositoryProvisioningStep(
  step: AppProvisioningStep,
): RepositoryProvisioningStep {
  switch (step) {
    case "initialize_vault":
      return "initialize_repository";
    case "create_github_repo":
      return "create_github_repository";
    case "fetch_github_repo":
      return "fetch_github_repository";
    case "connect_github":
      return "connect_github_repository";
    case "validate_connections":
    case "seed_starter":
    case "sync_tree":
    case "claim_infra":
    case "attach_convex":
    case "attach_worker":
    case "configure_workers_builds_for_github":
    case "rotate_convex_deploy_keys_for_workers_builds":
    case "finish":
      return step;
    default:
      step satisfies never;
      throw new Error("Unknown provisioning step.");
  }
}

export function toRepositoryProvisioningRunStep(
  step: AppProvisioningRunStep,
): RepositoryProvisioningRunStep {
  if (step === "run_created") {
    return step;
  }
  return toRepositoryProvisioningStep(step);
}

export function toRepositoryDeletionStep(step: VaultDeletionStep): RepositoryDeletionStep {
  switch (step) {
    case "lock_vault":
      return "lock_repository";
    case "delete_github_repo":
      return "delete_github_repository";
    case "delete_vault":
      return "remove_repository";
    case "initialize_deletion":
    case "delete_cloudflare":
    case "delete_convex":
    case "cleanup_editor_state":
    case "cleanup_source_caches":
    case "cleanup_runtime_state":
    case "cleanup_provisioning_history":
    case "finish":
      return step;
    default:
      step satisfies never;
      throw new Error("Unknown deletion step.");
  }
}

export function toRepositoryDeletionPlan(plan: VaultDeletionPlan): RepositoryDeletionPlan {
  switch (plan.target.kind) {
    case "samebase_managed_repository":
      if (plan.githubRepository.action === "delete_repository") {
        return {
          convex: plan.convex,
          cloudflare: plan.cloudflare,
          target: {
            kind: plan.target.kind,
            githubRepositoryDatabaseId: plan.target.ghRepoId,
            githubOwnerLogin: plan.target.owner,
            githubRepositoryName: plan.target.name,
            githubRepositoryFullName: plan.target.repositoryFullName,
          },
          githubRepository: {
            action: plan.githubRepository.action,
            githubRepositoryDatabaseId: plan.githubRepository.ghRepoId,
            githubOwnerLogin: plan.githubRepository.owner,
            githubRepositoryName: plan.githubRepository.name,
          },
        };
      }
      if (plan.githubRepository.reason !== "not_requested") {
        throw new Error("A managed repository has an invalid GitHub cleanup reason.");
      }
      return {
        convex: plan.convex,
        cloudflare: plan.cloudflare,
        target: {
          kind: plan.target.kind,
          githubRepositoryDatabaseId: plan.target.ghRepoId,
          githubOwnerLogin: plan.target.owner,
          githubRepositoryName: plan.target.name,
          githubRepositoryFullName: plan.target.repositoryFullName,
        },
        githubRepository: {
          action: plan.githubRepository.action,
          reason: plan.githubRepository.reason,
        },
      };
    case "existing_repository":
      if (
        plan.githubRepository.action !== "skip" ||
        (plan.githubRepository.reason !== "not_requested" &&
          plan.githubRepository.reason !== "not_samebase_managed")
      ) {
        throw new Error("An existing repository has an invalid GitHub cleanup action.");
      }
      return {
        convex: plan.convex,
        cloudflare: plan.cloudflare,
        target: {
          kind: plan.target.kind,
          githubRepositoryDatabaseId: plan.target.ghRepoId,
          githubOwnerLogin: plan.target.owner,
          githubRepositoryName: plan.target.name,
          githubRepositoryFullName: plan.target.repositoryFullName,
        },
        githubRepository: {
          action: plan.githubRepository.action,
          reason: plan.githubRepository.reason,
        },
      };
    case "failed_repository_setup":
      if (
        plan.githubRepository.action !== "skip" ||
        (plan.githubRepository.reason !== "not_requested" &&
          plan.githubRepository.reason !== "no_confirmed_identity")
      ) {
        throw new Error("A failed repository setup has an invalid GitHub cleanup action.");
      }
      return {
        convex: plan.convex,
        cloudflare: plan.cloudflare,
        target: {
          kind: plan.target.kind,
          githubMode: plan.target.githubMode,
          githubOwnerLogin: plan.target.owner,
          githubRepositoryName: plan.target.name,
          githubRepositoryFullName: plan.target.repositoryFullName,
        },
        githubRepository: {
          action: plan.githubRepository.action,
          reason: plan.githubRepository.reason,
        },
      };
    default:
      plan.target satisfies never;
      throw new Error("Unknown deletion target.");
  }
}
