import { exactly } from "@samebase/dependent/main";

import type { Id } from "../_generated/dataModel";
import { getConvexCodeLocationPath } from "../../shared/convexCodeLocation";
import { WORKER_PREVIEWS_MIGRATION_URL } from "../../shared/cloudflareWorkerPreviews";
import { cloudflareConfigureWorkersBuildsForGitHubContract } from "./contracts/cloudflareConfigureWorkersBuildsForGitHub";
import { cloudflareRotateConvexDeployKeysForWorkersBuildsContract } from "./contracts/cloudflareRotateConvexDeployKeysForWorkersBuilds";
import type {
  McpRepositoryStatus,
  RepositoryAttentionItem,
  RepositoryStatus,
} from "./contracts/getRepositoryStatus";
import type { UserRepositoryResult } from "./contracts/getUserRepositories";
import { retryInfrastructureProvisioningContract } from "./contracts/retryInfrastructureProvisioning";
import type { CloudflareWorkerConvexBuildAccessObservation } from "./providerObservationModel";
import { classifyRepositoryCheck, type RepositoryStatusCheckRollup } from "./pullRequestModel";

/*
The pure parts of repository:getStatus: the attention rules and the MCP projection. The Node read in
status.ts gathers the provider facts; this module decides what needs attention and which tool fixes
it, so the rules have unit tests without provider requests.
*/

const CONFIGURE_BUILDS_TOOL = cloudflareConfigureWorkersBuildsForGitHubContract.mcp.name;
const ROTATE_CONVEX_DEPLOY_KEYS_TOOL =
  cloudflareRotateConvexDeployKeysForWorkersBuildsContract.mcp.name;
const RETRY_PROVIDER_SETUP_TOOL = retryInfrastructureProvisioningContract.mcp.name;

export type RepositoryStatusRepository = Pick<
  UserRepositoryResult,
  "githubRepositoryFullName" | "providerSetup" | "cloudflareWorkers" | "convexProjects"
>;
export type RepositoryObservations = Omit<RepositoryStatus, "attention">;
type ConvexBuildAccess = Extract<
  CloudflareWorkerConvexBuildAccessObservation,
  { state: "available" }
>["convexBuildAccess"];

function compareRootDirectories(left: string, right: string): number {
  return left === right ? 0 : left === "/" ? -1 : right === "/" ? 1 : left.localeCompare(right);
}

/** Workers in overview order: by root directory, then name. */
function sortWorkers(workers: RepositoryStatusRepository["cloudflareWorkers"]) {
  return [...workers].sort(
    (left, right) =>
      compareRootDirectories(left.rootDirectory, right.rootDirectory) ||
      left.workerName.localeCompare(right.workerName) ||
      left.workerId.localeCompare(right.workerId),
  );
}

/** Convex projects by code location path. */
function sortConvexProjects(projects: RepositoryStatusRepository["convexProjects"]) {
  return [...projects].sort(
    (left, right) =>
      getConvexCodeLocationPath(left.codeLocation).localeCompare(
        getConvexCodeLocationPath(right.codeLocation),
      ) || left.convexProjectId.localeCompare(right.convexProjectId),
  );
}

function describeConvexBuildAccessProblem(workerName: string, access: ConvexBuildAccess): string {
  switch (access.state) {
    case "configured":
      return access.convexProject.state === "attached"
        ? `The Convex deploy keys of ${workerName} belong to another Convex team.`
        : `The Convex deploy keys of ${workerName} target a Convex project that is not attached to this repository.`;
    case "incomplete":
      return `The Convex deploy keys of ${workerName} are incomplete.`;
    case "not_configured":
      return `${workerName} has no Convex deploy keys.`;
    case "target_unknown":
      return `${workerName} has Convex deploy keys for an unknown Convex project.`;
    case "invalid":
      return `The Convex project marker of ${workerName} is invalid.`;
    default:
      access satisfies never;
      return `The Convex deploy keys of ${workerName} need repair.`;
  }
}

/**
The attention items of one repository, each with the tool that fixes it. An unreadable provider fact
gives no item: the facts report it as unavailable, and a guessed repair could be wrong.
*/
export function buildRepositoryAttention(args: {
  repository: RepositoryStatusRepository;
  observations: RepositoryObservations;
}): RepositoryAttentionItem[] {
  const { repository, observations } = args;
  const items: RepositoryAttentionItem[] = [];

  if (repository.providerSetup.status === "failed") {
    items.push({
      tool: RETRY_PROVIDER_SETUP_TOOL,
      problem: `Samebase setup of the ${repository.providerSetup.provider === "convex" ? "Convex project" : "Cloudflare Worker"} failed.`,
    });
  }

  const convexProjectsById = new Map(
    observations.convexProjects.map((project) => [project.convexProjectId, project]),
  );
  const convexProjectSlug = (convexProjectId: Id<"repositoryConvexProjects">): string | null => {
    const provider = convexProjectsById.get(convexProjectId)?.provider;
    return provider?.state === "current" ? provider.projectSlug : null;
  };
  const hasNoProductionDeployment = (convexProjectId: Id<"repositoryConvexProjects">): boolean => {
    const provider = convexProjectsById.get(convexProjectId)?.provider;
    return provider?.state === "current" && provider.productionDeployment.state === "missing";
  };

  for (const worker of sortWorkers(repository.cloudflareWorkers)) {
    const { workerName } = worker;
    const workerObservation = observations.workers.find(
      (observation) => observation.workerId === worker.workerId,
    );
    if (workerObservation?.state === "missing") {
      items.push({
        tool: null,
        problem: `The Cloudflare Worker ${workerName} no longer exists in the Cloudflare account.`,
      });
      continue;
    }
    const builds = observations.workerBuilds.find(
      (observation) => observation.workerId === worker.workerId,
    );
    if (builds?.state !== "available") {
      continue;
    }
    switch (builds.repository.state) {
      case "not_connected":
        items.push({
          tool: CONFIGURE_BUILDS_TOOL,
          workerName,
          problem: `Workers Builds of ${workerName} is not connected to this GitHub repository.`,
        });
        continue;
      case "connected_elsewhere":
        items.push({
          tool: null,
          problem: `Workers Builds of ${workerName} builds another GitHub repository. Change it in Cloudflare.`,
        });
        continue;
      case "ambiguous":
        items.push({
          tool: null,
          problem: `Workers Builds of ${workerName} has no single repository root. Fix its Builds settings in Cloudflare.`,
        });
        continue;
      case "failed":
        continue;
      case "ready":
        break;
      default:
        builds.repository satisfies never;
        continue;
    }
    if (builds.repository.builds.state === "legacy_previews") {
      items.push({
        tool: null,
        problem: `${workerName} does not use native Worker Previews. Migrate it first: ${WORKER_PREVIEWS_MIGRATION_URL}`,
      });
      continue;
    }
    if (builds.builds.state !== "connected") {
      items.push({
        tool: CONFIGURE_BUILDS_TOOL,
        workerName,
        problem: `The Workers Builds setup of ${workerName} is incomplete.`,
      });
      continue;
    }
    if (builds.builds.productionBuildTokenUuid !== builds.builds.previewBuildTokenUuid) {
      items.push({
        tool: CONFIGURE_BUILDS_TOOL,
        workerName,
        problem: `The production and preview builds of ${workerName} use different Workers Builds tokens.`,
      });
    } else if (builds.builds.productionBuildTokenUuid === null) {
      items.push({
        tool: CONFIGURE_BUILDS_TOOL,
        workerName,
        problem: `${workerName} has no Workers Builds token.`,
      });
    }

    const buildAccess = observations.workerConvexBuildAccess.find(
      (observation) => observation.workerId === worker.workerId,
    );
    if (buildAccess?.state !== "available" || repository.convexProjects.length === 0) {
      continue;
    }
    const access = buildAccess.convexBuildAccess;
    if (
      access.state === "configured" &&
      access.convexProject.state === "attached" &&
      access.convexProject.teamState === "matches"
    ) {
      continue;
    }
    const targetProjectId =
      (access.state === "configured" || access.state === "incomplete") &&
      access.convexProject.state === "attached"
        ? access.convexProject.convexProjectId
        : exactly(1, repository.convexProjects)
          ? repository.convexProjects[0].convexProjectId
          : null;
    // The deploy-first item of that project names this repair; a rotation would fail before it.
    if (targetProjectId !== null && hasNoProductionDeployment(targetProjectId)) {
      continue;
    }
    items.push({
      tool: ROTATE_CONVEX_DEPLOY_KEYS_TOOL,
      workerName,
      convexProjectName: targetProjectId === null ? null : convexProjectSlug(targetProjectId),
      problem:
        targetProjectId === null
          ? `${describeConvexBuildAccessProblem(workerName, access)} Ask the user which attached Convex project the Worker deploys with.`
          : describeConvexBuildAccessProblem(workerName, access),
    });
  }

  for (const project of sortConvexProjects(repository.convexProjects)) {
    const observation = convexProjectsById.get(project.convexProjectId);
    const codeLocation = getConvexCodeLocationPath(project.codeLocation);
    if (observation?.source.state === "missing") {
      items.push({
        tool: null,
        problem: `The Convex code location ${codeLocation} no longer exists on the default branch. Change it in the Samebase dashboard.`,
      });
    }
    const provider = observation?.provider;
    if (provider?.state === "missing_ambiguous") {
      items.push({
        tool: null,
        problem: `The Convex project at ${codeLocation} is missing from the connected Convex team. It may have moved to another team.`,
      });
    } else if (provider?.state === "current" && provider.productionDeployment.state === "missing") {
      items.push({
        tool: null,
        problem: `Deploy the Convex project ${provider.projectSlug} to production first. Samebase installs its deploy key after the production deployment exists.${repository.cloudflareWorkers.length > 0 ? ` Then call ${ROTATE_CONVEX_DEPLOY_KEYS_TOOL} for the Worker that deploys with it.` : ""}`,
      });
    }
  }
  return items;
}

/** Failed check names instead of the full check list. Null when the commit has no checks. */
function summarizeChecksForMcp(rollup: RepositoryStatusCheckRollup) {
  if (rollup === null || rollup.contexts.totalCount === 0) {
    return null;
  }
  const states = rollup.contexts.nodes.map((check) => ({
    name: check.kind === "check_run" ? check.name : check.context,
    state: classifyRepositoryCheck(check),
  }));
  return {
    total: rollup.contexts.totalCount,
    pending: states.filter((check) => check.state === "running").length,
    failed: states
      .filter((check) => check.state === "failure")
      .map((check) => check.name)
      .sort((left, right) => left.localeCompare(right)),
  };
}

/**
The MCP result: what the overview shows, without labels, line counts, node IDs, head SHAs,
attachment IDs, or provider failure reasons.
*/
export function projectRepositoryStatusForMcp(args: {
  repository: RepositoryStatusRepository;
  status: RepositoryStatus;
}): McpRepositoryStatus {
  const { repository, status } = args;
  const workers = sortWorkers(repository.cloudflareWorkers);
  const page = status.pullRequests.state === "available" ? status.pullRequests.page : null;
  const githubRepository = page?.repository ?? null;
  const defaultBranch = githubRepository?.defaultBranch ?? null;

  return {
    repository: repository.githubRepositoryFullName,
    defaultBranch: defaultBranch && {
      name: defaultBranch.name,
      headCommitTitle: defaultBranch.headCommitTitle,
      headCommitUrl: defaultBranch.headCommitUrl,
      checks: summarizeChecksForMcp(defaultBranch.statusCheckRollup),
    },
    openPullRequestCount: githubRepository?.pullRequests.totalCount ?? null,
    apps: workers.map((worker) => {
      const workerObservation = status.workers.find(
        (observation) => observation.workerId === worker.workerId,
      );
      const builds = status.workerBuilds.find(
        (observation) => observation.workerId === worker.workerId,
      );
      const productionBuild = builds?.state === "available" ? builds.productionBuild : null;
      return {
        workerName: worker.workerName,
        rootDirectory: worker.rootDirectory,
        productionBuild:
          productionBuild?.state === "available"
            ? {
                state: "available" as const,
                buildState: productionBuild.buildState,
                logsUrl: productionBuild.logsUrl,
              }
            : productionBuild?.state === "absent"
              ? { state: "absent" as const }
              : { state: "unavailable" as const },
        urls:
          workerObservation?.state === "available"
            ? [
                ...[...workerObservation.customDomains]
                  .sort((left, right) => left.localeCompare(right))
                  .map((hostname) => `https://${hostname}`),
                ...(workerObservation.workersDev.state === "enabled"
                  ? [workerObservation.workersDev.url]
                  : []),
              ]
            : [],
      };
    }),
    convexProjects: sortConvexProjects(repository.convexProjects).map((project) => {
      const provider = status.convexProjects.find(
        (observation) => observation.convexProjectId === project.convexProjectId,
      )?.provider;
      return {
        codeLocation: getConvexCodeLocationPath(project.codeLocation),
        projectSlug: provider?.state === "current" ? provider.projectSlug : null,
        productionDeployment:
          provider?.state !== "current"
            ? { state: "unavailable" as const }
            : provider.productionDeployment.state === "available"
              ? {
                  state: "available" as const,
                  deploymentName: provider.productionDeployment.deploymentName,
                  dashboardUrl: provider.productionDeployment.dashboardUrl,
                  region: provider.productionDeployment.region,
                }
              : { state: "missing" as const },
      };
    }),
    pullRequests: (githubRepository?.pullRequests.nodes ?? []).map((pullRequest) => {
      const resources = status.pullRequestResources.find(
        (read) => read.pullRequestId === pullRequest.id,
      );
      return {
        number: pullRequest.number,
        title: pullRequest.title,
        url: pullRequest.url,
        isDraft: pullRequest.isDraft,
        headRefName: pullRequest.headRefName,
        checks: summarizeChecksForMcp(pullRequest.statusCheckRollup),
        apps:
          resources?.state === "available"
            ? resources.workers.map((resource) => ({
                workerName: resource.workerName,
                previewBuild:
                  resource.cloudflareBuild.state === "available"
                    ? {
                        state: "available" as const,
                        buildState: resource.cloudflareBuild.buildState,
                        logsUrl: resource.cloudflareBuild.logsUrl,
                      }
                    : { state: "unavailable" as const },
                previewUrl:
                  resource.cloudflareBranchPreview.state === "available"
                    ? resource.cloudflareBranchPreview.url
                    : null,
              }))
            : workers.map((worker) => ({
                workerName: worker.workerName,
                previewBuild: { state: "unavailable" as const },
                previewUrl: null,
              })),
      };
    }),
    attention: status.attention,
  };
}
