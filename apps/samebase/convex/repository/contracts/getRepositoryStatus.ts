import { v, type Infer } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import { vAlchemySetupStatus } from "../../../shared/alchemyStateModel";
import { vConvexDeploymentRegion } from "../../convexDeploymentRegionModel";
import {
  vCloudflareBuildState,
  vCloudflareWorkerBuildsObservation,
  vCloudflareWorkerConvexBuildAccessObservation,
  vCloudflareWorkerObservation,
  vConvexProjectObservation,
} from "../providerObservationModel";
import { vPullRequestResources, vRepositoryPullRequestPage } from "../pullRequestModel";
import { MCP_REPOSITORY_INPUT_DESCRIPTION, mcpRepositoryArgs } from "./repositoryReference";
import { retryInfrastructureProvisioningContract } from "./retryInfrastructureProvisioning";

const { array, boolean, id, literal, number, object, string, union } = v;

/** The status read lists at most this many open pull requests, most recently updated first. */
export const REPOSITORY_STATUS_PULL_REQUEST_LIMIT = 6;

/**
One problem that the status read found. `tool` names the Samebase tool that fixes it, and is null
when no Samebase tool does; `problem` then says what to do.
*/
const vRepositoryAttentionItem = union(
  object({
    tool: literal(retryInfrastructureProvisioningContract.mcp.name),
    problem: string(),
  }),
  object({
    tool: v.null(),
    problem: string(),
  }),
);

/**
The setup status of a repository that its GitHub Actions set up; null for any other.

unavailable = the team's Alchemy state store could not be read, like the other live facts here
*/
const vRepositoryStatusSetupStack = union(
  ...vAlchemySetupStatus.members,
  object({ state: literal("unavailable") }),
  v.null(),
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
  setupStack: vRepositoryStatusSetupStack,
  attention: array(vRepositoryAttentionItem),
});

/**
The checks of one commit, null when it has none. The counts come from GitHub's aggregate counts, so
they cover every check. GitHub lists only the first 100 checks, so failedNames can miss a failure;
failedNamesComplete is false when it names fewer checks than `failed` counts.
*/
const vMcpChecks = union(
  v.null(),
  object({
    total: number(),
    failed: number(),
    pending: number(),
    unknown: number(),
    failedNames: array(string()),
    failedNamesComplete: boolean(),
  }),
);
const vMcpBuild = union(
  object({ state: literal("available"), buildState: vCloudflareBuildState, logsUrl: string() }),
  object({ state: literal("absent") }),
  object({ state: literal("unavailable") }),
);

/**
The commit of the latest production build against the default branch head.

matches_head = the build is of the current head commit.

behind_head = the build is of another commit, so the latest push has no production build yet.

unknown = the head or the built commit could not be read.
*/
const vMcpProductionBuildCommit = union(
  literal("matches_head"),
  literal("behind_head"),
  literal("unknown"),
);
const vMcpProductionBuild = union(
  object({
    state: literal("available"),
    buildState: vCloudflareBuildState,
    commit: vMcpProductionBuildCommit,
    logsUrl: string(),
  }),
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
      productionBuild: vMcpProductionBuild,
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
  setupStack: vRepositoryStatusSetupStack,
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
      "Read the live status of a repository: each app (Worker and root directory) with its production build, whether that build is of the default branch head, and its URLs, each Convex project's production deployment, the default branch head commit and its checks, the open pull requests (first 6) with their checks and preview builds, for a repository that its GitHub Actions set up whether its first deployment finished, and attention items that say what to do about each problem.",
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      repository: MCP_REPOSITORY_INPUT_DESCRIPTION,
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Reads the repository's current state live from GitHub, Cloudflare, and Convex: the facts that
the repository overview shows. It changes nothing.

- Apps: one entry per attached Cloudflare Worker with its root directory, its latest production
  build on the default branch (state, logs URL, and \`commit\`), and its URLs (custom domains and
  workers.dev). \`commit\` compares the built commit with the default branch head:
  \`matches_head\`, \`behind_head\` (the latest push has no production build yet), or \`unknown\`
  when either commit cannot be read. A successful build that is \`behind_head\` does not deploy the
  latest push.
- Convex projects: each attached project's code location and production deployment (name,
  dashboard URL, and region), or missing.
- Repository: the default branch head commit with its checks, the open pull request count, and the
  first 6 open pull requests, most recently updated first. Each lists its checks and, per app, the
  preview build and preview URL.
- Setup stack, for a repository that its GitHub Actions set up (null for any other): \`state\` from
  the team's Alchemy state store. It is done when the \`prod\` stage of the stack named after the
  repository has an output, and in_progress before that. The store does not say whether a run
  failed, so in_progress can also mean that the first run stopped: the repository's GitHub Actions
  page shows the run. It is unavailable when the store cannot be read.
- Attention items: each names a problem and what to do about it. The provider setup state comes
  first. While Samebase setup runs, the only item says so. When it failed, the only item names
  \`repository_retryProviderSetup\`, the one tool that fixes a problem. Samebase repairs nothing
  else: repair lives in Alchemy and the agent. For a repository that its GitHub Actions set up, an
  item about a Worker or a Convex project says that the setup stack owns the setting, and while the
  setup stack is in_progress an item says so and links the repository's GitHub Actions. For any
  other repository, such an item links the guide to move the app to Alchemy. "Deploy the Convex
  project to production first" means that a project has no production deployment yet.

Checks give the total, failed, pending, and unknown counts of every check, and the names of the
failed checks among the first 100 that GitHub lists; \`failedNamesComplete\` is false when a
failed check is not named. A provider that cannot be read is reported as
unavailable rather than failing the whole read, and an unavailable fact gives no attention item. A successful build does not prove that the app
serves the expected content.`,
} as const;

export type RepositoryStatus = Infer<typeof getRepositoryStatusContract.returns>;
export type McpRepositoryStatus = Infer<typeof getRepositoryStatusContract.structuredContent>;
export type RepositoryAttentionItem = Infer<typeof vRepositoryAttentionItem>;
