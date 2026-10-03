import { v, type Infer } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import { vConvexDeploymentRegion } from "../../convexDeploymentRegionModel";
import {
  vCloudflareBuildState,
  vCloudflareWorkerBuildsObservation,
  vCloudflareWorkerConvexBuildAccessObservation,
  vCloudflareWorkerObservation,
  vConvexProjectObservation,
} from "../providerObservationModel";
import { vPullRequestResources, vRepositoryPullRequestPage } from "../pullRequestModel";
import { cloudflareConfigureWorkersBuildsForGitHubContract } from "./cloudflareConfigureWorkersBuildsForGitHub";
import { cloudflareRotateConvexDeployKeysForWorkersBuildsContract } from "./cloudflareRotateConvexDeployKeysForWorkersBuilds";
import { MCP_REPOSITORY_INPUT_DESCRIPTION, mcpRepositoryArgs } from "./repositoryReference";
import { retryInfrastructureProvisioningContract } from "./retryInfrastructureProvisioning";

const { array, boolean, id, literal, number, object, string, union } = v;

/** The status read lists at most this many open pull requests, most recently updated first. */
export const REPOSITORY_STATUS_PULL_REQUEST_LIMIT = 6;

/**
One problem that the status read found, with the tool that fixes it. `tool` is null when no
Samebase tool fixes the problem; `problem` then says what to do.
*/
export const vRepositoryAttentionItem = union(
  object({
    tool: literal(cloudflareConfigureWorkersBuildsForGitHubContract.mcp.name),
    workerName: string(),
    problem: string(),
  }),
  object({
    tool: literal(cloudflareRotateConvexDeployKeysForWorkersBuildsContract.mcp.name),
    workerName: string(),
    convexProjectName: union(string(), v.null()),
    problem: string(),
  }),
  object({
    tool: literal(retryInfrastructureProvisioningContract.mcp.name),
    problem: string(),
  }),
  object({
    tool: v.null(),
    problem: string(),
  }),
);

/** The dashboard result: the same live reads that the repository overview makes today. */
const vRepositoryStatus = object({
  workers: array(vCloudflareWorkerObservation),
  workerBuilds: array(vCloudflareWorkerBuildsObservation),
  workerConvexBuildAccess: array(vCloudflareWorkerConvexBuildAccessObservation),
  convexProjects: array(vConvexProjectObservation),
  pullRequests: union(
    object({ state: literal("available"), page: vRepositoryPullRequestPage }),
    object({ state: literal("unavailable") }),
  ),
  pullRequestResources: array(vPullRequestResources),
  attention: array(vRepositoryAttentionItem),
});

/** Failed check names instead of the full check list. Null when the commit has no checks. */
const vMcpChecks = union(
  v.null(),
  object({
    total: number(),
    pending: number(),
    failed: array(string()),
  }),
);
const vMcpBuild = union(
  object({ state: literal("available"), buildState: vCloudflareBuildState, logsUrl: string() }),
  object({ state: literal("absent") }),
  object({ state: literal("unavailable") }),
);

/** The MCP result: no labels, line counts, node IDs, head SHAs, or attachment IDs. */
const vMcpRepositoryStatus = object({
  repository: string(),
  defaultBranch: union(
    v.null(),
    object({
      name: string(),
      headCommitTitle: string(),
      headCommitUrl: string(),
      checks: vMcpChecks,
    }),
  ),
  openPullRequestCount: union(number(), v.null()),
  apps: array(
    object({
      workerName: string(),
      rootDirectory: string(),
      productionBuild: vMcpBuild,
      urls: array(string()),
    }),
  ),
  convexProjects: array(
    object({
      codeLocation: string(),
      projectSlug: union(string(), v.null()),
      productionDeployment: union(
        object({
          state: literal("available"),
          deploymentName: string(),
          dashboardUrl: string(),
          region: vConvexDeploymentRegion,
        }),
        object({ state: literal("missing") }),
        object({ state: literal("unavailable") }),
      ),
    }),
  ),
  pullRequests: array(
    object({
      number: number(),
      title: string(),
      url: string(),
      isDraft: boolean(),
      headRefName: string(),
      checks: vMcpChecks,
      apps: array(
        object({
          workerName: string(),
          previewBuild: vMcpBuild,
          previewUrl: union(string(), v.null()),
        }),
      ),
    }),
  ),
  attention: array(vRepositoryAttentionItem),
});

export const getRepositoryStatusContract = {
  id: "get_repository_status",
  access: "access_dashboard",
  args: {
    repositoryId: id("repositories"),
  },
  mcpArgs: mcpRepositoryArgs,
  returns: vRepositoryStatus,
  structuredContent: vMcpRepositoryStatus,
  mcp: {
    title: "Get repository status",
    name: "repository_getStatus",
    description:
      "Read the live status of a repository: each app (Worker and root directory) with its production build and URLs, each Convex project's production deployment, the default branch head commit and its checks, the open pull requests (first 6) with their checks and preview builds, and attention items that name the tool that fixes each problem.",
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {
      repository: MCP_REPOSITORY_INPUT_DESCRIPTION,
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Reads the repository's current state live from GitHub, Cloudflare, and Convex: the facts that
the repository overview shows. It changes nothing.

- Apps: one entry per attached Cloudflare Worker with its root directory, its latest production
  build on the default branch (state and logs URL), and its URLs (custom domains and workers.dev).
- Convex projects: each attached project's code location and production deployment (name,
  dashboard URL, and region), or missing.
- Repository: the default branch head commit with its checks, the open pull request count, and the
  first 6 open pull requests, most recently updated first. Each lists its checks and, per app, the
  preview build and preview URL.
- Attention items: each names a problem and the tool that fixes it:
  \`repository_cloudflare_configureBuilds\` when a Worker's Workers Builds settings are missing or
  use different tokens, \`repository_cloudflare_rotateConvexDeployKeys\` when a Worker's Convex
  deploy key is missing or targets another project, and \`repository_retryProviderSetup\` when
  Samebase-managed setup failed. "Deploy the Convex project to production first" means that a
  project has no production deployment yet, so no deploy key can be installed.

Checks list only the names of failed checks. A provider that cannot be read is reported as
unavailable rather than failing the whole read. A successful build does not prove that the app
serves the expected content.`,
} as const;

export type RepositoryStatus = Infer<typeof getRepositoryStatusContract.returns>;
export type McpRepositoryStatus = Infer<typeof getRepositoryStatusContract.structuredContent>;
export type RepositoryAttentionItem = Infer<typeof vRepositoryAttentionItem>;
