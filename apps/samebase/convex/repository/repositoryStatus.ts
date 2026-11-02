import { exactly } from "@samebase/dependent/main";

import type { Id } from "../_generated/dataModel";
import { getConvexCodeLocationPath } from "../../shared/convexCodeLocation";
import { WORKER_PREVIEWS_MIGRATION_URL } from "../../shared/cloudflareWorkerPreviews";
import {
  getRepositoryStatusContract,
  type McpRepositoryStatus,
  type RepositoryAttentionItem,
  type RepositoryStatus,
} from "./contracts/getRepositoryStatus";
import {
  getUserRepositoriesContract,
  type ProviderSetupSummary,
  type UserRepositoryResult,
} from "./contracts/getUserRepositories";
import { retryInfrastructureProvisioningContract } from "./contracts/retryInfrastructureProvisioning";
import type { CloudflareWorkerConvexBuildAccessObservation } from "./providerObservationModel";
import type { RepositoryActionsCiSecrets } from "./provisioningModel";
import {
  isSamebaseManagedProviderPlan,
  readProviderInfrastructureWriter,
} from "./provisioningPlan";
import { classifyRepositoryCheck, type RepositoryStatusCheckRollup } from "./pullRequestModel";
import { summarizeRepositoryChecks } from "../../shared/repositoryChecks";

/*
The pure parts of repository:getStatus: the attention rules and the MCP projection. The Node read in
status.ts gathers the provider facts; this module decides what needs attention and what to do about
it, so the rules have unit tests without provider requests.
*/

const LIST_TOOL = getUserRepositoriesContract.mcp.name;
const RETRY_PROVIDER_SETUP_TOOL = retryInfrastructureProvisioningContract.mcp.name;
const STATUS_TOOL = getRepositoryStatusContract.mcp.name;
const ALCHEMY_MOVE_GUIDE_URL = "https://samebase.com/docs/the-big-migration";

export type RepositoryStatusRepository = Pick<
  UserRepositoryResult,
  | "githubRepositoryFullName"
  | "providerSetup"
  | "providerPlan"
  | "cloudflareWorkers"
  | "convexProjects"
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

function describeSetupProvider(
  provider: Extract<ProviderSetupSummary, { status: "running" | "failed" }>["provider"],
): string {
  switch (provider) {
    case "convex":
      return "Convex project";
    case "cloudflare":
      return "Cloudflare Worker";
    case "github":
      return "GitHub Actions secrets";
    default:
      provider satisfies never;
      return "provider";
  }
}

/**
The managed plan that created GitHub and Convex without a Workers Builds token. It names the Worker
and root directory of the first Cloudflare setup. Null when the plan selected a token, its Convex
project is not attached, or a Worker is already attached.
*/
function readPendingCloudflareSetup(
  repository: Pick<UserRepositoryResult, "providerPlan" | "cloudflareWorkers" | "convexProjects">,
) {
  const plan = repository.providerPlan;
  if (
    !isSamebaseManagedProviderPlan(plan) ||
    plan.cloudflare.state !== "planned" ||
    plan.cloudflare.buildTokenUuid !== null ||
    plan.convex.state !== "created" ||
    repository.cloudflareWorkers.length > 0
  ) {
    return null;
  }

  const plannedProjectId = plan.convex.projectId;
  const plannedTeamId = plan.convex.teamId;
  const isPlannedProjectAttached = repository.convexProjects.some(
    (attachment) =>
      attachment.projectId === plannedProjectId &&
      attachment.teamId === plannedTeamId &&
      attachment.codeLocation.kind === "config" &&
      attachment.codeLocation.convexConfigPath === plan.convexConfigPath,
  );
  if (!isPlannedProjectAttached) {
    return null;
  }
  return { workerName: plan.cloudflare.workerName, rootDirectory: plan.cloudflare.rootDirectory };
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

/** Samebase repairs no provider resource, so an item about one says where its repair lives. */
function describeRepair(plan: RepositoryStatusRepository["providerPlan"]): string {
  const writer = readProviderInfrastructureWriter(plan);
  switch (writer) {
    case "samebase":
      return `Samebase does not repair this: move the app to Alchemy and fix it in the stack (${ALCHEMY_MOVE_GUIDE_URL}).`;
    case "setup_stack":
      return "The setup stack in alchemy.run.ts owns this setting: change the stack, or run the alchemy workflow on the default branch to repair it.";
    default:
      writer satisfies never;
      throw new Error("Unsupported provider infrastructure writer.");
  }
}

/**
The attention of a repository that its GitHub Actions set up, after Samebase's own setup finished:
the Actions secrets, then the deployment that the setup status waits for. A setup status that is
done or unreadable gives no item, like any other unreadable fact. Its attached Workers and Convex
projects get the same items as any other repository, with the repair of its setup stack.
*/
function buildRepositoryActionsAttention(args: {
  repository: RepositoryStatusRepository;
  ciSecrets: RepositoryActionsCiSecrets;
  setupStack: RepositoryStatus["setupStack"];
}): RepositoryAttentionItem[] {
  const repositoryFullName = args.repository.githubRepositoryFullName;
  switch (args.ciSecrets.state) {
    case "planned":
      return [
        {
          tool: null,
          problem: `The GitHub Actions secrets of ${repositoryFullName} are not written yet, so its deploy workflow cannot run.`,
        },
      ];
    case "written":
      return args.setupStack?.state === "in_progress"
        ? [
            {
              tool: null,
              problem: `The first deployment of ${repositoryFullName} is in progress in its GitHub Actions: https://github.com/${repositoryFullName}/actions. Call ${STATUS_TOOL} again when the run finishes.`,
            },
          ]
        : [];
    default:
      args.ciSecrets satisfies never;
      return [];
  }
}

/**
The attention items of one repository. The provider setup state comes first: a running setup can
still change what the other items report, and a failed one is repaired only by its retry. An
unreadable provider fact gives no item: the facts report it as unavailable, and a guessed repair
could be wrong.
*/
export function buildRepositoryAttention(args: {
  repository: RepositoryStatusRepository;
  observations: RepositoryObservations;
}): RepositoryAttentionItem[] {
  const { repository, observations } = args;
  const { providerSetup } = repository;
  switch (providerSetup.status) {
    case "running":
      return [
        {
          tool: null,
          problem: `Samebase setup of the ${describeSetupProvider(providerSetup.provider)} is running. Call ${STATUS_TOOL} again when ${LIST_TOOL} shows provider setup ready or failed.`,
        },
      ];
    case "failed":
      return [
        {
          tool: RETRY_PROVIDER_SETUP_TOOL,
          problem: `Samebase setup of the ${describeSetupProvider(providerSetup.provider)} failed.`,
        },
      ];
    case "ready":
    case "not_applicable":
      break;
    default:
      providerSetup satisfies never;
      return [];
  }

  const plan = repository.providerPlan;
  const resourceItems = buildResourceAttention({ repository, observations });
  if (plan && !isSamebaseManagedProviderPlan(plan)) {
    return [
      ...buildRepositoryActionsAttention({
        repository,
        ciSecrets: plan.ciSecrets,
        setupStack: observations.setupStack,
      }),
      ...resourceItems,
    ];
  }
  return resourceItems;
}

/** The items of the attached Workers and Convex projects, with the repair that their writer allows. */
function buildResourceAttention(args: {
  repository: RepositoryStatusRepository;
  observations: RepositoryObservations;
}): RepositoryAttentionItem[] {
  const { repository, observations } = args;
  const repair = describeRepair(repository.providerPlan);
  const items: RepositoryAttentionItem[] = [];
  const pendingCloudflareSetup = readPendingCloudflareSetup(repository);
  if (pendingCloudflareSetup) {
    const { rootDirectory, workerName } = pendingCloudflareSetup;
    items.push({
      tool: null,
      problem: `Cloudflare setup is pending because the Cloudflare account had no Workers Builds token. The planned Worker is ${workerName} at root directory ${rootDirectory}. ${repair}`,
    });
  }

  const convexProjectsById = new Map(
    observations.convexProjects.map((project) => [project.convexProjectId, project]),
  );
  const currentConvexProject = (convexProjectId: Id<"repositoryConvexProjects">) => {
    const provider = convexProjectsById.get(convexProjectId)?.provider;
    return provider?.state === "current" ? provider : null;
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
          tool: null,
          problem: `Workers Builds of ${workerName} is not connected to this GitHub repository. ${repair}`,
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
        tool: null,
        problem: `The Workers Builds setup of ${workerName} is incomplete. ${repair}`,
      });
      continue;
    }
    if (builds.builds.productionBuildTokenUuid !== builds.builds.previewBuildTokenUuid) {
      items.push({
        tool: null,
        problem: `The production and preview builds of ${workerName} use different Workers Builds tokens. ${repair}`,
      });
    } else if (builds.builds.productionBuildTokenUuid === null) {
      items.push({
        tool: null,
        problem: `${workerName} has no Workers Builds token. ${repair}`,
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
    if (targetProjectId === null) {
      // Without a readable Convex team the facts are unavailable.
      if (
        repository.convexProjects.every((project) => currentConvexProject(project.convexProjectId))
      ) {
        items.push({
          tool: null,
          problem: `${describeConvexBuildAccessProblem(workerName, access)} Ask the user which attached Convex project the Worker deploys with. ${repair}`,
        });
      }
      continue;
    }
    const targetProject = currentConvexProject(targetProjectId);
    // An unreadable project gives no item. A project without a production deployment gets the
    // deploy-first item below instead, because it has no deployment to make keys for.
    if (targetProject === null || targetProject.productionDeployment.state === "missing") {
      continue;
    }
    items.push({
      tool: null,
      problem: `${describeConvexBuildAccessProblem(workerName, access)} It needs the deploy keys of the Convex project ${targetProject.projectSlug}. ${repair}`,
    });
  }

  for (const project of sortConvexProjects(repository.convexProjects)) {
    const observation = convexProjectsById.get(project.convexProjectId);
    const codeLocation = getConvexCodeLocationPath(project.codeLocation);
    if (observation?.source.state === "missing") {
      items.push({
        tool: null,
        problem: `The Convex code location ${codeLocation} no longer exists on the default branch. ${repair}`,
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
        problem: `Deploy the Convex project ${provider.projectSlug} to production first.${repository.cloudflareWorkers.length > 0 ? ` The Worker that deploys with it then needs its deploy keys. ${repair}` : ""}`,
      });
    }
  }
  return items;
}

/**
The counts of every check from GitHub's aggregate counts, and the names of the failed checks among
the listed nodes. Null when the commit has no checks.
*/
function summarizeChecksForMcp(rollup: RepositoryStatusCheckRollup) {
  if (rollup === null || rollup.contexts.totalCount === 0) {
    return null;
  }
  const summary = summarizeRepositoryChecks(rollup);
  const failedNames = rollup.contexts.nodes
    .filter((check) => classifyRepositoryCheck(check) === "failure")
    .map((check) => (check.kind === "check_run" ? check.name : check.context))
    .sort((left, right) => left.localeCompare(right));
  return {
    total: summary.totalCount,
    failed: summary.failureCount,
    pending: summary.runningCount,
    unknown: summary.unknownCount,
    failedNames,
    failedNamesComplete: failedNames.length >= summary.failureCount,
  };
}

/**
The MCP result: what the overview shows, without labels, line counts, node IDs, head SHAs,
attachment IDs, or provider failure reasons. Checks give counts and failed check names, not the
full check list.
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
                commit:
                  !productionBuild.commitHash || !defaultBranch
                    ? ("unknown" as const)
                    : productionBuild.commitHash.toLowerCase() ===
                        defaultBranch.headCommitOid.toLowerCase()
                      ? ("matches_head" as const)
                      : ("behind_head" as const),
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
        // Unread Cloudflare builds list no Workers; each app is then unavailable, not absent.
        apps:
          resources?.state === "available" && resources.cloudflareBuilds.state === "available"
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
    setupStack: status.setupStack,
    attention: status.attention,
  };
}
