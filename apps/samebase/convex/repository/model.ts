import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

import { vRepositoryDeletionState } from "./deletion/model";
export { parseGitHubRepositoryFullName } from "../../shared/githubRepositoryName";

const { id, literal, number, object, optional, string, union } = v;

export const vGitHubRepositoryVisibility = union(literal("private"), literal("public"));

export const vRepositoryConnectedGitHubTarget = object({
  repositoryId: id("repositories"),
  githubRepositoryDatabaseId: string(),
  githubOwnerLogin: string(),
  githubRepositoryName: string(),
  defaultBranch: string(),
});
export type RepositoryConnectedGitHubTarget = Infer<typeof vRepositoryConnectedGitHubTarget>;

const repositoryBaseFields = {
  organizationId: id("organizations"),
  deletion: vRepositoryDeletionState,
  createdAt: number(),
} as const;

export const repositoryTables = {
  /**
  Durable Samebase repositories with explicit GitHub connection states. A create_repository row has
  no `cloudflareAccountId` when its provisioning is repository_actions: its GitHub Actions deploy to
  Convex only.
  */
  repositories: defineTable(
    union(
      object({
        state: literal("not_connected"),
        ...repositoryBaseFields,
        convexTeamId: optional(string()),
        cloudflareAccountId: optional(string()),
      }),
      object({
        state: literal("provisioning"),
        githubMode: literal("create_repository"),
        ...repositoryBaseFields,
        convexTeamId: string(),
        cloudflareAccountId: optional(string()),
        runId: id("workflow_repositoryProvisioning_runs"),
        startedAt: number(),
        githubRepositoryName: string(),
        visibility: vGitHubRepositoryVisibility,
      }),
      object({
        state: literal("provisioning"),
        githubMode: literal("connect_existing_repository"),
        ...repositoryBaseFields,
        convexTeamId: optional(string()),
        cloudflareAccountId: optional(string()),
        runId: id("workflow_repositoryProvisioning_runs"),
        startedAt: number(),
        githubRepositoryDatabaseId: optional(string()),
        githubRepositoryName: string(),
      }),
      object({
        state: literal("connected"),
        githubMode: literal("create_repository"),
        ...repositoryBaseFields,
        convexTeamId: string(),
        cloudflareAccountId: optional(string()),
        runId: id("workflow_repositoryProvisioning_runs"),
        githubRepositoryDatabaseId: string(),
        defaultBranch: string(),
        connectedAt: number(),
        githubRepositoryName: string(),
        visibility: vGitHubRepositoryVisibility,
      }),
      object({
        state: literal("connected"),
        githubMode: literal("connect_existing_repository"),
        ...repositoryBaseFields,
        convexTeamId: optional(string()),
        cloudflareAccountId: optional(string()),
        runId: id("workflow_repositoryProvisioning_runs"),
        githubRepositoryDatabaseId: string(),
        defaultBranch: string(),
        connectedAt: number(),
        githubRepositoryName: string(),
        visibility: vGitHubRepositoryVisibility,
      }),
      object({
        state: literal("failed"),
        githubMode: literal("create_repository"),
        ...repositoryBaseFields,
        convexTeamId: string(),
        cloudflareAccountId: optional(string()),
        runId: id("workflow_repositoryProvisioning_runs"),
        failedAt: number(),
        githubRepositoryName: string(),
        visibility: vGitHubRepositoryVisibility,
      }),
      object({
        state: literal("failed"),
        githubMode: literal("connect_existing_repository"),
        ...repositoryBaseFields,
        convexTeamId: optional(string()),
        cloudflareAccountId: optional(string()),
        runId: id("workflow_repositoryProvisioning_runs"),
        failedAt: number(),
        githubRepositoryDatabaseId: optional(string()),
        githubRepositoryName: string(),
      }),
    ),
  )
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_state_and_deletion_state", [
      "organizationId",
      "state",
      "deletion.state",
    ])
    .index("by_github_repository_database_id", ["githubRepositoryDatabaseId"])
    .index("by_organization_and_github_repository_name", [
      "organizationId",
      "githubRepositoryName",
    ]),
};
