import { v, type Infer } from "convex/values";

import { internalQuery } from "../_generated/server";
import { getConvexCodeLocationKey, readConvexCodeLocation } from "../../shared/convexCodeLocation";
import { requireRepositoryForUser, requireRepositoryOrganization } from "../organizationAccess";
import { vConvexCodeLocation } from "./contracts/convexCodeLocation";
import { isLiveConnectedRepository } from "./state";

const { array, id, object, optional, string } = v;

const vRepositoryProviderObservationContext = object({
  organizationId: id("organizations"),
  convexTeamId: optional(string()),
  cloudflareAccountId: optional(string()),
  githubRepositoryDatabaseId: string(),
  githubOwnerLogin: string(),
  githubRepositoryName: string(),
  defaultBranch: string(),
  cloudflareWorkers: array(
    object({
      workerId: id("repositoryCloudflareWorkers"),
      accountId: string(),
      workerName: string(),
      workerTag: string(),
      rootDirectory: string(),
    }),
  ),
  convexProjects: array(
    object({
      convexProjectId: id("repositoryConvexProjects"),
      teamId: string(),
      projectId: string(),
      codeLocation: vConvexCodeLocation,
    }),
  ),
});
export type RepositoryProviderObservationContext = Infer<
  typeof vRepositoryProviderObservationContext
>;

export const readRepositoryProviderObservationContext = internalQuery({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
  },
  returns: vRepositoryProviderObservationContext,
  handler: async (ctx, args) => {
    const repository = await requireRepositoryForUser(ctx.db, args);
    if (!isLiveConnectedRepository(repository)) {
      throw new Error("Repository not found.");
    }
    const [workers, projects, organization] = await Promise.all([
      ctx.db
        .query("repositoryCloudflareWorkers")
        .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
        .collect(),
      ctx.db
        .query("repositoryConvexProjects")
        .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
        .collect(),
      requireRepositoryOrganization(ctx.db, repository),
    ]);
    if (
      workers.some((worker) => worker.organizationId !== repository.organizationId) ||
      workers.some((worker) => worker.accountId !== repository.cloudflareAccountId) ||
      projects.some((project) => project.organizationId !== repository.organizationId) ||
      projects.some((project) => project.teamId !== repository.convexTeamId)
    ) {
      throw new Error("Repository provider attachment not found.");
    }

    return {
      organizationId: repository.organizationId,
      convexTeamId: repository.convexTeamId,
      cloudflareAccountId: repository.cloudflareAccountId,
      githubRepositoryDatabaseId: repository.githubRepositoryDatabaseId,
      githubOwnerLogin: organization.githubOwnerLogin,
      githubRepositoryName: repository.githubRepositoryName,
      defaultBranch: repository.defaultBranch,
      cloudflareWorkers: workers
        .map((worker) => ({
          workerId: worker._id,
          accountId: worker.accountId,
          workerName: worker.workerName,
          workerTag: worker.workerTag,
          rootDirectory: worker.rootDirectory,
        }))
        .sort(
          (left, right) =>
            left.workerName.localeCompare(right.workerName) ||
            left.workerId.localeCompare(right.workerId),
        ),
      convexProjects: projects
        .map((project) => ({
          convexProjectId: project._id,
          teamId: project.teamId,
          projectId: project.projectId,
          codeLocation: readConvexCodeLocation(project),
        }))
        .sort(
          (left, right) =>
            getConvexCodeLocationKey(left.codeLocation).localeCompare(
              getConvexCodeLocationKey(right.codeLocation),
            ) ||
            left.projectId.localeCompare(right.projectId) ||
            left.convexProjectId.localeCompare(right.convexProjectId),
        ),
    };
  },
});
